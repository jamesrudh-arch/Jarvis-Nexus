"""Procedural architecture: modular wall panels, shingled roofs, shopfronts.

Two blueprint assets live here: ``SM_House`` (15k–40k LOD0 tris) and
``SM_Shop`` (20k–50k). All geometry is metre-scale; transforms are applied;
materials are assigned per part BEFORE the final join (slots survive the
join so the GLB carries per-part materials).
"""

import bpy

from . import materials as nb_materials
from .naming import static_mesh_name
from .trimesh import apply_transforms, join_selected, select_only, total_triangles


# ---------------------------------------------------------------------------
# primitives
# ---------------------------------------------------------------------------

def bevelled_box(name, size, location, *, bevel=0.02, segments=3,
                 rotation=(0, 0, 0)) -> bpy.types.Object:
    """Box with a real bevel on all edges (the tri workhorse)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = bevel
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    apply_transforms(obj)
    return obj


def subdivided_grid(name, size_a, size_b, thickness, location, grid=(8, 4),
                    wave=None, rotation=(0, 0, 0)) -> bpy.types.Object:
    """Deterministic grid panel: ``grid`` quads across (A x B) with real
    thickness via Solidify — memory-light and exact (bpy.ops.mesh.subdivide
    is NOT axis-limited and explodes memory: two axis 'cuts' multiply into a
    full 2-D grid per call; primitive_grid_add subdivides per axis)."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=max(2, grid[0]),
                                    y_subdivisions=max(2, grid[1]),
                                    size=2, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size_a / 2, size_b / 2, 1)
    apply_transforms(obj)
    if wave:
        import math
        amp, freq = wave
        for v in obj.data.vertices:
            v.co.z += amp * math.sin(freq * v.co.x) * math.cos(freq * 0.5 * v.co.y)
    mod = obj.modifiers.new("Solidify", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = 0.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    apply_transforms(obj)
    return obj


def subdivided_box(name, size, location, grid=(8, 4, 1), wave=None,
                   rotation=(0, 0, 0)) -> bpy.types.Object:
    """Back-compat wrapper: XY-plane panel with (sx, sy, thickness) = size."""
    return subdivided_grid(name, size[0], size[1], size[2], location,
                           grid=(grid[0], grid[1]), wave=wave, rotation=rotation)


def cylinder(name, radius, depth, location, *, vertices=32, rotation=(0, 0, 0),
             bevel=None) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth,
                                        location=location, rotation=rotation,
                                        vertices=vertices)
    obj = bpy.context.active_object
    obj.name = name
    if bevel:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    apply_transforms(obj)
    return obj


# ---------------------------------------------------------------------------
# SM_House — 8m x 6m gabled cottage, shingled roof, 6 windows, porch, chimney
# LOD0 target: 15k–40k triangles (roof shingles carry the density)
# ---------------------------------------------------------------------------

def _window(asset: str, width=0.9, height=1.2, origin=(0, 0, 0),
            wall_axis="Y") -> list:
    """One bevelled-frame window: sill, 4 frame bars, cross mullions, glass."""
    parts = []
    x0, y0, z0 = origin
    frame_t, frame_d = 0.07, 0.12
    # sill
    parts.append(bevelled_box("Win_Sill", (width + 0.16, 0.26, 0.06),
                              (x0, y0, z0 - height / 2 - 0.03), bevel=0.012))
    # frame bars
    parts.append(bevelled_box("Win_BarL", (frame_t, frame_d, height),
                              (x0 - width / 2 + frame_t / 2, y0, z0), bevel=0.015))
    parts.append(bevelled_box("Win_BarR", (frame_t, frame_d, height),
                              (x0 + width / 2 - frame_t / 2, y0, z0), bevel=0.015))
    parts.append(bevelled_box("Win_BarT", (width, frame_d, frame_t),
                              (x0, y0, z0 + height / 2 - frame_t / 2), bevel=0.015))
    parts.append(bevelled_box("Win_BarB", (width, frame_d, frame_t),
                              (x0, y0, z0 - height / 2 + frame_t / 2), bevel=0.015))
    # cross mullions
    parts.append(bevelled_box("Win_MullV", (0.04, 0.05, height - 0.1),
                              (x0, y0, z0), bevel=0.008))
    parts.append(bevelled_box("Win_MullH", (width - 0.1, 0.05, 0.04),
                              (x0, y0, z0), bevel=0.008))
    # glass
    parts.append(bevelled_box("Win_Glass", (width - 0.12, 0.02, height - 0.12),
                              (x0, y0, z0), bevel=0.004, segments=2))
    return parts


def _shingle_slope(asset: str, slope_len, slope_w, courses, cols,
                   origin, pitch_rad) -> list:
    """A roof slope made of overlapping bevelled shingle boxes.
    This is where the house gets its blueprint triangle density."""
    parts = []
    x0, y0, z0 = origin
    course_h = slope_len / courses
    shingle_w = slope_w / cols
    import math
    dx = math.sin(pitch_rad)
    dz = math.cos(pitch_rad)
    for c in range(courses):
        # each course sits slightly above the previous (overlap)
        t = c * course_h
        for i in range(cols):
            jitter = 0.5 * (i % 2)  # half-offset alternate courses
            px = x0 + (t + course_h * 0.5) * dx
            py = y0 - slope_w / 2 + shingle_w * (i + 0.5) + jitter * shingle_w * 0.5 - jitter * shingle_w * 0.5
            pz = z0 + (t + course_h * 0.5) * dz + 0.012 * (courses - c) * 0.2
            sh = bevelled_box(
                f"Shingle_{c}_{i}",
                (course_h * 1.15, shingle_w * 0.96, 0.03),
                (px, py, pz), bevel=0.006, segments=2,
                rotation=(pitch_rad if False else 0, 0, 0))
            sh.rotation_euler = (-pitch_rad, 0, 0)
            apply_transforms(sh)
            parts.append(sh)
    return parts


def build_house() -> bpy.types.Object:
    """Build SM_House parts, assign materials, join, return the LOD0 mesh."""
    asset = "House"
    m_brick = nb_materials.make_material(asset, "BrickWall", seed=11,
                                         base_color=(0.55, 0.28, 0.20), roughness=0.8)
    m_roof = nb_materials.make_material(asset, "RoofShingle", seed=23,
                                        base_color=(0.16, 0.15, 0.17), roughness=0.75)
    m_wood = nb_materials.make_material(asset, "WoodTrim", seed=31,
                                        base_color=(0.42, 0.26, 0.14), roughness=0.65,
                                        with_textures=False)
    m_glass = nb_materials.make_material(asset, "WindowGlass", seed=41,
                                         base_color=(0.75, 0.85, 0.9), roughness=0.08,
                                         metallic=0.1, transmission=0.9,
                                         with_textures=False)
    m_door = nb_materials.make_material(asset, "Door", seed=43,
                                        base_color=(0.30, 0.16, 0.08), roughness=0.6,
                                        with_textures=False)

    parts = []
    W, D, H = 8.0, 6.0, 3.0  # footprint 8m x 6m, eave height 3m
    # foundation
    parts.append(bevelled_box("Found", (W + 0.5, D + 0.5, 0.45), (0, 0, 0.1), bevel=0.02))
    # floor slab
    parts.append(bevelled_box("FloorSlab", (W, D, 0.12), (0, 0, 0.38), bevel=0.01))
    # walls (four bevelled slabs with window openings left as gaps)
    wt = 0.25
    parts.append(bevelled_box("Wall_Back", (W, wt, H), (0, -D / 2 + wt / 2, 0.45 + H / 2), bevel=0.015))
    parts.append(bevelled_box("Wall_Front_L", (2.2, wt, H), (-W / 2 + 1.1, D / 2 - wt / 2, 0.45 + H / 2), bevel=0.015))
    parts.append(bevelled_box("Wall_Front_R", (2.2, wt, H), (W / 2 - 1.1, D / 2 - wt / 2, 0.45 + H / 2), bevel=0.015))
    parts.append(bevelled_box("Wall_Front_Top", (3.6, wt, 0.7), (0, D / 2 - wt / 2, 0.45 + H - 0.35), bevel=0.015))
    parts.append(bevelled_box("Wall_Front_Bot", (3.6, wt, 0.25), (0, D / 2 - wt / 2, 0.575), bevel=0.015))
    parts.append(bevelled_box("Wall_Left", (wt, D, H), (-W / 2 + wt / 2, 0, 0.45 + H / 2), bevel=0.015))
    parts.append(bevelled_box("Wall_Right", (wt, D, H), (W / 2 - wt / 2, 0, 0.45 + H / 2), bevel=0.015))
    # corner trim boards
    for cx, cy in ((-W / 2, -D / 2), (W / 2, -D / 2), (-W / 2, D / 2), (W / 2, D / 2)):
        parts.append(bevelled_box("Trim_Corner", (0.16, 0.16, H), (cx, cy, 0.45 + H / 2), bevel=0.012))
    # windows: front x2, sides x2 each
    win_parts = []
    win_parts += _window(asset, origin=(-1.8, D / 2, 1.85))
    win_parts += _window(asset, origin=(1.8, D / 2, 1.85))
    win_parts += _window(asset, origin=(-W / 2, -1.4, 1.85))
    win_parts += _window(asset, origin=(-W / 2, 1.4, 1.85))
    win_parts += _window(asset, origin=(W / 2, -1.4, 1.85))
    win_parts += _window(asset, origin=(W / 2, 1.4, 1.85))
    parts += win_parts
    # door (front centre)
    parts.append(bevelled_box("Door", (0.98, 0.08, 2.05), (0, D / 2, 1.45), bevel=0.01))
    parts.append(bevelled_box("Door_Frame", (1.18, 0.16, 2.2), (0, D / 2 + 0.02, 1.5), bevel=0.012))
    parts.append(cylinder("Door_Knob", 0.035, 0.1, (0.38, D / 2 + 0.09, 1.4), vertices=16))
    # gabled roof: two shingled slopes + ridge + gable triangles
    import math
    pitch = math.radians(28)
    slope_len = (D / 2) / math.cos(pitch) + 0.35
    roof_z0 = 0.45 + H
    parts += _shingle_slope(asset, slope_len, W + 0.7, courses=7, cols=12,
                            origin=(0, 0, roof_z0), pitch_rad=pitch)
    # mirrored slope (other side)
    back = _shingle_slope(asset, slope_len, W + 0.7, courses=7, cols=12,
                          origin=(0, 0, roof_z0), pitch_rad=pitch)
    for obj in back:
        obj.rotation_euler = (math.pi, 0, 0)  # mirror to the far side
        apply_transforms(obj)
        parts.append(obj)
    parts.append(bevelled_box("Roof_Ridge", (W + 0.8, 0.34, 0.14),
                              (0, 0, roof_z0 + (D / 2) * math.tan(pitch) + 0.06), bevel=0.02))
    # gable end triangles (grid panels rotated into the YZ plane, then
    # reshaped into triangles: vertices pulled toward the ridge line)
    gable_h = (D / 2) * math.tan(pitch)
    for gx in (-W / 2, W / 2):
        g = subdivided_grid("Gable", gable_h, D, 0.08,
                            (gx, 0, roof_z0 + gable_h / 2), grid=(7, 9),
                            rotation=(0, math.pi / 2, 0))
        for v in g.data.vertices:
            t = 1 - abs(v.co.y) / (D / 2)   # 0 at eaves, 1 at centre
            v.co.z = roof_z0 + t * gable_h - (roof_z0 + gable_h / 2)
        g.location = (gx, 0, 0)
        apply_transforms(g)
        parts.append(g)
    # chimney
    parts.append(bevelled_box("Chimney", (0.7, 0.7, 1.6), (2.2, -0.9, roof_z0 + gable_h * 0.55), bevel=0.02))
    parts.append(bevelled_box("Chimney_Cap", (0.9, 0.9, 0.14), (2.2, -0.9, roof_z0 + gable_h * 0.55 + 0.85), bevel=0.015))
    # porch: deck + posts + porch roof
    parts.append(bevelled_box("Porch_Deck", (2.6, 1.3, 0.18), (0, D / 2 + 0.65, 0.52), bevel=0.015))
    for px in (-1.1, 1.1):
        parts.append(cylinder("Porch_Post", 0.07, 2.3, (px, D / 2 + 1.15, 1.75), vertices=20, bevel=0.01))
    parts.append(bevelled_box("Porch_Roof", (2.9, 1.55, 0.12), (0, D / 2 + 0.72, 3.05), bevel=0.015))

    # material assignment BEFORE join
    for p in parts:
        n = p.name
        if n.startswith("Shingle") or n.startswith("Roof"):
            nb_materials.assign(p, m_roof)
        elif "Glass" in n:
            nb_materials.assign(p, m_glass)
        elif n.startswith(("Wall", "Found", "Floor", "Gable", "Chimney")):
            nb_materials.assign(p, m_brick)
        elif n.startswith(("Trim", "Win_", "Porch", "Door_Frame")):
            nb_materials.assign(p, m_wood)
        elif n.startswith("Door"):
            nb_materials.assign(p, m_door)

    select_only(parts)
    house = join_selected()
    house.name = static_mesh_name(asset)
    return house


# ---------------------------------------------------------------------------
# SM_Shop — 10m x 8m retail block: shopfront glass, corrugated awning,
# signage fascia, parapet, pilasters, interior counter visible through glass
# LOD0 target: 20k–50k triangles
# ---------------------------------------------------------------------------

def build_shop() -> bpy.types.Object:
    asset = "Shop"
    m_facade = nb_materials.make_material(asset, "FacadePlaster", seed=71,
                                          base_color=(0.82, 0.78, 0.70), roughness=0.7)
    m_metal = nb_materials.make_material(asset, "PaintedMetal", seed=73,
                                         base_color=(0.24, 0.28, 0.34), roughness=0.45,
                                         metallic=0.35)
    m_glass = nb_materials.make_material(asset, "ShopGlass", seed=77,
                                         base_color=(0.72, 0.82, 0.88), roughness=0.06,
                                         metallic=0.1, transmission=0.9, with_textures=False)
    m_awning = nb_materials.make_material(asset, "AwningFabric", seed=79,
                                          base_color=(0.62, 0.16, 0.14), roughness=0.85,
                                          with_textures=False)
    m_sign = nb_materials.make_material(asset, "SignEmission", seed=83,
                                        base_color=(0.9, 0.75, 0.2), roughness=0.4,
                                        with_textures=False, emission=(1.0, 0.8, 0.25))
    m_counter = nb_materials.make_material(asset, "CounterWood", seed=89,
                                           base_color=(0.36, 0.22, 0.12), roughness=0.6,
                                           with_textures=False)

    parts = []
    W, D, H = 10.0, 8.0, 4.2
    # body walls
    wt = 0.3
    parts.append(bevelled_box("S_Wall_Back", (W, wt, H), (0, -D / 2 + wt / 2, H / 2), bevel=0.015))
    parts.append(bevelled_box("S_Wall_Left", (wt, D, H), (-W / 2 + wt / 2, 0, H / 2), bevel=0.015))
    parts.append(bevelled_box("S_Wall_Right", (wt, D, H), (W / 2 - wt / 2, 0, H / 2), bevel=0.015))
    # shopfront: mullioned full-height glass (3 panes) with heavy bevelled frames
    fy = D / 2 - wt / 2
    glass_w = (W - 2.6) / 3
    for i, cx in enumerate((-1.0 - glass_w / 2 - 0.35, 0, 1.0 + glass_w / 2 + 0.35)):
        # (left pane, centre door bay, right pane)
        if i == 1:
            continue
        gx = -W / 2 + 1.3 + glass_w / 2 + i * (glass_w + 0.7)
        parts.append(bevelled_box(f"S_GlassPane", (glass_w, 0.05, 2.6), (gx, fy, 1.55), bevel=0.008, segments=2))
        parts.append(bevelled_box("S_GlassFrameV", (0.14, 0.22, 2.7), (gx - glass_w / 2 - 0.07, fy, 1.55), bevel=0.018))
        parts.append(bevelled_box("S_GlassFrameV", (0.14, 0.22, 2.7), (gx + glass_w / 2 + 0.07, fy, 1.55), bevel=0.018))
        parts.append(bevelled_box("S_GlassFrameH", (glass_w + 0.28, 0.22, 0.14), (gx, fy, 0.25), bevel=0.018))
        parts.append(bevelled_box("S_GlassMullion", (0.08, 0.14, 2.6), (gx, fy, 1.55), bevel=0.01))
    # double glass door (centre bay)
    parts.append(bevelled_box("S_DoorL", (0.85, 0.06, 2.35), (-0.46, fy, 1.45), bevel=0.01))
    parts.append(bevelled_box("S_DoorR", (0.85, 0.06, 2.35), (0.46, fy, 1.45), bevel=0.01))
    parts.append(bevelled_box("S_DoorHead", (2.2, 0.24, 0.2), (0, fy, 2.7), bevel=0.015))
    for dx in (-1.05, 0, 1.05):
        parts.append(bevelled_box("S_DoorMullion", (0.12, 0.2, 2.5), (dx, fy, 1.5), bevel=0.015))
    # kick panels under glass
    parts.append(bevelled_box("S_KickPanel", (W - 2.6, 0.1, 0.5), (0, fy, 0.3), bevel=0.012))
    # corrugated awning with wave relief + ribs
    awn = subdivided_box("S_Awning", (W - 1.0, 1.9, 0.06), (0, D / 2 + 0.85, 3.0),
                         grid=(96, 14), wave=(0.035, 9.0))
    awn.rotation_euler = (-0.42, 0, 0)
    apply_transforms(awn)
    parts.append(awn)
    for rx in [i / 6 for i in range(-3, 4)]:
        parts.append(cylinder("S_AwningRib", 0.03, 2.0, (rx * (W - 1.6) / 2, D / 2 + 0.85, 3.05),
                              vertices=16, rotation=(1.15, 0, 0)))
    parts.append(bevelled_box("S_AwningBar", (W - 0.9, 0.1, 0.1), (0, D / 2 + 1.78, 2.62), bevel=0.012))
    # signage fascia (emissive) above the awning
    parts.append(bevelled_box("S_Fascia", (W - 0.4, 0.3, 1.0), (0, fy, 3.6), bevel=0.02))
    parts.append(bevelled_box("S_Sign", (W - 2.2, 0.12, 0.55), (0, fy + 0.18, 3.62), bevel=0.01))
    # parapet with copings
    parts.append(bevelled_box("S_ParapetF", (W, 0.22, 0.7), (0, D / 2 - 0.11, H + 0.3), bevel=0.015))
    parts.append(bevelled_box("S_ParapetB", (W, 0.22, 0.7), (0, -D / 2 + 0.11, H + 0.3), bevel=0.015))
    parts.append(bevelled_box("S_ParapetL", (0.22, D, 0.7), (-W / 2 + 0.11, 0, H + 0.3), bevel=0.015))
    parts.append(bevelled_box("S_ParapetR", (0.22, D, 0.7), (W / 2 - 0.11, 0, H + 0.3), bevel=0.015))
    # flat roof: gravel-textured subdivided top + fall
    roof = subdivided_box("S_Roof", (W - 0.5, D - 0.5, 0.16), (0, 0, H + 0.12), grid=(40, 30), wave=(0.018, 14.0))
    parts.append(roof)
    # pilasters (half-round columns framing the shopfront)
    for px in (-W / 2 + 0.55, W / 2 - 0.55):
        parts.append(cylinder("S_Pilaster", 0.28, H, (px, D / 2 - 0.02, H / 2), vertices=28, bevel=0.012))
    # interior counter (visible through the glass — real interior hint)
    parts.append(bevelled_box("S_Counter", (3.4, 0.7, 1.05), (0, D / 2 - 2.2, 0.9), bevel=0.02))
    parts.append(bevelled_box("S_CounterTop", (3.6, 0.8, 0.08), (0, D / 2 - 2.2, 1.48), bevel=0.012))
    parts.append(bevelled_box("S_Backshelf", (W - 2.0, 0.4, 1.8), (0, -D / 2 + 0.5, 1.8), bevel=0.02))

    # --- density pass (blueprint budget 20k-50k): real retail detail ---
    # mullion grids inside both display panes
    for gx in (-W / 2 + 1.3 + glass_w / 2, W / 2 - 1.3 - glass_w / 2):
        for k in range(4):
            parts.append(bevelled_box("S_MullBar", (0.05, 0.16, 2.5),
                                      (gx - glass_w / 2 + (k + 1) * glass_w / 5, fy, 1.55), bevel=0.008))
    # interior shelving with stock boxes (visible through the glass)
    for row in range(3):
        parts.append(bevelled_box("S_ShelfBoard", (W - 2.4, 0.5, 0.06),
                                  (0, -D / 2 + 0.75, 0.75 + row * 0.62), bevel=0.01))
        for bx in range(7):
            parts.append(bevelled_box("S_StockBox", (0.34, 0.3, 0.24),
                                      (-W / 2 + 2.0 + bx * 0.9, -D / 2 + 0.75, 0.95 + row * 0.62),
                                      bevel=0.012))
    # three pendant lamps over the counter
    for lx in (-1.1, 0, 1.1):
        parts.append(cylinder("S_PendantCord", 0.012, 0.7, (lx, D / 2 - 2.2, 3.55), vertices=8))
        parts.append(cylinder("S_PendantShade", 0.16, 0.18, (lx, D / 2 - 2.2, 3.15), vertices=24, bevel=0.01))
        parts.append(bevelled_box("S_PendantLED", (0.16, 0.16, 0.03), (lx, D / 2 - 2.2, 3.06), bevel=0.005))
    # signage lettering: JARVIS as bevelled block segments on the fascia
    letter_x = -3.2
    for segs, width in (((1, 0, 1), 0.9), ((1, 1, 1), 0.8), ((1, 0), 0.9),
                        ((1, 1, 0), 0.8), ((1,), 0.6), ((1, 0, 1), 0.9)):
        for i, on in enumerate(segs):
            if on:
                parts.append(bevelled_box("S_LetterSeg", (width * 0.16, 0.10, 0.42),
                                          (letter_x, fy + 0.2, 3.42 + (i - 1) * 0.23), bevel=0.008))
        letter_x += width * 0.28 + 0.55
    # cornice band under the parapet
    parts.append(subdivided_grid("S_Cornice", W - 0.2, 0.36, 0.16, (0, D / 2 - 0.1, H + 0.02), grid=(40, 4)))
    parts.append(subdivided_grid("S_CorniceB", W - 0.2, 0.36, 0.16, (0, -D / 2 + 0.1, H + 0.02), grid=(40, 4)))
    # paved apron in front of the shopfront
    parts.append(subdivided_grid("S_Apron", W + 1.0, 2.2, 0.08, (0, D / 2 + 1.3, 0.05), grid=(44, 12), wave=(0.006, 22.0)))
    # pilaster capitals + bases
    for px in (-W / 2 + 0.55, W / 2 - 0.55):
        parts.append(bevelled_box("S_PilCap", (0.72, 0.72, 0.18), (px, D / 2 - 0.02, H - 0.25), bevel=0.015))
        parts.append(bevelled_box("S_PilBase", (0.72, 0.72, 0.22), (px, D / 2 - 0.02, 0.28), bevel=0.015))

    for p in parts:
        n = p.name
        if "Glass" in n or n.startswith("S_Door"):
            nb_materials.assign(p, m_glass)
        elif "Awning" in n:
            nb_materials.assign(p, m_awning)
        elif "Sign" in n or "Fascia" in n:
            nb_materials.assign(p, m_sign)
        elif "Counter" in n or "Backshelf" in n:
            nb_materials.assign(p, m_counter)
        elif ("Pilaster" in n or "PilCap" in n or "PilBase" in n or "Mullion" in n
              or "MullBar" in n or "Frame" in n or "Kick" in n or "Parapet" in n
              or "Cornice" in n or "Pendant" in n or "LetterSeg" in n):
            nb_materials.assign(p, m_metal)
        elif "Shelf" in n or "Stock" in n or "Apron" in n:
            nb_materials.assign(p, m_counter)
        else:
            nb_materials.assign(p, m_facade)

    select_only(parts)
    shop = join_selected()
    shop.name = static_mesh_name(asset)
    return shop
