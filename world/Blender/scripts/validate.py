#!/usr/bin/env python3
"""JARVIS NEXUS — executable asset VALIDATION (blueprint Part 6).

Checks EVERY .blend in architecture/ + assets/ against the blueprint:

  * Scale in metres (1 unit == 1 m; dimensions in sane metre ranges)
  * Applied transforms (identity matrix on every export mesh)
  * Missing materials (no material-free export mesh)
  * UV availability + validity (non-degenerate UV on every mesh)
  * Collision meshes present (COL_*)
  * LOD presence (LOD0 + _LOD1 + _LOD2 per asset)
  * Naming conventions (SM_/SK_/M_/T_/A_/COL_)
  * Triangulation requirements (LOD0 within the blueprint budget)
  * Metadata JSON (META_* text block with all required fields)

Exit code 0 = all assets valid; 1 = any failure. Writes
validation/ValidationReport.json (machine-readable evidence).
"""

import glob
import json
import os
import re
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # world/Blender  (HERE == scripts/)

sys.path.insert(0, HERE)
from nexusblender.naming import TRI_BUDGETS  # noqa: E402
from nexusblender.trimesh import evaluated_triangle_count  # noqa: E402

REQUIRED_META_FIELDS = ["author", "licence", "source", "triangle_count",
                        "dimensions_m", "scale", "export_format"]
NAME_RE = re.compile(r"^(SM|SK|COL)_[A-Za-z0-9_]+(_LOD[12])?$")

#: sanity ranges (metres) so "scale in metres" is testable, not assumed
DIMENSION_RANGES = {
    "House": (4.0, 20.0), "Shop": (4.0, 25.0), "Prop_StreetLamp": (0.2, 8.0),
}


def asset_key_from_name(name: str):
    for key in ("Prop_StreetLamp", "House", "Shop"):
        if key in name:
            return key
    return None


def validate_blend(path: str) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.open_mainfile(filepath=path)
    issues = []
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    export_meshes = [o for o in meshes if o.name.startswith(("SM_", "SK_"))]
    collision = [o for o in meshes if o.name.startswith("COL_")]

    if not export_meshes:
        issues.append("no SM_/SK_ export meshes")
    # naming + LOD presence per asset
    assets = {asset_key_from_name(o.name) for o in export_meshes}
    assets.discard(None)
    for key in assets:
        names = {o.name for o in export_meshes}
        for suffix in ("", "_LOD1", "_LOD2"):
            want = f"SM_{key}{suffix}"
            if want not in names:
                issues.append(f"missing LOD mesh {want}")
    for o in meshes:
        if not NAME_RE.match(o.name):
            issues.append(f"naming convention violation: {o.name}")
    # transforms applied
    for o in export_meshes + collision:
        m = o.matrix_local
        ident = abs(m[0][0] - 1) < 1e-6 and abs(m[1][1] - 1) < 1e-6 and abs(m[2][2] - 1) < 1e-6
        off = sum(abs(m[i][3]) for i in range(3)) + sum(abs(m[i][j]) for i in range(3) for j in range(3) if i != j)
        if not (ident and off < 1e-6):
            issues.append(f"transforms not applied: {o.name}")
    # materials
    for o in export_meshes:
        if not o.data.materials or any(m is None for m in o.data.materials):
            issues.append(f"missing material: {o.name}")
    # UV availability + validity
    for o in export_meshes:
        if not o.data.uv_layers:
            issues.append(f"no UV layer: {o.name}")
        else:
            uv = o.data.uv_layers[0]
            coords = list(uv.data)
            xs = [c.uv.x for c in coords]; ys = [c.uv.y for c in coords]
            if not coords or (max(xs) - min(xs) < 0.01 and max(ys) - min(ys) < 0.01):
                issues.append(f"degenerate UVs: {o.name}")
    # collision present
    if not collision:
        issues.append("no COL_ collision meshes")
    # scale in metres + triangulation budgets (LOD0 only)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for o in export_meshes:
        key = asset_key_from_name(o.name)
        if not key:
            continue
        if o.name.endswith(("_LOD1", "_LOD2")):
            continue
        budget = TRI_BUDGETS["prop" if key.startswith("Prop") else key.lower()]
        tris = evaluated_triangle_count(o, depsgraph)
        if not (budget[0] <= tris <= budget[1]):
            issues.append(f"{o.name}: {tris} tris outside budget {budget}")
        dim = o.dimensions
        lo, hi = DIMENSION_RANGES.get(key, (0.05, 30.0))
        largest = max(abs(dim.x), abs(dim.y), abs(dim.z))
        if not (lo * 0.4 <= largest <= hi * 2.5):
            issues.append(f"{o.name}: largest dimension {largest:.2f} outside metre range")
    # metadata JSON
    meta_blocks = [t for t in bpy.data.texts if t.name.startswith("META_")]
    if not meta_blocks:
        issues.append("no META_* metadata text block")
    for t in meta_blocks:
        try:
            meta = json.loads(t.as_string())
        except Exception as exc:
            issues.append(f"{t.name}: invalid JSON ({exc})")
            continue
        for field in REQUIRED_META_FIELDS:
            if field not in meta:
                issues.append(f"{t.name}: metadata missing '{field}'")
    return {"blend": os.path.relpath(path, ROOT), "valid": not issues,
            "issues": issues, "meshes": len(meshes)}


def main():
    blends = sorted(glob.glob(os.path.join(ROOT, "architecture", "*.blend"))
                    + glob.glob(os.path.join(ROOT, "assets", "*.blend")))
    results = [validate_blend(p) for p in blends]
    all_valid = all(r["valid"] for r in results) and bool(results)
    report = {"validator": "world/Blender/scripts/validate.py",
              "blender": bpy.app.version_string,
              "assets_checked": len(results), "all_valid": all_valid,
              "results": results}
    out = os.path.join(ROOT, "validation", "ValidationReport.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(json.dumps(report, indent=2))
    sys.exit(0 if all_valid else 1)


if __name__ == "__main__":
    main()
