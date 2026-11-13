"""Mesh utilities: triangle counting, transform application, triangulated evaluation."""

import bpy


def triangle_count(obj_or_mesh) -> int:
    """Triangle count of an object's evaluated mesh (quads/ngons counted correctly)."""
    mesh = obj_or_mesh.data if hasattr(obj_or_mesh, "data") else obj_or_mesh
    tris = 0
    for poly in mesh.polygons:
        n = len(poly.vertices)
        tris += max(1, n - 2)
    return tris


def evaluated_triangle_count(obj: bpy.types.Object, depsgraph=None) -> int:
    """Triangle count AFTER modifiers (bevel/subsurf/decimate are applied)."""
    if depsgraph is None:
        depsgraph = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(depsgraph)
    return triangle_count(ev)


def total_triangles(objects) -> int:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    return sum(evaluated_triangle_count(o, depsgraph) for o in objects
               if o.type == "MESH")


def apply_transforms(obj: bpy.types.Object):
    """Apply location/rotation/scale so the object transform is identity
    (blueprint validation: 'Applied transforms')."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def apply_all_transforms(objects):
    for obj in objects:
        if obj.type in {"MESH", "EMPTY"}:
            apply_transforms(obj)


def select_only(objects):
    for o in bpy.data.objects:
        o.select_set(o in objects)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def join_selected() -> bpy.types.Object:
    """Join the current selection into the active object (returns it)."""
    bpy.ops.object.join()
    return bpy.context.active_object


def dimensions_m(obj: bpy.types.Object) -> list:
    """World dimensions in metres, rounded for metadata JSON."""
    d = obj.dimensions
    return [round(float(d.x), 3), round(float(d.y), 3), round(float(d.z), 3)]
