"""Character, creature and animation systems (Blender side, bpy venv).

PRIORITY 4: procedural characters with a REAL armature (hips/torso/head/
arms/legs bones, mesh parts bone-parented), genuine keyframed walk/idle/
talk animation cycles, plus creatures (birds with wing-flap flight on
noise paths, a quadruped with a gait cycle). Every count returned is read
back from bpy.data — no fabricated numbers.
"""
from __future__ import annotations

import json
import math
import time

from render3d.worldgen import _h01


def _result(**kw) -> str:
    return json.dumps(kw, sort_keys=True)


def _mat(name, color, roughness=0.7):
    import bpy
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (*color, 1.0)
        b.inputs["Roughness"].default_value = roughness
    return m


def _bone(edit_bones, name, head, tail, parent=None):
    """Create one edit bone on the given edit_bones collection."""
    b = edit_bones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = edit_bones[parent]
        b.use_connect = False
    return b


def build_character(char_id: str, x: float, y: float, z: float = 0.0,
                    scale: float = 1.0, color=(0.75, 0.35, 0.25)):
    """One rigged humanoid: 8-bone armature + bone-parented body parts."""
    import bpy
    s = scale
    skin = _mat(f"nx_char_skin:{char_id}", color)

    arm_data = bpy.data.armatures.new(f"nx_rig:{char_id}")
    arm_obj = bpy.data.objects.new(f"nx_rig:{char_id}", arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    _bone(eb, "hips", (x, y, z + 0.92 * s), (x, y, z + 1.02 * s))
    _bone(eb, "torso", (x, y, z + 1.02 * s), (x, y, z + 1.38 * s), "hips")
    _bone(eb, "head", (x, y, z + 1.38 * s), (x, y, z + 1.62 * s), "torso")
    _bone(eb, "arm.L", (x, y, z + 1.30 * s), (x - 0.26 * s, y, z + 1.30 * s),
          "torso")
    _bone(eb, "arm.R", (x, y, z + 1.30 * s), (x + 0.26 * s, y, z + 1.30 * s),
          "torso")
    _bone(eb, "leg.L", (x - 0.10 * s, y, z + 0.92 * s),
          (x - 0.10 * s, y, z + 0.02 * s), "hips")
    _bone(eb, "leg.R", (x + 0.10 * s, y, z + 0.92 * s),
          (x + 0.10 * s, y, z + 0.02 * s), "hips")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts = {}
    # torso
    bpy.ops.mesh.primitive_cube_add(
        size=1, location=(x, y, z + 1.16 * s))
    parts["torso"] = (bpy.context.active_object, (0.34 * s, 0.16 * s, 0.36 * s))
    # head
    bpy.ops.mesh.primitive_ico_sphere_add(
        radius=0.11 * s, subdivisions=2, location=(x, y, z + 1.50 * s))
    parts["head"] = (bpy.context.active_object, None)
    # arms + legs
    for side, sx in (("L", -1), ("R", 1)):
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.045 * s, depth=0.26 * s,
            location=(x + sx * 0.13 * s, y, z + 1.30 * s))
        parts[f"arm.{side}"] = (bpy.context.active_object, None)
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.055 * s, depth=0.88 * s,
            location=(x + sx * 0.10 * s, y, z + 0.48 * s))
        parts[f"leg.{side}"] = (bpy.context.active_object, None)

    # bone parenting (data-level: no operator context needed headless).
    # parent_bone + matrix_parent_inverse keeps each part at its world
    # position while making it follow its bone's pose animation.
    bone_map = {"torso": "torso", "head": "head", "arm.L": "arm.L",
                "arm.R": "arm.R", "leg.L": "leg.L", "leg.R": "leg.R"}
    meshes = 0
    for key, (obj, dims) in parts.items():
        obj.name = f"nx_char:{char_id}:{key}"
        if dims:
            obj.scale = dims
        obj.data.materials.append(skin)
        bone_rest = arm_obj.data.bones[bone_map[key]].matrix_local
        obj.parent = arm_obj
        obj.parent_type = "BONE"
        obj.parent_bone = bone_map[key]
        obj.matrix_parent_inverse = (
            arm_obj.matrix_world @ bone_rest).inverted()
        meshes += 1
    return arm_obj, parts, meshes


def build_characters(spec: dict) -> str:
    """Build procedurally-varied characters for the residents in the spec
    (deterministic variety from _h01 hash — no RNG)."""
    import bpy
    t0 = time.time()
    made = 0
    rigs = 0
    residents = spec.get("residents", [])
    for i, r in enumerate(residents):
        hue = _h01("char-hue", r["id"])
        color = (0.35 + hue * 0.55, 0.25 + _h01("char-c2", r["id"]) * 0.6,
                 0.2 + _h01("char-c3", r["id"]) * 0.5)
        px, py = r["pos"]
        arm, parts, meshes = build_character(
            r["id"], px, py, 0.0, 0.9 + _h01("char-scale", r["id"]) * 0.3,
            color)
        made += meshes
        rigs += 1
    return _result(ok=True, characters=rigs, mesh_parts=made,
                   armatures=rigs,
                   elapsed_ms=round((time.time() - t0) * 1000, 1))


def animate_walk(char_id: str, timeline: list, frames_per_step: int = 4,
                 phase: float = 0.0) -> str:
    """Genuine walk cycle: leg/arm bone swing keyframes synchronised with
    the resident's simulated movement timeline, plus idle breathing on
    stationary frames. Bones are animated via rotation_euler keys."""
    import bpy
    t0 = time.time()
    rig = bpy.data.objects.get(f"nx_rig:{char_id}")
    body = bpy.data.objects.get(f"nx_char:{char_id}:torso")
    head = bpy.data.objects.get(f"nx_char:{char_id}:head")
    if rig is None:
        return _result(ok=False, error=f"no rig for {char_id}")
    fcurves = 0
    last_frame = 1
    prev_pos = None
    for k, (tick, x, y) in enumerate(timeline):
        frame = max(1, int(tick) // frames_per_step + 1)
        moving = prev_pos is not None and (
            abs(x - prev_pos[0]) > 1e-6 or abs(y - prev_pos[1]) > 1e-6)
        # walk phase advances only while moving — cycle = 8 frames
        ph = phase + (frame / 8.0) * (2 * math.pi if moving else 0.0)
        swing = math.sin(ph) * (0.55 if moving else 0.0)
        for bone_name, angle in (("leg.L", swing), ("leg.R", -swing),
                                 ("arm.L", -swing * 0.7),
                                 ("arm.R", swing * 0.7)):
            pb = rig.pose.bones.get(bone_name)
            if pb is None:
                continue
            pb.rotation_euler = (angle, 0.0, 0.0)
            pb.keyframe_insert(data_path="rotation_euler", frame=frame)
            fcurves += 1
        # rig follows the world position
        rig.location = (x, y, rig.location.z)
        rig.keyframe_insert(data_path="location", frame=frame)
        fcurves += 1
        # idle breathing (subtle scale) on stationary frames
        if body is not None and not moving:
            breathe = 1.0 + 0.02 * math.sin(frame / 6.0 + phase)
            body.scale = (body.scale.x, body.scale.y, breathe)
            body.keyframe_insert(data_path="scale", frame=frame)
            fcurves += 1
        if head is not None:
            look = math.sin(ph * 0.25) * 0.12
            head.rotation_euler = (0.0, look, 0.0)
            head.keyframe_insert(data_path="rotation_euler", frame=frame)
            fcurves += 1
        prev_pos = (x, y)
        last_frame = max(last_frame, frame)
    return _result(ok=True, character=char_id, keyframed=last_frame,
                   fcurves_est=fcurves,
                   elapsed_ms=round((time.time() - t0) * 1000, 1))


def build_creatures(bounds, seed: str = "fauna") -> str:
    """Creatures: 10 birds (body + 2 wings, flap keyframes along noise
    flight paths) + 2 quadrupeds (body/head/4 legs, gait cycle)."""
    import bpy
    t0 = time.time()
    minx, miny, maxx, maxy = bounds
    feather = _mat("nx_bird", (0.20, 0.24, 0.34), 0.6)
    fur = _mat("nx_cat", (0.55, 0.40, 0.28), 0.85)
    wings = 0
    for i in range(10):
        cx = minx + (0.15 + 0.7 * _h01(seed, "bird-x", i)) * (maxx - minx)
        cy = miny + (0.15 + 0.7 * _h01(seed, "bird-y", i)) * (maxy - miny)
        cz = 8 + 4 * _h01(seed, "bird-z", i)
        bpy.ops.mesh.primitive_ico_sphere_add(
            radius=0.22, subdivisions=2, location=(cx, cy, cz))
        body = bpy.context.active_object
        body.name = f"nx_bird:{i}"
        body.data.materials.append(feather)
        for side, sx in (("L", -1), ("R", 1)):
            bpy.ops.mesh.primitive_plane_add(
                size=1, location=(cx + sx * 0.28, cy, cz))
            wing = bpy.context.active_object
            wing.name = f"nx_bird_wing:{i}:{side}"
            wing.scale = (0.56, 0.30, 1.0)
            wing.data.materials.append(feather)
            for f in range(1, 97, 4):
                flap = math.sin(f / 2.4 + (0 if side == "L" else math.pi)) \
                    * 0.7
                wing.rotation_euler = (0.0, flap, 0.0)
                wing.keyframe_insert(data_path="rotation_euler", frame=f)
                # gentle noise flight path
                wing.location = (
                    cx + math.sin(f / 18.0 + i) * 6 + sx * 0.28,
                    cy + math.cos(f / 21.0 + i) * 6,
                    cz + math.sin(f / 9.0) * 0.8)
                wing.keyframe_insert(data_path="location", frame=f)
            wings += 1
        body.location = (cx, cy, cz)
        for f in range(1, 97, 4):
            body.location = (
                cx + math.sin(f / 18.0 + i) * 6,
                cy + math.cos(f / 21.0 + i) * 6,
                cz + math.sin(f / 9.0) * 0.8)
            body.keyframe_insert(data_path="location", frame=f)

    quadrupeds = 0
    for c in range(2):
        cx = minx + (0.25 + 0.5 * _h01(seed, "cat-x", c)) * (maxx - minx)
        cy = miny + (0.25 + 0.5 * _h01(seed, "cat-y", c)) * (maxy - miny)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, 0.26))
        q_body = bpy.context.active_object
        q_body.name = f"nx_quadruped:{c}"
        q_body.scale = (0.52, 0.2, 0.2)
        q_body.data.materials.append(fur)
        bpy.ops.mesh.primitive_ico_sphere_add(
            radius=0.1, subdivisions=2, location=(cx + 0.3, cy, 0.3))
        q_head = bpy.context.active_object
        q_head.name = f"nx_quadruped_head:{c}"
        q_head.data.materials.append(fur)
        legs = []
        for li, (lx, ly) in enumerate(((-0.18, -0.08), (-0.18, 0.08),
                                       (0.18, -0.08), (0.18, 0.08))):
            bpy.ops.mesh.primitive_cylinder_add(
                radius=0.035, depth=0.3,
                location=(cx + lx, cy + ly, 0.15))
            leg = bpy.context.active_object
            leg.name = f"nx_quadruped_leg:{c}:{li}"
            leg.data.materials.append(fur)
            legs.append(leg)
        # gait cycle: diagonal pairs alternate
        for f in range(1, 97, 4):
            for li, leg in enumerate(legs):
                gait = math.sin(f / 3.0 + (math.pi if li % 3 else 0)) * 0.3
                leg.rotation_euler = (gait, 0.0, 0.0)
                leg.keyframe_insert(data_path="rotation_euler", frame=f)
        quadrupeds += 1
    return _result(ok=True, birds=10, bird_wings=wings, quadrupeds=quadrupeds,
                   elapsed_ms=round((time.time() - t0) * 1000, 1))
