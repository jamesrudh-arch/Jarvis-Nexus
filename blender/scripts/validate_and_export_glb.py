"""Headless pipeline script — validate + re-export the character GLB.

Usage (real Blender on the owner's machine or CI):
    blender --background --python validate_and_export_glb.py -- <input.glb> <output.glb>

Used by the P1 asset-pipeline step (KTX2/meshopt run via gltf-transform AFTER
this structural validation passes). No GPU required — runs on any host with
Blender 4.x installed.
"""
import json
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

report = {"input": src, "objects": [], "armatures": [], "shape_keys": 0}
for obj in bpy.data.objects:
    entry = {"name": obj.name, "type": obj.type, "tris": 0}
    if obj.type == "MESH":
        entry["tris"] = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        if obj.data.shape_keys:
            report["shape_keys"] += len(obj.data.shape_keys.key_blocks)
    report["objects"].append(entry)
    if obj.type == "ARMATURE":
        report["armatures"].append({"name": obj.name, "bones": len(obj.data.bones)})

bpy.ops.export_scene.gltf(
    filepath=dst, export_format="GLB", export_apply=True,
    export_morph=True, export_skins=True,
)
report["output"] = dst
print("JN_VALIDATION_JSON:" + json.dumps(report))
