"""PBR material factory (Principled BSDF + packed procedural texture maps)."""

import bpy

from .naming import material_name
from . import textures as nb_textures


def _set_input(bsdf, names, value):
    """Set the first existing input (Blender renamed several Principled BSDF
    inputs across 3.x -> 5.x, e.g. Transmission -> Transmission Weight)."""
    for name in names:
        sock = bsdf.inputs.get(name)
        if sock is not None:
            sock.default_value = value
            return
    raise KeyError(f"none of {names} exist on Principled BSDF")


def make_material(asset: str, slot: str, *, seed: int = 7,
                  base_color=(0.8, 0.8, 0.8), roughness=0.6, metallic=0.0,
                  with_textures=True, transmission=0.0, emission=None):
    """Create (or reuse) ``M_<Asset>_<slot>`` with a Principled BSDF.

    ``with_textures``: wire the procedural packed T_ maps (base colour +
    roughness variation) — brick/plaster/metal variants are chosen by slot
    name (see nexusblender.textures).
    """
    name = material_name(asset, slot)
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    _set_input(bsdf, ("Roughness", "Roughness Weight"), roughness)
    _set_input(bsdf, ("Metallic", "Metallic Weight"), metallic)
    if transmission:
        _set_input(bsdf, ("Transmission", "Transmission Weight"), transmission)
    if emission is not None:
        _set_input(bsdf, ("Emission Color", "Emission"), (*emission, 1.0))
        bsdf.inputs["Emission Strength"].default_value = 4.0
    if with_textures:
        maps = nb_textures.slot_images(f"{asset}{slot}", seed)
        nt = mat.node_tree
        tex_bc = nt.nodes.new("ShaderNodeTexImage")
        tex_bc.image = maps["base_color"]
        tex_bc.location = (-600, 200)
        tex_r = nt.nodes.new("ShaderNodeTexImage")
        tex_r.image = maps["roughness"]
        tex_r.location = (-600, -150)
        nt.links.new(tex_bc.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])
    mat.blend_method = "BLEND" if transmission else "OPAQUE"
    return mat


def assign(obj: bpy.types.Object, mat: bpy.types.Material):
    if mat.name not in obj.data.materials:
        obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.material_index = obj.data.materials.find(mat.name)
