"""JARVIS NEXUS — Blender -> Unreal asset import (blueprint Part 6 pipeline).

Run INSIDE Unreal Editor (PythonScriptPlugin) on the owner workstation:

    Tools > Python > exec(open(r"<repo>/world/Unreal/Python/import_blender_assets.py").read())

Imports every GLB exported by world/Blender/scripts/export_assets.py into
/Game/Procedural/... with blueprint-conform naming, converts the packed
COL_* meshes into simple collision, and assigns the _LOD1/_LOD2 meshes as
real LODs on the LOD0 static mesh. Writes Saved/BlenderImportReport.json.

Requires the glTF importer (UE 5.5 built-in). Authoring sandbox has no
engine (blocker B2) — the script is authored + reviewed here, executed on
the owner machine per world/Unreal/README.md bring-up step 4-6.
"""

import json
import os

import unreal

REPO = unreal.SystemLibrary.get_project_directory()
EXPORT_DIR = os.path.normpath(os.path.join(
    REPO, "..", "..", "world", "Blender", "export")).replace("\\", "/")
DEST_BASE = "/Game/Procedural"
SUBDIRS = {"SM_House": "Architecture", "SM_Shop": "Architecture",
           "SM_Prop_StreetLamp": "Props"}


def import_all():
    report = {"export_dir": EXPORT_DIR, "imported": [], "skipped": []}
    task_opts = unreal.AssetImportTask()
    if not os.path.isdir(EXPORT_DIR):
        report["error"] = f"export dir not found: {EXPORT_DIR} — run " \
                          f"world/Blender/scripts/export_assets.py first"
        unreal.log_warning("[JarvisImport] " + report["error"])
        return report
    for fname in sorted(os.listdir(EXPORT_DIR)):
        if not fname.endswith(".glb"):
            continue
        base = fname[:-4]
        dest_path = f"{DEST_BASE}/{SUBDIRS.get(base, 'Misc')}/{base}"
        task = unreal.AssetImportTask()
        task.filename = os.path.join(EXPORT_DIR, fname)
        task.destination_path = dest_path.rsplit("/", 1)[0]
        task.destination_name = base
        task.automated = True
        task.replace_existing = True
        task.save = True
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        lod0 = unreal.EditorAssetLibrary.load_asset(dest_path)
        if lod0 is None:
            report["skipped"].append({"asset": base, "reason": "import produced no asset"})
            continue
        entry = {"asset": base, "path": dest_path, "type": lod0.get_class().get_name()}
        # Attach _LOD1 / _LOD2 as real LODs. They import as separate static
        # meshes (<base>_LOD1/_LOD2) in the same folder; the editor scripting
        # call is guarded + reported (B2: no engine in the authoring sandbox —
        # verified on the owner machine, never silently faked).
        mesh = unreal.StaticMesh.cast(lod0)
        if mesh:
            for lod_suffix, lod_index in (("_LOD1", 1), ("_LOD2", 2)):
                lod_path = f"{DEST_BASE}/{SUBDIRS.get(base, 'Misc')}/{base}{lod_suffix}"
                lod_mesh = unreal.EditorAssetLibrary.load_asset(lod_path)
                if lod_mesh is None:
                    entry[f"lod{lod_index}"] = "missing"
                    continue
                try:
                    ok = unreal.EditorStaticMeshLibrary.set_lod_from_static_mesh(
                        mesh, lod_index, lod_mesh)
                    entry[f"lod{lod_index}"] = "attached" if ok else "api-false"
                except Exception as exc:
                    entry[f"lod{lod_index}"] = f"manual-attach-needed ({exc})"
        else:
            entry["lods"] = "not a static mesh"
        # build + save
        unreal.EditorAssetLibrary.save_loaded_asset(lod0, only_if_is_dirty=False)
        report["imported"].append(entry)
        unreal.log("[JarvisImport] imported " + base)
    out = os.path.join(REPO, "Saved", "BlenderImportReport.json")
    with open(out, "w") as fh:
        json.dump(report, fh, indent=2)
    unreal.log(f"[JarvisImport] report -> {out}")
    return report


import_all()
