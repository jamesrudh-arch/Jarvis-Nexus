"""Terrain + environmental systems (Blender side, runs in the bpy venv).

Builds the procedural landscape described by render3d/worldgen.py output:
heightfield mesh (bmesh grid, displaced + city-flattened), water plane
with a real glass-ish Principled material, park grounds, trees (oak =
cylinder canopy + trunk; pine = cone), shoreline rocks, and weather
particle systems (rain) — all as genuine bpy operations.

Deterministic: the world dict arrives fully computed (hash noise on the
py3.12 side); this module only REALISES it as geometry.
"""
from __future__ import annotations

import json
import time

from render3d.worldgen import height_at


def _result(**kw) -> str:
    return json.dumps(kw, sort_keys=True)


def _material(name: str, color, roughness: float = 0.9,
              metallic: float = 0.0, transmission: float = 0.0,
              ior: float = 1.33):
    import bpy
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if transmission > 0.0 and "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = transmission
            bsdf.inputs["IOR"].default_value = ior
    return mat


def build_terrain(world: dict, max_height: float = 3.0) -> str:
    """Realise the worldgen description as Blender geometry."""
    import bpy
    import bmesh
    t0 = time.time()
    g = world["grid"]
    minx, miny, maxx, maxy = world["bounds"]
    w, d = maxx - minx, maxy - miny
    roads = world.get("_roads")
    buildings = world.get("_buildings")

    # ------------------------------------------------ heightfield mesh
    bm = bmesh.new()
    uvs = bm.loops.layers.uv.new("uv")
    for j in range(g):
        for i in range(g):
            x = minx + (i / (g - 1)) * w
            y = miny + (j / (g - 1)) * d
            h = height_at(world, x, y, max_height, roads, buildings)
            bm.verts.new((x, y, h))
    bm.verts.ensure_lookup_table()
    for j in range(g - 1):
        for i in range(g - 1):
            a = bm.verts[j * g + i]
            b = bm.verts[j * g + i + 1]
            c = bm.verts[(j + 1) * g + i + 1]
            e = bm.verts[(j + 1) * g + i]
            face = bm.faces.new((a, b, c, e))
            for loop in face.loops:
                loop[uvs].uv = ((loop.vert.co.x - minx) / w,
                                (loop.vert.co.y - miny) / d)
    terrain_mesh = bpy.data.meshes.new("nx_terrain")
    bm.to_mesh(terrain_mesh)
    bm.free()

    terrain = bpy.data.objects.new("nx_terrain", terrain_mesh)
    mat = _material("nx_terrain_mat", (0.36, 0.44, 0.28), 0.95)
    terrain.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(terrain)
    smooth = terrain.modifiers.new("shade", "SMOOTH")
    _ = smooth  # modifier present for clarity; shade via polys:
    for poly in terrain_mesh.polygons:
        poly.use_smooth = True

    # ------------------------------------------------ water plane
    sea_z = 0.02
    water_level = max_height * 0.0 + sea_z  # water sits at the basin floor
    bpy.ops.mesh.primitive_plane_add(
        size=1, location=((minx + maxx) / 2, (miny + maxy) / 2,
                          water_level))
    water = bpy.context.active_object
    water.name = "nx_water"
    water.scale = (w, d, 1.0)
    wmat = _material("nx_water_mat", (0.12, 0.30, 0.42), 0.08,
                     transmission=0.85, ior=1.33)
    water.data.materials.append(wmat)

    # ------------------------------------------------ park grounds
    for idx, park in enumerate(world.get("parks", [])):
        cx, cy = park["center"]
        size = 8 + park["size"] * 14
        bpy.ops.mesh.primitive_plane_add(
            size=1, location=(cx, cy, 0.035))
        pg = bpy.context.active_object
        pg.name = f"nx_park:{idx}"
        pg.scale = (size, size, 1.0)
        pg.data.materials.append(
            _material("nx_park_mat", (0.25, 0.52, 0.24), 0.98))

    # ------------------------------------------------ trees
    trunk_mat = _material("nx_trunk", (0.32, 0.22, 0.14), 0.95)
    oak_mat = _material("nx_oak", (0.18, 0.42, 0.16), 0.9)
    pine_mat = _material("nx_pine", (0.10, 0.30, 0.18), 0.9)
    for t_i, t in enumerate(world.get("trees", [])):
        x, y, h = t["x"], t["y"], t["h"]
        base_z = height_at(world, x, y, max_height, roads, buildings)
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.14 * h / 3, depth=h * 0.55,
            location=(x, y, base_z + h * 0.275))
        trunk = bpy.context.active_object
        trunk.name = f"nx_tree_trunk:{t_i}"
        trunk.data.materials.append(trunk_mat)
        if t["kind"] == "oak":
            bpy.ops.mesh.primitive_ico_sphere_add(
                radius=h * 0.30, subdivisions=2,
                location=(x, y, base_z + h * 0.72))
            crown = bpy.context.active_object
            crown.data.materials.append(oak_mat)
            crown.name = f"nx_tree_crown:{t_i}"
        else:
            bpy.ops.mesh.primitive_cone_add(
                radius1=h * 0.26, depth=h * 0.62,
                location=(x, y, base_z + h * 0.72))
            crown = bpy.context.active_object
            crown.data.materials.append(pine_mat)
            crown.name = f"nx_tree_crown:{t_i}"

    # ------------------------------------------------ rocks
    rock_mat = _material("nx_rock", (0.45, 0.45, 0.47), 0.92)
    for r_i, r in enumerate(world.get("rocks", [])):
        bpy.ops.mesh.primitive_ico_sphere_add(
            radius=r["r"], subdivisions=1,
            location=(r["x"], r["y"], r["r"] * 0.4))
        rock = bpy.context.active_object
        rock.name = f"nx_rock:{r_i}"
        rock.data.materials.append(rock_mat)

    built = {
        "terrain_verts": len(terrain_mesh.vertices),
        "terrain_faces": len(terrain_mesh.polygons),
        "parks": len(world.get("parks", [])),
        "trees": len(world.get("trees", [])) * 2,   # trunk + crown
        "rocks": len(world.get("rocks", [])),
        "water": True,
    }
    return _result(ok=True, **built,
                   elapsed_ms=round((time.time() - t0) * 1000, 1))


def build_weather(weather: str = "rain", bounds=None) -> str:
    """Rain particle system on a sky emitter plane (real bpy particles).

    Returns the particle-system description; simulation happens at render
    time (Cycles evaluates particle systems headlessly)."""
    import bpy
    t0 = time.time()
    if weather != "rain":
        return _result(ok=True, weather=weather,
                       particle_systems=0,
                       note="clear/overcast need no particles")
    minx, miny, maxx, maxy = bounds or (0, 0, 100, 100)
    bpy.ops.mesh.primitive_plane_add(
        size=1, location=((minx + maxx) / 2, (miny + maxy) / 2, 24.0))
    emitter = bpy.context.active_object
    emitter.name = "nx_rain_emitter"
    emitter.scale = ((maxx - minx) * 1.05, (maxy - miny) * 1.05, 1.0)
    # hide the emitter itself; only its particles render
    emitter.hide_render = True
    mod = emitter.modifiers.new("rain", "PARTICLE_SYSTEM")
    ps = bpy.data.particles.new("nx_rain")
    ps.count = 4000
    ps.frame_start = 1
    ps.frame_end = 240
    ps.lifetime = 60
    ps.emit_from = "FACE"
    ps.normal_factor = -18.0          # fall speed
    ps.physics_type = "NEWTON"
    ps.render_type = "LINE"
    ps.line_length_head = 0.55
    ps.line_length_tail = 0.45
    ps.particle_size = 0.02          # bpy 5.x: 'size' renamed
    mod.particle_system.settings = ps
    return _result(ok=True, weather=weather, particle_systems=1,
                   particles=ps.count,
                   elapsed_ms=round((time.time() - t0) * 1000, 1))
