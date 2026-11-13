"""Collision meshes (COL_ naming, blueprint).

Simple-convex convention aligned with Unreal's simple-collision import:
per-part boxes/cylinders parented to the asset root, named
``COL_<Asset>[_<part>]``. They ship inside the same GLB so the Unreal
import step can convert them to blocking volumes directly.
"""

import bpy

from .naming import collision_name


def add_box_collision(asset: str, part: str, size, location) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    box = bpy.context.active_object
    box.name = collision_name(asset, part)
    box.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    box.display_type = "WIRE"
    box.hide_render = True
    return box


def add_cylinder_collision(asset: str, part: str, radius: float, depth: float,
                           location, rotation=(0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth,
                                        location=location, rotation=rotation,
                                        vertices=12)
    cyl = bpy.context.active_object
    cyl.name = collision_name(asset, part)
    # bake the transform so the object is identity with world-space data
    # (same convention as the box path; the validator enforces it)
    bpy.context.view_layer.objects.active = cyl
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    cyl.display_type = "WIRE"
    cyl.hide_render = True
    return cyl


def attach_hierarchy(root: bpy.types.Object, children):
    """Parent LOD + collision meshes to the LOD0 root (clean GLB hierarchy)."""
    for child in children:
        child.parent = root
