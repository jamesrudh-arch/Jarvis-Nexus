"""LOD generation: _LOD1 ~ 50%, _LOD2 ~ 20% of LOD0 (blueprint).

Uses the Decimate modifier and APPLIES it, so the exported geometry is
genuinely reduced (not modifier-dependent). Ratio is tuned iteratively
against the real evaluated triangle count to land near the target.
"""

import bpy

from .naming import LOD_SUFFIXES, LOD_RATIOS
from .trimesh import evaluated_triangle_count


def _decimate_to(obj: bpy.types.Object, target_ratio: float) -> int:
    """Apply decimation and return the achieved triangle count."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    base = evaluated_triangle_count(obj, depsgraph)
    bpy.context.view_layer.objects.active = obj
    ratio = max(0.02, min(1.0, target_ratio))
    mod = obj.modifiers.new("Decimate", "DECIMATE")
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=mod.name)
    got = evaluated_triangle_count(obj, None)
    # one refinement pass if we are off the target by > 15 %
    if base > 0 and abs(got / base - target_ratio) > 0.15 and got > 0:
        # decimate is already applied; run a second pass on the result
        mod = obj.modifiers.new("Decimate2", "DECIMATE")
        mod.ratio = max(0.05, min(1.0, target_ratio * base / got))
        bpy.ops.object.modifier_apply(modifier=mod.name)
        got = evaluated_triangle_count(obj, None)
    return got


def generate_lods(source: bpy.types.Object, asset: str,
                  budget_lod0: tuple) -> list:
    """Build SM_<Asset>_LOD1 (~50%) and SM_<Asset>_LOD2 (~20%) from LOD0."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    base_tris = evaluated_triangle_count(source, depsgraph)
    lo_min, lo_max = budget_lod0
    if not (lo_min <= base_tris <= lo_max):
        raise AssertionError(
            f"{source.name}: LOD0 {base_tris} tris outside budget {budget_lod0}")

    created = []
    for lod_index in (1, 2):
        target_name = f"SM_{asset}{LOD_SUFFIXES[lod_index]}"
        old = bpy.data.objects.get(target_name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
        lod = source.copy()
        lod.data = source.data.copy()
        lod.name = target_name
        bpy.context.collection.objects.link(lod)
        got = _decimate_to(lod, LOD_RATIOS[lod_index])
        created.append({"name": target_name, "triangles": got,
                        "ratio_of_lod0": round(got / base_tris, 3)})
    return created
