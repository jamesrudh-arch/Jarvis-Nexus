#!/usr/bin/env python3
"""JARVIS NEXUS — batch export to Unreal interchange + metadata JSONs.

Format decision (documented per blueprint): **glTF 2.0 (.glb)**.

  Why GLB over FBX/USD for this project:
  * lossless PBR (Principled BSDF -> metallic/roughness) round-trip;
  * single self-contained binary (packed T_* textures travel inside);
  * UE 5.5 imports GLB directly as Static Mesh + Materials;
  * collision (COL_*) and LODs (_LOD1/_LOD2) survive via naming, which
    world/Unreal/Python/import_blender_assets.py maps to UE conventions;
  * FBX adds SDK licensing complexity with no gain for static architecture;
    USD is reserved for the larger Phase-5 world assembly where layers,
    variants and references actually matter.

Exports every architecture/*.blend + assets/*.blend into export/ with a
sidecar <asset>.meta.json (the same metadata packed in the .blend).
"""

import glob
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # world/Blender  (HERE == scripts/)
EXPORT_DIR = os.path.join(ROOT, "export")


def export_blend(path: str) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.open_mainfile(filepath=path)
    base = os.path.splitext(os.path.basename(path))[0]
    out_glb = os.path.join(EXPORT_DIR, f"{base}.glb")
    meta_out = {}
    for txt in bpy.data.texts:
        if txt.name.startswith("META_"):
            try:
                meta_out = json.loads(txt.as_string())
            except Exception:
                meta_out = {}
    # export ONLY SM_* + COL_* meshes (skip preview cam/sun)
    for obj in bpy.data.objects:
        obj.select_set(obj.type == "MESH" and obj.name.startswith(("SM_", "COL_")))
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format="GLB",
        use_selection=True,
        export_apply=True,          # apply modifiers on export
        export_yup=True,            # glTF convention; UE importer converts back
        export_materials="EXPORT",
        export_image_format="AUTO", # packed T_* textures embedded in the GLB
        export_skins=False,
        export_animations=False,
    )
    meta_path = os.path.join(EXPORT_DIR, f"{base}.meta.json")
    with open(meta_path, "w", encoding="utf-8") as fh:
        json.dump(meta_out, fh, indent=2)
    return {"blend": os.path.relpath(path, ROOT),
            "glb": os.path.relpath(out_glb, ROOT),
            "meta": os.path.relpath(meta_path, ROOT),
            "glb_bytes": os.path.getsize(out_glb)}


def main():
    os.makedirs(EXPORT_DIR, exist_ok=True)
    blends = sorted(glob.glob(os.path.join(ROOT, "architecture", "*.blend"))
                    + glob.glob(os.path.join(ROOT, "assets", "*.blend")))
    if not blends:
        print("no .blend assets found — run build_assets.py first", file=sys.stderr)
        sys.exit(1)
    results = [export_blend(p) for p in blends]
    out = os.path.join(EXPORT_DIR, "ExportReport.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"blender": bpy.app.version_string, "exports": results}, fh, indent=2)
    print(json.dumps(results, indent=2))
    print(f"[export] report -> {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
