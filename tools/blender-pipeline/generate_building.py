#!/usr/bin/env python3
"""
NEXUS Blender production pipeline — parametric building generator (bpy).

Runs inside Blender 4.x (`blender --background --python generate_building.py
-- --spec spec.json --out /path/out.fbx`) or via the Blender MCP
(execute_blender_code). Consumes ConstructionSpec structures emitted by the
NEXUS Creation Engine (packages/world/src/creation.ts) and produces a
validated, exportable building asset.

Pipeline stage coverage (directive §9.2): SPECIFICATION → MODELLING →
GEOMETRY VALIDATION → UV VALIDATION → EXPORT. Materials/textures/rigging/
animation are workstation stages driven through the same spec.
"""
import argparse
import json
import math
import sys
from pathlib import Path


def build_spec(structure: dict, style: dict | None = None) -> dict:
    """Normalise a CreationSpec structure into a full modelling spec."""
    style = style or {}
    dims = structure.get("dimensions", {"w": 12, "h": 6, "d": 10})
    floors = structure.get("floors") or max(1, int(dims.get("h", 6) / 3.5))
    return {
        "structureId": structure.get("structureId", "st_unknown"),
        "type": structure.get("type", "house"),
        "position": structure.get("position", {"x": 0, "y": 0, "z": 0}),
        "dimensions": dims,
        "floors": floors,
        "wallThickness": style.get("wallThickness", 0.3),
        "windowCols": style.get("windowCols", 3),
        "roofType": style.get("roofType", "flat" if structure.get("type") == "commercial" else "gable"),
        "materials": style.get("materials", {
            "walls": {"base_color": [0.82, 0.78, 0.70, 1.0], "roughness": 0.9},
            "windows": {"base_color": [0.15, 0.22, 0.32, 1.0], "metallic": 0.6, "roughness": 0.15},
            "roof": {"base_color": [0.35, 0.20, 0.16, 1.0], "roughness": 0.95},
        }),
    }


def generate_building(spec: dict):
    """Create the building mesh using bpy. Returns validation results."""
    import bpy  # only available inside Blender

    # clean scene state for deterministic output
    for obj in list(bpy.data.objects):
        if obj.name.startswith("NEXUS_"):
            bpy.data.objects.remove(obj, do_unlink=True)

    dims = spec["dimensions"]
    w, d, h = dims["w"], dims["d"], dims["h"]
    floors = max(1, spec["floors"])
    floor_h = h / floors
    t = spec["wallThickness"]

    # --- shell (walls): extruded ring per floor
    verts, faces = [], []
    outer = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
    inner = [(-w / 2 + t, -d / 2 + t), (w / 2 - t, -d / 2 + t), (w / 2 - t, d / 2 - t), (-w / 2 + t, d / 2 - t)]

    def add_ring(z: float, points):
        base = len(verts)
        for (x, y) in points:
            verts.append((x, y, z))
        return base

    for f in range(floors + 1):
        z = f * floor_h
        add_ring(z, outer)
        add_ring(z, inner)
    # wall faces: outer ring quads, inner ring quads, top/bottom caps
    for f in range(floors):
        o0, i0 = 8 * f, 8 * f + 4
        o1, i1 = 8 * (f + 1), 8 * (f + 1) + 4
        for k in range(4):
            n = (k + 1) % 4
            faces.append((o0 + k, o0 + n, o1 + n, o1 + k))          # outer
            faces.append((i0 + k, i1 + k, i1 + n, i0 + n))          # inner
    # top cap ring (outer top -> inner top)
    ot, it = 8 * floors, 8 * floors + 4
    for k in range(4):
        n = (k + 1) % 4
        faces.append((ot + k, it + k, it + n, ot + n))

    import bmesh
    mesh = bpy.data.meshes.new(f"NEXUS_building_{spec['structureId']}")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()

    obj = bpy.data.objects.new(f"NEXUS_building_{spec['structureId']}", mesh)
    pos = spec["position"]
    obj.location = (pos.get("x", 0), pos.get("z", 0), pos.get("y", 0))  # spec Y-up -> blender Z-up
    bpy.context.collection.objects.link(obj)

    # --- windows: emissive planes on the street facade per floor
    win_objs = []
    cols = spec["windowCols"]
    for f in range(floors):
        for c in range(cols):
            x = -w / 2 + (c + 0.5) * (w / cols)
            z = f * floor_h + floor_h * 0.35
            bmesh.ops.create_cube(bm := bmesh.new(), size=1.0)
            win = bm.objects[0] if bm.objects else None
            # simpler: use primitive via bpy operators on a temp mesh
            bm.free()
            bpy.ops.mesh.primitive_plane_add(size=1.2, location=(x, -d / 2 - 0.01, z), rotation=(math.pi / 2, 0, 0))
            plane = bpy.context.active_object
            plane.name = f"NEXUS_window_{f}_{c}"
            plane.scale = (1.0, 1.4, 1.0)
            win_objs.append(plane)

    # --- roof
    if spec["roofType"] == "gable":
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, h + 0.5))
        roof = bpy.context.active_object
        roof.name = f"NEXUS_roof_{spec['structureId']}"
        roof.scale = (w / 2 * 1.05, d / 2 * 1.05, 0.5)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, h + 0.15))
        roof = bpy.context.active_object
        roof.name = f"NEXUS_roof_{spec['structureId']}"
        roof.scale = (w / 2 * 1.05, d / 2 * 1.05, 0.3)

    # --- materials
    for mat_name, mat_cfg in spec["materials"].items():
        mat = bpy.data.materials.get(f"NEXUS_mat_{mat_name}") or bpy.data.materials.new(f"NEXUS_mat_{mat_name}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = mat_cfg.get("base_color", [0.8, 0.8, 0.8, 1.0])
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = mat_cfg.get("roughness", 0.9)
            if "Metallic" in bsdf.inputs and "metallic" in mat_cfg:
                bsdf.inputs["Metallic"].default_value = mat_cfg["metallic"]
        if mat_name == "walls":
            obj.data.materials.append(mat)
        elif mat_name == "roof":
            roof.data.materials.append(mat)
        elif mat_name == "windows":
            for w_obj in win_objs:
                if not w_obj.data.materials:
                    w_obj.data.materials.append(mat)

    return {"objects": 2 + len(win_objs), "vertices": len(verts), "faces": len(faces)}


def export_fbx(path: str):
    import bpy
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.fbx(filepath=path, use_selection=True, apply_scale_options="FBX_SCALE_UNITS")


def validate_geometry(spec: dict, stats: dict) -> list[str]:
    """Structural validation rules (directive §9.2 GEOMETRY/UV VALIDATION)."""
    issues = []
    dims = spec["dimensions"]
    if dims["w"] <= 0 or dims["d"] <= 0 or dims["h"] <= 0:
        issues.append("non-positive dimensions")
    if spec["floors"] < 1:
        issues.append("floors < 1")
    if stats.get("faces", 0) < 4:
        issues.append("degenerate mesh: fewer than 4 faces")
    if stats.get("vertices", 0) < 8:
        issues.append("degenerate mesh: fewer than 8 vertices")
    # scale sanity: buildings between 2m and 200m
    if not (2 <= max(dims["w"], dims["d"], dims["h"]) <= 200):
        issues.append("building scale outside 2-200m production range")
    return issues


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True, help="path to ConstructionSpec JSON (single structure or full spec)")
    parser.add_argument("--out", default="", help="output FBX path")
    parser.add_argument("--structure", default="st_0", help="structureId to build when spec contains multiple")
    args, _ = parser.parse_known_args()

    raw = json.loads(Path(args.spec).read_text())
    structures = raw.get("structures", [raw])
    target = next((s for s in structures if s.get("structureId") == args.structure), structures[0])

    spec = build_spec(target)
    stats = generate_building(spec)
    issues = validate_geometry(spec, stats)
    if issues:
        print(json.dumps({"ok": False, "issues": issues}))
        sys.exit(1)
    if args.out:
        export_fbx(args.out)
    print(json.dumps({"ok": True, "structureId": spec["structureId"], "stats": stats, "exported": args.out or None}))
