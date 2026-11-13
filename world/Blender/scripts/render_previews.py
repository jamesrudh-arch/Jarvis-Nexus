#!/usr/bin/env python3
"""JARVIS NEXUS — render validation previews of each built asset.

Cycles CPU (the sandbox has no GPU; EEVEE needs a GL context). Low samples:
these are evidence renders, not beauty shots. Output:
validation/previews/<asset>.png — attached to the phase evidence.
"""

import glob
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # world/Blender


def render_blend(path: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.open_mainfile(filepath=path)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.render.resolution_x = 720
    scene.render.resolution_y = 405
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    # frame the asset: aim the existing PreviewCam at SM_*_LOD0
    cam = bpy.data.objects.get("PreviewCam")
    asset = next((o for o in bpy.data.objects if o.name.startswith("SM_") and not o.name[3:].startswith("_")), None)
    if asset is None:
        raise RuntimeError(f"{path}: no SM_ asset to frame")
    if cam is None:
        bpy.ops.object.camera_add(location=(12, -12, 8))
        cam = bpy.context.active_object
        cam.name = "PreviewCam"
    import mathutils
    center = mathutils.Vector((0, 0, 0))
    for c in asset.bound_box:
        center += mathutils.Vector(c)
    center = center / 8 + asset.matrix_world.translation
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    base = os.path.splitext(os.path.basename(path))[0]
    out = os.path.join(ROOT, "validation", "previews", f"{base}.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    return out


def main():
    blends = sorted(glob.glob(os.path.join(ROOT, "architecture", "*.blend"))
                    + glob.glob(os.path.join(ROOT, "assets", "*.blend")))
    for p in blends:
        out = render_blend(p)
        print(f"[preview] {os.path.relpath(p, ROOT)} -> {os.path.relpath(out, ROOT)}"
              f" ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()
