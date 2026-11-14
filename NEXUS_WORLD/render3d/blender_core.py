"""Blender-side core (runs INSIDE the bpy 5.3 venv, Python 3.13).

Builds the NEXUS WORLD 3D scene from a pure-JSON scene spec produced by
render3d/spec.py (py3.12 side), renders with Cycles CPU, and exports to
USD / glTF / FBX (the Blender→Unreal asset pipeline, Blender side).

This module is imported ONLY by:
  * render3d/blender_script.py  (direct subprocess driver)
  * mcp_servers/blender_server.py (MCP stdio server)
It never touches the WorldStore — the spec JSON is the only input, so
the 3D layer stays decoupled from persistence (no duplicated state).

Documented simplifications (Tier 0): buildings are boxes with kind
materials; residents are body+head markers coloured by current action;
movement animation is keyframed straight-line; day/night from the world
clock; weather tints the sky.
"""
from __future__ import annotations

import json
import math
import os
import time


def _result(**kw) -> str:
    return json.dumps(kw, sort_keys=True)


def _clear_scene() -> None:
    import bpy
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)


def _material(name: str, color, roughness: float = 0.85,
              emission: float = 0.0):
    import bpy
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        if emission > 0.0:
            bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def _add_box(name: str, x: float, y: float, w: float, d: float, h: float,
             mat) -> None:
    import bpy
    # NOTE: Blender 5.x primitive_*_add ops silently ignore the legacy
    # `scale=` kwarg — dimensions must be set on the object after creation
    # (verified by scene probe: scale kwarg left objects at 1×1×1).
    bpy.ops.mesh.primitive_cube_add(size=1,
                                    location=(x + w / 2, y + d / 2, h / 2))
    obj = bpy.context.active_object
    obj.scale = (w, d, h)
    obj.name = name
    obj.data.materials.append(mat)


def _add_plane(name: str, x: float, y: float, w: float, d: float, z: float,
               mat) -> None:
    import bpy
    bpy.ops.mesh.primitive_plane_add(size=1,
                                     location=(x + w / 2, y + d / 2, z))
    obj = bpy.context.active_object
    obj.scale = (w, d, 1.0)
    obj.name = name
    obj.data.materials.append(mat)


def build(spec: dict) -> str:
    """Build the full world scene from a spec (see render3d/spec.py)."""
    import bpy
    t0 = time.time()
    _clear_scene()
    b = spec.get("bounds", [0, 0, 100, 100])
    minx, miny, maxx, maxy = b
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    span = max(maxx - minx, maxy - miny)

    ground_mat = _material("nx_ground", (0.32, 0.42, 0.30), 0.95)
    road_mat = _material("nx_road", (0.13, 0.13, 0.14), 0.9)
    _add_plane("nx_ground", minx, miny, maxx - minx, maxy - miny, 0.0,
               ground_mat)

    for i, road in enumerate(spec.get("roads", [])):
        rw = road["width"]
        x1, y1, x2, y2 = road["x1"], road["y1"], road["x2"], road["y2"]
        if abs(y2 - y1) < 1e-6:                       # horizontal
            _add_plane(f"nx_road_h{i}", min(x1, x2), y1 - rw / 2,
                       abs(x2 - x1), rw, 0.02, road_mat)
        else:                                          # vertical
            _add_plane(f"nx_road_v{i}", x1 - rw / 2, min(y1, y2),
                       rw, abs(y2 - y1), 0.02, road_mat)

    for bld in spec.get("buildings", []):
        mat = _material(f"nx_kind_{bld['kind']}", bld.get(
            "color", (0.7, 0.7, 0.7)))
        _add_box(f"bld:{bld['id']}", bld["x"], bld["y"], bld["w"],
                 bld["d"], bld["h"], mat)

    from render3d.blender_colors import ACTION_COLOR
    for r in spec.get("residents", []):
        color = ACTION_COLOR.get(r.get("action", "idle"), (0.8, 0.8, 0.8))
        mat = _material(f"nx_act_{r.get('action', 'idle')}", color, 0.5)
        px, py = r["pos"]
        bpy.ops.mesh.primitive_cylinder_add(radius=0.35, depth=0.8,
                                            location=(px, py, 0.4))
        body = bpy.context.active_object
        body.name = f"res-body:{r['id']}"
        body.data.materials.append(mat)
        bpy.ops.mesh.primitive_ico_sphere_add(radius=0.28,
                                              subdivisions=2,
                                              location=(px, py, 1.05))
        head = bpy.context.active_object
        head.name = f"res-head:{r['id']}"
        head.data.materials.append(mat)

    # ---------------- lighting & sky from the world clock/weather
    t = spec.get("time", {})
    is_day = bool(t.get("is_daytime", True))
    hour = float(t.get("hour", 12))
    weather = t.get("weather", "clear")
    brightness = float(spec.get("render_opts", {}).get("brightness", 1.0))

    sun = bpy.data.lights.new("nx_sun", "SUN")
    sun.energy = (3.4 if is_day else 0.22) * brightness  # exposure knob
    daylight = max(0.0, math.sin((hour - 6) / 12 * math.pi))
    elev = math.radians(12 + 60 * daylight)
    azim = math.radians((hour / 24) * 360 + 90)
    sun_obj = bpy.data.objects.new("nx_sun", sun)
    sun_obj.rotation_euler = (elev, 0, azim)
    bpy.context.scene.collection.objects.link(sun_obj)

    world = bpy.data.worlds.new("nx_world")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if is_day:
        sky = (0.55, 0.70, 0.95, 1.0) if weather != "rain" else \
            (0.45, 0.48, 0.55, 1.0)
        strength = 0.9 * brightness
    else:
        sky = (0.02, 0.03, 0.09, 1.0)
        strength = 0.22 * brightness
    if weather == "rain":
        sky = (0.4, 0.42, 0.48, 1.0) if is_day else sky
    bg.inputs["Color"].default_value = sky
    bg.inputs["Strength"].default_value = strength

    # ---------------- cameras
    cam_data = bpy.data.cameras.new("nx_cam")
    cam = bpy.data.objects.new("nx_cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    bpy.context.scene["nx_bounds"] = [minx, miny, maxx, maxy]
    return _result(ok=True, objects=len(bpy.data.objects),
                   elapsed_ms=round((time.time() - t0) * 1000, 1))


def setup_camera(view: str, bounds) -> str:
    """Position the scene camera: 'top' (orthographic district map) or
    'street' (perspective from ground level toward the centre)."""
    import bpy
    minx, miny, maxx, maxy = bounds
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    span = max(maxx - minx, maxy - miny)
    cam = bpy.data.objects.get("nx_cam")
    if cam is None:
        return _result(ok=False, error="no camera; build scene first")
    if view == "top":
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = span * 1.08
        cam.location = (cx, cy, span)
        cam.rotation_euler = (0.0, 0.0, 0.0)   # looking straight down
    else:  # street
        import mathutils
        cam.data.type = "PERSP"
        cam.data.lens = 32
        cam.location = (minx + span * 0.12, miny + span * 0.12, 2.2)
        direction = mathutils.Vector((cx, cy, 3.0)) - \
            mathutils.Vector(cam.location)
        cam.rotation_euler = direction.to_track_quat(
            "-Z", "Y").to_euler()
    return _result(ok=True, view=view)


def setup_render(samples: int = 24, width: int = 960,
                 height: int = 540) -> str:
    import bpy
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = max(1, int(samples))
    scene.render.resolution_x = int(width)
    scene.render.resolution_y = int(height)
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    return _result(ok=True, engine="CYCLES", device="CPU", samples=samples,
                   resolution=[width, height])


def render(out_png: str) -> str:
    import bpy
    import os
    t0 = time.time()
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    bpy.context.scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    size = os.path.getsize(out_png) if os.path.exists(out_png) else 0
    return _result(ok=size > 0, path=out_png, bytes=size,
                   elapsed_ms=round((time.time() - t0) * 1000, 1))


def export(out_path: str, fmt: str = "usd") -> str:
    import bpy
    import os
    t0 = time.time()
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    fmt = fmt.lower()
    if fmt in ("usd", "usda", "usdc"):
        bpy.ops.wm.usd_export(filepath=out_path)
    elif fmt in ("gltf", "glb"):
        bpy.ops.export_scene.gltf(filepath=out_path)
    elif fmt == "fbx":
        bpy.ops.export_scene.fbx(filepath=out_path)
    else:
        return _result(ok=False, error=f"unknown format {fmt!r}")
    size = os.path.getsize(out_path) if os.path.exists(out_path) else 0
    return _result(ok=size > 0, path=out_path, bytes=size, fmt=fmt,
                   elapsed_ms=round((time.time() - t0) * 1000, 1))


def animate(positions: dict, frames_per_step: int = 4) -> str:
    """Keyframe residents along their simulated position timeline.

    `positions` maps resident_id -> [[tick, x, y], ...] from the event
    log (resident.acted snapshots). Saves nothing by itself — the
    caller saves the .blend."""
    import bpy
    scene = bpy.context.scene
    fcurves = 0
    last_frame = 1
    for rid, timeline in positions.items():
        body = bpy.data.objects.get(f"res-body:{rid}")
        head = bpy.data.objects.get(f"res-head:{rid}")
        if body is None or not timeline:
            continue
        for tick, x, y in timeline:
            frame = max(1, int(tick) // frames_per_step + 1)
            last_frame = max(last_frame, frame)
            body.location = (x, y, 0.4)
            body.keyframe_insert(data_path="location", frame=frame)
            if head is not None:
                head.location = (x, y, 1.05)
                head.keyframe_insert(data_path="location", frame=frame)
        fcurves += 2 if head is not None else 1
    scene.frame_start = 1
    scene.frame_end = max(scene.frame_end, last_frame)
    return _result(ok=True, keyframed_residents=len(positions),
                   fcurves=fcurves, frame_end=last_frame)


def info() -> str:
    import bpy
    return _result(ok=True, blender=bpy.app.version_string,
                   objects=len(bpy.data.objects),
                   meshes=len(bpy.data.meshes),
                   materials=len(bpy.data.materials))


def save(path: str) -> str:
    import bpy
    import os
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)
    return _result(ok=os.path.exists(path), path=path)


def load(path: str) -> str:
    import bpy
    if not os.path.exists(path):
        return _result(ok=False, error="blend file not found")
    bpy.ops.wm.open_mainfile(filepath=path)
    return _result(ok=True, path=path, objects=len(bpy.data.objects))
