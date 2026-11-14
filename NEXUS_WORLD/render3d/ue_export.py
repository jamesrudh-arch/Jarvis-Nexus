"""Blender→Unreal asset pipeline — UE-ready export bundle (PRIORITY 3+4).

bpy side: export the current scene as a bundle of USD + FBX + glTF with
UE-appropriate exporter settings (operator kwargs are INTROSPECTED at
runtime so only settings this Blender build actually supports are set —
no blind kwargs that crash on 5.x API deltas).

py3.12 side: manifest builder describing the bundle for the Unreal MCP
import tool (naming conventions, axis/unit conventions, import steps).
"""
from __future__ import annotations

import json
import os
import time


def _result(**kw) -> str:
    return json.dumps(kw, sort_keys=True)


# ------------------------------------------------------------- bpy side
def export_unreal_bundle(out_dir: str, fmts=("usd", "fbx", "glb")) -> str:
    """Export the CURRENTLY OPEN scene into out_dir as a UE-ready bundle.
    Returns per-format results with magic-byte verification left to the
    caller (py3.12 side, _check_magic)."""
    import bpy
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)
    results = []

    def _op_kwargs(op, wanted: dict) -> dict:
        """Keep only kwargs the operator actually exposes (5.x-safe)."""
        props = {}
        for identifier, _prop in op.get_rna_type().properties.items():
            props[identifier] = True
        return {k: v for k, v in wanted.items() if k in props}

    for fmt in fmts:
        path = os.path.join(out_dir, f"nexus_world.{fmt}")
        t1 = time.time()
        try:
            if fmt == "usd":
                kw = _op_kwargs(bpy.ops.wm.usd_export, {
                    "filepath": path,
                    "export_materials": True,
                    "export_uvmaps": True,
                    "export_hair": False,
                    "export_particles": False,
                    "global_scale": 1.0,
                    "evaluate_settings": True,
                })
                bpy.ops.wm.usd_export(**kw)
            elif fmt == "fbx":
                kw = _op_kwargs(bpy.ops.export_scene.fbx, {
                    "filepath": path,
                    "use_selection": False,
                    "apply_unit_scale": True,
                    "apply_scale_options": "FBX_SCALE_ALL",
                    "axis_forward": "-Z",
                    "axis_up": "Y",
                    "bake_space_transform": True,
                    "object_types": {"MESH", "ARMATURE"},
                    "add_leaf_bones": False,
                    "bake_anim": True,
                    "use_mesh_modifiers": True,
                })
                bpy.ops.export_scene.fbx(**kw)
            elif fmt == "glb":
                kw = _op_kwargs(bpy.ops.export_scene.gltf, {
                    "filepath": path,
                    "export_format": "GLB",
                    "export_yup": True,
                    "export_animations": True,
                    "export_extras": True,
                })
                bpy.ops.export_scene.gltf(**kw)
            else:
                continue
            size = os.path.getsize(path) if os.path.exists(path) else 0
            results.append({"fmt": fmt, "path": path, "bytes": size,
                            "ok": size > 0,
                            "elapsed_ms": round((time.time() - t1) * 1000,
                                                1)})
        except Exception as exc:  # noqa: BLE001 — honest per-format failure
            results.append({"fmt": fmt, "ok": False,
                            "error": f"{type(exc).__name__}: {exc}"})
    ok_all = bool(results) and all(r.get("ok") for r in results)
    return _result(ok=ok_all, bundle_dir=out_dir, files=results,
                   elapsed_ms=round((time.time() - t0) * 1000, 1))


# ---------------------------------------------------------- py3.12 side
NAMING_CONVENTIONS = {
    "nx_terrain": "SM_Terrain",
    "nx_water": "SM_Water",
    "nx_park": "SM_ParkGround",
    "nx_tree": "SM_Tree_{trunk|crown}",
    "nx_rock": "SM_Rock",
    "nx_char": "SK_Character_{part} (rig: nx_rig -> SK_{id})",
    "nx_bird": "SM_Bird / wing parts parent-animated",
    "nx_quadruped": "SM_Quadruped",
    "bld:": "SM_Building_{id}",
    "res-body:": "legacy markers (kept for parity renders)",
}

CONVENTIONS_NOTES = {
    "axis": ("Blender is Z-up right-handed; UE is Z-up left-handed. "
             "USD import into UE 5.4+ handles the conversion natively; "
             "FBX bundle exports with -Z forward / Y up + baked space "
             "transform; glTF with +Y up."),
    "units": ("Blender native metres. UE works in centimetres — USD "
              "carries metres-per-unit metadata and UE converts on "
              "import; the FBX export applies unit scale."),
    "materials": ("Principled BSDF names map to M_<name> on import "
                  "(USD/gltf carry materials; FBX carries lambert-ish "
                  "approximations)."),
    "animation": ("Armature bone animation exports through all three "
                  "formats (FBX bake_anim, glTF export_animations, USD "
                  "native); UE imports as AnimSequences on the SK_ "
                  "skeleton."),
    "import_tool": ("mcp unreal_server.import_asset(asset_path=<bundle "
                    "file>, dest_path='/Game/NEXUS') — see "
                    "docs/UNREAL_MCP_REQUIREMENTS.md"),
}


def build_manifest(bundle_dir: str, export_result: dict, world_desc=None,
                   spec_summary=None) -> dict:
    """Assemble the import-side manifest for the UE pipeline."""
    files = []
    for f in sorted(os.listdir(bundle_dir)):
        p = os.path.join(bundle_dir, f)
        if os.path.isfile(p):
            files.append({"file": f, "bytes": os.path.getsize(p)})
    manifest = {
        "bundle": os.path.basename(bundle_dir),
        "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ",
                                       time.gmtime()),
        "files": files,
        "export_result": export_result,
        "naming_conventions": NAMING_CONVENTIONS,
        "conventions": CONVENTIONS_NOTES,
        "unreal_import": {
            "tool": "mcp_servers/unreal_server.py::import_asset",
            "dest_path": "/Game/NEXUS",
            "verified_import": False,
            "note": ("import verified only after real UE 5.4+ editor "
                     "execution — see UNREAL_MCP_REQUIREMENTS.md §5")},
    }
    if world_desc:
        manifest["world"] = {
            "grid": world_desc.get("grid"),
            "parks": len(world_desc.get("parks", [])),
            "trees": len(world_desc.get("trees", [])),
            "rocks": len(world_desc.get("rocks", [])),
            "water_cells": len(world_desc.get("water_cells", []))}
    if spec_summary:
        manifest["scene"] = spec_summary
    out = os.path.join(bundle_dir, "manifest.json")
    with open(out, "w") as fh:
        json.dump(manifest, fh, indent=1)
    manifest["manifest_path"] = out
    return manifest
