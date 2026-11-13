"""Environmental prop: SM_Prop_StreetLamp (LOD0 500–5k triangles).

A 4.2 m twin-head park lamp: flanged base with bolts, decorative rings,
tapered pole, curved arm, lamp housing with emissive LED panel and glass.
"""

import math

import bpy

from . import materials as nb_materials
from .naming import static_mesh_name
from .trimesh import apply_transforms, join_selected, select_only
from .architecture import bevelled_box, cylinder


def build_street_lamp() -> bpy.types.Object:
    asset = "Prop_StreetLamp"
    m_metal = nb_materials.make_material(asset, "Metal", seed=101,
                                         base_color=(0.20, 0.22, 0.26),
                                         roughness=0.4, metallic=0.6)
    m_glass = nb_materials.make_material(asset, "Glass", seed=103,
                                         base_color=(0.85, 0.9, 0.95),
                                         roughness=0.05, transmission=0.9,
                                         with_textures=False)
    m_led = nb_materials.make_material(asset, "LED", seed=107,
                                       base_color=(1, 0.97, 0.85),
                                       roughness=0.3, with_textures=False,
                                       emission=(1.0, 0.95, 0.8))

    parts = []
    # base flange + bolts
    parts.append(cylinder("L_BaseFlange", 0.24, 0.10, (0, 0, 0.05), vertices=36, bevel=0.012))
    for i in range(6):
        a = i * math.pi / 3
        parts.append(cylinder("L_Bolt", 0.022, 0.09,
                              (0.17 * math.cos(a), 0.17 * math.sin(a), 0.13),
                              vertices=10))
    # tapered pole (stacked cylinder segments with decreasing radius)
    z = 0.10
    pole_segs = [(0.11, 1.0), (0.095, 1.0), (0.08, 1.0), (0.068, 0.9)]
    for i, (r, h) in enumerate(pole_segs):
        parts.append(cylinder(f"L_Pole_{i}", r, h, (0, 0, z + h / 2), vertices=28, bevel=0.008))
        z += h
    # decorative rings
    parts.append(cylinder("L_Ring1", 0.135, 0.05, (0, 0, 0.28), vertices=36, bevel=0.01))
    parts.append(cylinder("L_Ring2", 0.15, 0.04, (0, 0, 1.25), vertices=36, bevel=0.01))
    # curved arm: quarter-torus segment via swept circle of small cylinders
    arm_r = 0.55
    for i in range(7):
        a = i / 6 * (math.pi / 2)
        ax = arm_r * math.cos(a)
        az = arm_r * math.sin(a)
        parts.append(cylinder("L_Arm", 0.045, 0.14,
                              (ax - 0.0, 0, 3.9 + az - arm_r * 0.0),
                              vertices=16, rotation=(math.pi / 2, 0, 0)))
    # lamp head: housing + glass + LED panel
    parts.append(bevelled_box("L_HeadShell", (0.62, 0.42, 0.20), (0.62, 0, 4.28), bevel=0.025))
    parts.append(bevelled_box("L_HeadGlass", (0.54, 0.34, 0.05), (0.62, 0, 4.19), bevel=0.008, segments=2))
    parts.append(bevelled_box("L_LEDPanel", (0.48, 0.28, 0.03), (0.62, 0, 4.17), bevel=0.005, segments=1))
    # head cap + finial
    parts.append(bevelled_box("L_HeadCap", (0.68, 0.48, 0.06), (0.62, 0, 4.41), bevel=0.015))
    parts.append(cylinder("L_Finial", 0.03, 0.16, (0.62, 0, 4.52), vertices=14, bevel=0.006))
    # maintenance hatch under the head
    parts.append(bevelled_box("L_Hatch", (0.30, 0.22, 0.05), (0.62, 0, 4.10), bevel=0.008))

    for p in parts:
        n = p.name
        if "Glass" in n:
            nb_materials.assign(p, m_glass)
        elif "LED" in n:
            nb_materials.assign(p, m_led)
        else:
            nb_materials.assign(p, m_metal)

    select_only(parts)
    lamp = join_selected()
    lamp.name = static_mesh_name(asset)
    return lamp
