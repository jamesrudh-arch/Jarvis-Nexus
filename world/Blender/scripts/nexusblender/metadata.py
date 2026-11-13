"""Metadata generation (blueprint: every exported asset must include
Author / Licence / Source / Triangle count / Dimensions / Scale / Export
format) — stored BOTH as a packed text datablock inside the .blend and as a
JSON file next to the export.
"""

import datetime
import json

import bpy

from .naming import PREFIX_MATERIAL, PREFIX_TEXTURE
from .trimesh import dimensions_m, evaluated_triangle_count

AUTHOR = "JARVIS NEXUS procedural asset pipeline (Blender 5.x)"
LICENCE = "Proprietary — JARVIS NEXUS project asset (owner: jamesrudh-arch)"
EXPORT_FORMAT = "glTF 2.0 (.glb) — chosen over FBX/USD for the Blender->Unreal "
"hop: lossless PBR material round-trip, single self-contained binary file, "
"native packed textures, and UE 5.5 imports it as Static Mesh with "
"collision + LODs preserved via naming conventions."
SCALE = "1 unit = 1 metre (Blender metres; Unreal 1 UU = 1 cm via x100 on import)"


def build_metadata(asset: str, lod0: bpy.types.Object, lod_records: list,
                   source_script: str, extra: dict = None) -> dict:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    return {
        "asset": asset,
        "author": AUTHOR,
        "licence": LICENCE,
        "source": f"procedural — {source_script}",
        "triangle_count": {
            "LOD0": evaluated_triangle_count(lod0, depsgraph),
            **{r["name"].split("_LOD")[-1]: r["triangles"] for r in lod_records},
        },
        "dimensions_m": dimensions_m(lod0),
        "scale": SCALE,
        "export_format": EXPORT_FORMAT,
        "materials": sorted({m.name for o in bpy.data.objects
                              if o.name.startswith(("SM_" + asset, "COL_"))
                              for m in o.data.materials
                              if m.name.startswith(PREFIX_MATERIAL)}),
        "textures": sorted({i.name for i in bpy.data.images
                            if i.name.startswith(PREFIX_TEXTURE)}),
        "generated_utc": datetime.datetime.utcnow().isoformat() + "Z",
        **(extra or {}),
    }


def store_in_blend(asset: str, meta: dict):
    """Pack the metadata JSON as a text datablock (self-documenting .blend)."""
    name = f"META_{asset}"
    txt = bpy.data.texts.get(name)
    if txt is None:
        txt = bpy.data.texts.new(name)
    txt.clear()
    txt.write(json.dumps(meta, indent=2))


def write_json(path: str, meta: dict):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
