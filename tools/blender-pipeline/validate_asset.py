#!/usr/bin/env python3
"""
Headless validation harness for the NEXUS asset pipeline.

Runs WITHOUT Blender: validates ConstructionSpec structures emitted by the
NEXUS Creation Engine against the asset quality standards (directive §9.2,
§9.3) — dimensional sanity, road connectivity, spacing, spec completeness.
Executed in CI (`bun test` scenario H augments this) so specification quality
is continuously enforced even though geometry production requires the
workstation Blender host (ADR-009).
"""
import json
import math
import sys
from pathlib import Path

STANDARDS = {
    "min_structure_dimension": 1.0,
    "max_structure_dimension": 200.0,
    "min_road_width": 3.0,
    "max_structure_overlap_ratio": 0.2,
    "required_spec_fields": ["specId", "kind", "regionId", "structures", "roads", "populationPlan"],
    "required_structure_fields": ["structureId", "type", "position", "dimensions"],
}


def validate_spec(spec: dict) -> dict:
    issues, warnings = [], []

    for field in STANDARDS["required_spec_fields"]:
        if field not in spec:
            issues.append(f"missing spec field: {field}")

    structures = spec.get("structures", [])
    roads = spec.get("roads", [])

    if not structures:
        issues.append("spec has no structures")

    # structure-level validation
    for st in structures:
        for field in STANDARDS["required_structure_fields"]:
            if field not in st:
                issues.append(f"{st.get('structureId', '?')}: missing field {field}")
        dims = st.get("dimensions", {})
        for axis in ("w", "h", "d"):
            v = dims.get(axis, 0)
            if not (STANDARDS["min_structure_dimension"] <= v <= STANDARDS["max_structure_dimension"]):
                issues.append(f"{st.get('structureId', '?')}: {axis}={v} outside production range")
        pos = st.get("position", {})
        if not all(k in pos for k in ("x", "y", "z")):
            issues.append(f"{st.get('structureId', '?')}: position missing x/y/z")

    # road connectivity: every structure should be within 150m of a road endpoint
    for st in structures:
        pos = st.get("position", {})
        near_road = any(
            math.hypot(pos.get("x", 0) - r.get("from", {}).get("x", 1e9), pos.get("z", 0) - r.get("from", {}).get("z", 1e9)) < 150
            or math.hypot(pos.get("x", 0) - r.get("to", {}).get("x", 1e9), pos.get("z", 0) - r.get("to", {}).get("z", 1e9)) < 150
            for r in roads
        ) if roads else False
        if roads and not near_road:
            warnings.append(f"{st.get('structureId', '?')}: no road endpoint within 150m")

    for r in roads:
        if r.get("width", 0) < STANDARDS["min_road_width"]:
            issues.append(f"road {r.get('from')}->{r.get('to')}: width {r.get('width')} < {STANDARDS['min_road_width']}m")

    # overlap check (AABB 2D)
    for i, a in enumerate(structures):
        for b in structures[i + 1:]:
            ax, az = a["position"]["x"], a["position"]["z"]
            bx, bz = b["position"]["x"], b["position"]["z"]
            ow = max(0, min(ax + a["dimensions"]["w"] / 2, bx + b["dimensions"]["w"] / 2) - max(ax - a["dimensions"]["w"] / 2, bx - b["dimensions"]["w"] / 2))
            od = max(0, min(az + a["dimensions"]["d"] / 2, bz + b["dimensions"]["d"] / 2) - max(az - a["dimensions"]["d"] / 2, bz - b["dimensions"]["d"] / 2))
            area_a = a["dimensions"]["w"] * a["dimensions"]["d"]
            if area_a > 0 and (ow * od) / area_a > STANDARDS["max_structure_overlap_ratio"]:
                issues.append(f"{a['structureId']} overlaps {b['structureId']} by {100 * (ow * od) / area_a:.0f}%")

    return {"ok": len(issues) == 0, "issues": issues, "warnings": warnings, "standards": STANDARDS}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: validate_asset.py <spec.json>")
        sys.exit(2)
    spec = json.loads(Path(sys.argv[1]).read_text())
    result = validate_spec(spec)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["ok"] else 1)
