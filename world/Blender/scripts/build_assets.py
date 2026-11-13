#!/usr/bin/env python3
"""JARVIS NEXUS — asset build driver (blueprint Part 6).

Creates the three REAL initial assets as actual .blend project files:

  1. architecture/SM_House.blend        (LOD0 15k–40k tris)
  2. architecture/SM_Shop.blend         (LOD0 20k–50k tris)
  3. assets/SM_Prop_StreetLamp.blend    (LOD0 500–5k tris)

Each .blend contains SM_*_LOD0 + _LOD1 + _LOD2, COL_* collision meshes,
M_* materials, packed T_* textures and a META_* text datablock (metadata
JSON). Run under a real Blender runtime:

  editor:   Blender > Scripts > Open this file (repo on path)
  headless: .venvs/blender/bin/python world/Blender/scripts/build_assets.py
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from nexusblender import architecture, props                     # noqa: E402
from nexusblender import collision as nb_collision               # noqa: E402
from nexusblender import lods as nb_lods                         # noqa: E402
from nexusblender import metadata as nb_metadata                 # noqa: E402
from nexusblender.naming import TRI_BUDGETS                      # noqa: E402
from nexusblender.trimesh import total_triangles                 # noqa: E402
from nexusblender.uvmap import ensure_uv                         # noqa: E402

ROOT = os.path.dirname(HERE)  # world/Blender  (HERE == scripts/)


def _clean_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                  bpy.data.texts, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            if block == bpy.data.images and item.name in {"Viewer Node", "Render Result"}:
                continue
            block.remove(item, do_unlink=True)


def _build_asset(asset_key, builder, collision_fn, blend_relpath):
    _clean_scene()
    lod0 = builder()
    if not ensure_uv(lod0):
        raise RuntimeError(f"{lod0.name}: UV generation failed")
    lod_records = nb_lods.generate_lods(lod0, asset_key, TRI_BUDGETS[
        "house" if asset_key == "House" else "shop" if asset_key == "Shop" else "prop"])
    collision_objs = collision_fn()
    nb_collision.attach_hierarchy(lod0, collision_objs + [bpy.data.objects[r["name"]] for r in lod_records])
    # camera + sun for the scene/ preview renders (scenes/ directory purpose)
    bpy.ops.object.camera_add(location=(12, -12, 8), rotation=(1.1, 0, 0.785))
    cam = bpy.context.active_object
    cam.name = "PreviewCam"
    bpy.ops.object.light_add(type="SUN", location=(6, -4, 12))
    bpy.context.active_object.data.energy = 3.0
    bpy.context.active_object.name = "PreviewSun"
    meta = nb_metadata.build_metadata(
        asset_key, lod0, lod_records,
        source_script=f"world/Blender/scripts/nexusblender/"
                      f"{'architecture.py' if asset_key != 'Prop_StreetLamp' else 'props.py'}",
        extra={"collision": [o.name for o in collision_objs]})
    nb_metadata.store_in_blend(asset_key, meta)
    out = os.path.join(ROOT, blend_relpath)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    return {"asset": asset_key, "blend": blend_relpath,
            "triangles_LOD0": meta["triangle_count"]["LOD0"],
            "lods": lod_records,
            "collision": [o.name for o in collision_objs],
            "dimensions_m": meta["dimensions_m"]}


def _house_collision():
    import math
    col = [
        nb_collision.add_box_collision("House", "Body", (8.4, 6.4, 3.1), (0, 0, 1.9)),
        nb_collision.add_box_collision("House", "RoofL", (8.9, 3.4, 0.2),
                                       (0, -1.6, 4.15)),
        nb_collision.add_box_collision("House", "RoofR", (8.9, 3.4, 0.2),
                                       (0, 1.6, 4.15)),
        nb_collision.add_box_collision("House", "RoofPeak", (8.9, 0.9, 1.1),
                                       (0, 0, 4.75)),
        nb_collision.add_box_collision("House", "Chimney", (0.8, 0.8, 1.7),
                                       (2.2, -0.9, 4.6)),
        nb_collision.add_box_collision("House", "Porch", (2.8, 1.6, 2.4),
                                       (0, 3.7, 1.7)),
    ]
    return col


def _shop_collision():
    return [
        nb_collision.add_box_collision("Shop", "Body", (10.4, 8.4, 4.4), (0, 0, 2.2)),
        nb_collision.add_box_collision("Shop", "Parapet", (10.5, 8.5, 0.75), (0, 0, 4.55)),
        nb_collision.add_box_collision("Shop", "Awning", (9.2, 2.2, 0.35), (0, 4.9, 3.0)),
    ]


def _lamp_collision():
    return [
        nb_collision.add_cylinder_collision("Prop_StreetLamp", "Pole", 0.12, 4.0,
                                            (0, 0, 2.0)),
        nb_collision.add_cylinder_collision("Prop_StreetLamp", "Head", 0.35, 0.25,
                                            (0.62, 0, 4.3)),
        nb_collision.add_cylinder_collision("Prop_StreetLamp", "Base", 0.26, 0.12,
                                            (0, 0, 0.06)),
    ]


def main():
    # single-asset mode (--asset NAME): the launcher runs each asset in its
    # own process because Blender's allocator never returns freed memory to
    # the OS — one process per asset keeps the 4 GB sandbox headroom safe.
    if "--asset" in sys.argv:
        idx = sys.argv.index("--asset")
        which = sys.argv[idx + 1]
        jobs = {"House": ("House", architecture.build_house, _house_collision,
                          os.path.join("architecture", "SM_House.blend")),
                "Shop": ("Shop", architecture.build_shop, _shop_collision,
                         os.path.join("architecture", "SM_Shop.blend")),
                "Prop_StreetLamp": ("Prop_StreetLamp", props.build_street_lamp,
                                    _lamp_collision,
                                    os.path.join("assets", "SM_Prop_StreetLamp.blend"))}
        result = _build_asset(*jobs[which])
        print(json.dumps(result, indent=2))
        return
    import subprocess
    results = []
    for key in ("House", "Shop", "Prop_StreetLamp"):
        proc = subprocess.run([sys.executable, os.path.abspath(__file__),
                               "--asset", key], capture_output=True, text=True)
        tail = proc.stdout.strip().splitlines()
        if proc.returncode != 0:
            print(f"[build] {key} FAILED rc={proc.returncode}")
            print(proc.stdout[-1500:]); print(proc.stderr[-1500:], file=sys.stderr)
            sys.exit(proc.returncode)
        results.append(json.loads(tail[-1]) if tail and tail[-1].startswith("{") else {"asset": key})
    report_path = os.path.join(ROOT, "validation", "BuildReport.json")
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as fh:
        json.dump({"generated_utc": nb_metadata.datetime.datetime.utcnow().isoformat() + "Z",
                   "blender": bpy.app.version_string, "assets": results}, fh, indent=2)
    print(json.dumps(results, indent=2))
    print(f"[build] report -> {report_path}")


if __name__ == "__main__":
    main()
