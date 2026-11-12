"""JARVIS NEXUS — real bpy operators for the 3D asset pipeline."""

import bpy
from bpy.props import StringProperty, FloatProperty
from bpy_extras.io_utils import axis_conversion


# ---------------------------------------------------------------------------
# Scene creation & camera
# ---------------------------------------------------------------------------

def create_sanctuary_reference_scene(scale_m: float = 1.0):
    """Create the JARVIS NEXUS sanctuary reference blocking (floor disc,
    central holo-ring, key/fill/rim lights) at metric scale for lookdev."""
    if "JN_Reference_Scene" in bpy.data.scenes:
        return {"created": False, "scene": "JN_Reference_Scene"}
    scene = bpy.data.scenes.new("JN_Reference_Scene")

    import bmesh
    mesh = bpy.data.meshes.new("JN_Floor")
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, segments=64, radius=14.5 * scale_m)
    bm.to_mesh(mesh)
    bm.free()
    floor = bpy.data.objects.new("JN_Floor", mesh)
    scene.collection.objects.link(floor)

    rig = bpy.data.objects.new("JN_HoloRing", None)
    scene.collection.objects.link(rig)

    light_specs = [
        ("JN_Key",  "AREA", (2.0, 2.6, 3.2), 5000.0, (1.0, 0.94, 0.87)),
        ("JN_Fill", "AREA", (-3.0, 1.6, 2.4), 1200.0, (0.47, 0.60, 0.65)),
        ("JN_Rim",  "AREA", (-1.0, -2.5, 2.8), 2200.0, (0.38, 0.90, 0.95)),
    ]
    for name, ltype, loc, energy, color in light_specs:
        ld = bpy.data.lights.new(name, ltype)
        ld.energy = energy
        ld.color = color
        lamp = bpy.data.objects.new(name, ld)
        lamp.location = loc
        scene.collection.objects.link(lamp)

    cam_data = bpy.data.cameras.new("JN_Camera")
    cam = bpy.data.objects.new("JN_Camera", cam_data)
    cam.location = (3.4, -4.6, 1.62)
    cam.rotation_euler = (1.35, 0.0, 0.66)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return {"created": True, "scene": scene.name}


# ---------------------------------------------------------------------------
# Import / export (Blender → Unreal / MetaHuman → Web pipeline)
# ---------------------------------------------------------------------------

def import_glb(path: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [o.name for o in bpy.data.objects if o not in before]
    return {"imported": imported, "count": len(imported)}


def export_glb(path: str, selected_only: bool = False):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        use_selection=selected_only,
        export_morph=True,
        export_skins=True,
    )
    return {"exported": path}


def export_usd_for_unreal(path: str):
    """USD is the Blender→Unreal interchange for environments/props
    (MetaHuman characters keep their native UE pipeline)."""
    bpy.ops.wm.usd_export(filepath=path, use_instancing=True)
    return {"exported": path}


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def apply_pbr_material(target: str, base_color, roughness: float, metallic: float):
    obj = bpy.data.objects.get(target)
    if obj is None:
        return {"error": f"object not found: {target}"}
    mat = bpy.data.materials.new(name=f"JN_{target}_PBR")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = tuple(base_color) + (1.0,)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return {"material": mat.name, "object": target}


# ---------------------------------------------------------------------------
# Rig / animation validation (MetaHuman & Mixamo drops)
# ---------------------------------------------------------------------------

REQUIRED_BONES = {
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftArm", "LeftForeArm", "LeftHand",
    "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg",
}

def validate_rig(armature_name: str):
    arm = bpy.data.objects.get(armature_name)
    if arm is None or arm.type != "ARMATURE":
        return {"error": f"armature not found: {armature_name}"}
    bones = {b.name.replace("mixamorig:", "") for b in arm.data.bones}
    missing = sorted(REQUIRED_BONES - bones)
    shape_keys = 0
    for mesh in bpy.data.meshes:
        if mesh.shape_keys and mesh.shape_keys.key_blocks:
            shape_keys += len(mesh.shape_keys.key_blocks)
    return {
        "armature": armature_name,
        "bone_count": len(bones),
        "missing_required_bones": missing,
        "shape_keys_total": shape_keys,
        "rig_ok": len(missing) == 0,
    }


# ---------------------------------------------------------------------------
# Batch + validation
# ---------------------------------------------------------------------------

def batch_export_glb(directory: str):
    import os
    results = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        out = os.path.join(directory, f"{obj.name}.glb")
        export_glb(out, selected_only=True)
        results.append(out)
    return {"exported": results}


def validate_scene():
    issues = []
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            if not obj.data.polygons:
                issues.append(f"{obj.name}: empty mesh")
            if obj.scale.length < 1e-6:
                issues.append(f"{obj.name}: degenerate scale")
        if obj.type == "ARMATURE" and len(obj.data.bones) < 16:
            issues.append(f"{obj.name}: suspiciously few bones ({len(obj.data.bones)})")
    return {"valid": len(issues) == 0, "issues": issues[:50]}
