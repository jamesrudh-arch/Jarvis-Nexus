"""UV automation: every exported mesh must carry a valid UV map.

Headless-safe implementation: ``bpy.ops.uv.smart_project`` segfaults in
module-mode Blender on large joined meshes (verified: 20k-poly SM_House),
so ``ensure_uv`` computes a per-face BOX PROJECTION via bmesh directly —
no operators, deterministic, and well-suited to architectural parts (each
face projects onto its dominant axis, normalised into 0..1).
"""

import bpy


def _dominant_axis(normal):
    ax, ay, az = abs(normal.x), abs(normal.y), abs(normal.z)
    if ax >= ay and ax >= az:
        return ("YZ", 1 if normal.x >= 0 else -1)
    if ay >= az:
        return ("XZ", 1 if normal.y >= 0 else -1)
    return ("XY", 1 if normal.z >= 0 else -1)


def ensure_uv(obj: bpy.types.Object, name: str = "UVMap") -> bool:
    """Guarantee a non-empty, non-degenerate UV layer via bmesh box
    projection (blueprint validation checks 'UV availability' + validity)."""
    if obj.type != "MESH":
        return False
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name=name)
    uv = obj.data.uv_layers[0]

    mesh = obj.data
    # gather loop verts for projection
    import math
    for poly in mesh.polygons:
        axis, _sign = _dominant_axis(poly.normal)
        if axis == "YZ":
            pts = [(mesh.vertices[i].co.y, mesh.vertices[i].co.z) for i in poly.vertices]
        elif axis == "XZ":
            pts = [(mesh.vertices[i].co.x, mesh.vertices[i].co.z) for i in poly.vertices]
        else:
            pts = [(mesh.vertices[i].co.x, mesh.vertices[i].co.y) for i in poly.vertices]
        if not pts:
            continue
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        span_x = max(xs) - min(xs); span_y = max(ys) - min(ys)
        span = max(span_x, span_y, 1e-6)
        # normalise each face into 0..1 (keeps aspect, avoids overlap noise
        # between coplanar faces; overlaps are acceptable for tiling textures)
        us = [(p[0] - min(xs)) / span for p in pts]
        vs = [(p[1] - min(ys)) / span for p in pts]
        for n, li in enumerate(poly.loop_indices):
            uv.data[li].uv = (us[n], vs[n])

    coords = list(uv.data)
    if not coords:
        return False
    xs = [c.uv.x for c in coords]; ys = [c.uv.y for c in coords]
    return (max(xs) - min(xs)) > 0.01 or (max(ys) - min(ys)) > 0.01
