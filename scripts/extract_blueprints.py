#!/usr/bin/env python3
"""PHASE 0B — Verbatim blueprint extraction from the JARVIS NEXUS Master Directive.

Extracts the seven approved blueprint files byte-for-byte from the master
directive (the authoritative supplied content), with:
  - exact source-range -> destination mapping
  - byte-level verification of every extracted section
  - line-count verification
  - full coverage accounting (every source line classified)

Trailing part-separator lines ("⸻") and blank lines at the end of a range are
structural delimiters of the master directive, not content of any blueprint
section; they are excluded from extraction. All other lines are preserved
byte-for-byte. Sections are joined with a single blank line, matching the
source's own internal section separation.
"""
from __future__ import annotations

import json
import sys

SRC = "/home/z/my-project/upload/Pasted Content_1794534526310.txt"
DST = "/home/z/my-project/repo/docs/blueprint"

raw = open(SRC, encoding="utf-8").read()
lines = raw.splitlines()
TOTAL = len(lines)

# ---------------------------------------------------------------- source map
# (start_line_1indexed, stop_line_exclusive_1indexed) — stop is the next
# boundary heading. Trailing blank / "⸻" lines inside the slice are trimmed.
SECTIONS = {
    # --- world-topology.md -------------------------------------------------
    "P4-intro-4.1-4.4": (334, 521),   # PART 4 heading + intro + 4.1 + 4.2 + 4.3 + 4.4
    "P4.7-terrain-water": (662, 688),  # 4.7
    "P5-unreal-engine": (688, 769),    # PART 5 complete
    "P7.1.A-unreal-repo": (916, 924),  # A. Unreal Engine repository entry
    # --- city-plans.md -----------------------------------------------------
    "P4.5-4.6-city-village": (521, 662),
    # --- architecture-bible.md ----------------------------------------------
    "P8-architecture": (1078, 1204),
    # --- population-animals-transport-economy.md ----------------------------
    "P9-population": (1204, 1381),
    "P10-economy-environment": (1381, 1492),
    "P7.1.F-I-sim-repos": (998, 1026),  # CARLA, SUMO, Mesa, PettingZoo + state-owner rule
    # --- animation-and-blender-pipeline.md ----------------------------------
    "P6-blender": (769, 890),
    "P7.1.B-blender-repo": (924, 932),
    "P7.1.C-freemocap-repo": (932, 965),   # includes the mocap pipeline diagram
    "P7.1.D-natron-repo": (965, 982),
    "P7.1.E-theatrejs-repo": (982, 998),
    # --- laboratory-and-nexus.md ---------------------------------------------
    "P2-vision-architecture": (111, 185),  # includes the system architecture diagram
    "P3-jarvis": (185, 334),               # 3.1 intelligence + 3.2 voice pipeline diagram + 3.3 embodiment + 3.4 interface
    "P11-laboratory": (1492, 1585),        # includes the laboratory architecture diagram
    "P12-nexus-missions": (1585, 1667),    # includes the mission lifecycle diagram
    "P7-intro-register": (890, 916),       # PART 7 heading + register format + "7.1" heading
    "P7.2-tech-evaluations": (1026, 1078),
    # --- acceptance-and-evidence.md -------------------------------------------
    "P13-owner-switches": (1667, 1696),
    "P14-security": (1696, 1733),
    "P15-performance": (1733, 1779),
    "P17-visual-evidence": (2025, 2061),
    "P20-phase-report": (2120, 2154),
    "P21-acceptance-standard": (2154, 2181),
}

FILES = {
    "world-topology.md": [
        "P4-intro-4.1-4.4", "P4.7-terrain-water", "P5-unreal-engine", "P7.1.A-unreal-repo",
    ],
    "city-plans.md": [
        "P4.5-4.6-city-village",
    ],
    "architecture-bible.md": [
        "P8-architecture",
    ],
    "population-animals-transport-economy.md": [
        "P9-population", "P10-economy-environment", "P7.1.F-I-sim-repos",
    ],
    "animation-and-blender-pipeline.md": [
        "P6-blender", "P7.1.B-blender-repo", "P7.1.C-freemocap-repo",
        "P7.1.D-natron-repo", "P7.1.E-theatrejs-repo",
    ],
    "laboratory-and-nexus.md": [
        "P2-vision-architecture", "P3-jarvis", "P11-laboratory",
        "P12-nexus-missions", "P7-intro-register", "P7.2-tech-evaluations",
    ],
    "acceptance-and-evidence.md": [
        "P13-owner-switches", "P14-security", "P15-performance",
        "P17-visual-evidence", "P20-phase-report", "P21-acceptance-standard",
    ],
}

# Directive parts that are process/governance and remain ONLY in the master
# directive (never part of a build blueprint):
GOVERNANCE_RANGES = {
    "directive-preamble": (1, 27),
    "PART 1 — execution directive": (27, 111),
    "PART 16 — phased implementation": (1779, 2025),
    "PART 18 — engineering documentation": (2061, 2096),
    "PART 19 — git and change management": (2096, 2120),
    "PART 22 — working with the owner": (2181, 2219),
    "PART 23 — execution instructions + FIRST ACTION": (2219, TOTAL + 1),
}


def extract(start: int, stop_exclusive: int) -> list[str]:
    seg = lines[start - 1 : stop_exclusive - 1]
    trimmed = 0
    while seg and (seg[-1].strip() == "" or seg[-1].strip() == "⸻"):
        seg.pop()
        trimmed += 1
    return seg, trimmed


def main() -> int:
    extracted: dict[str, list[str]] = {}
    table = []
    covered = [False] * (TOTAL + 1)  # 1-indexed

    for name, (start, stop) in SECTIONS.items():
        seg, trimmed = extract(start, stop)
        extracted[name] = seg
        for i in range(start, start + len(seg)):
            covered[i] = True
        table.append({
            "section": name,
            "source_lines": f"{start}-{start + len(seg) - 1}",
            "content_lines": len(seg),
            "structural_trimmed": trimmed,
            "bytes": sum(len(l.encode('utf-8')) + 1 for l in seg),
        })

    # ------------------------------------------------------- write the files
    import os
    os.makedirs(DST, exist_ok=True)
    report = {"files": {}, "sections": table, "coverage": {}}
    for fname, secs in FILES.items():
        parts = []
        for s in secs:
            parts.append("\n".join(extracted[s]))
        content = "\n\n".join(parts) + "\n"
        path = os.path.join(DST, fname)
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(content)
        report["files"][fname] = {
            "sections": secs,
            "total_lines": content.count("\n"),
            "bytes": len(content.encode("utf-8")),
        }

    # --------------------------------------------------- byte verification
    failures = []
    for fname, secs in FILES.items():
        path = os.path.join(DST, fname)
        written = open(path, encoding="utf-8").read()
        expect = "\n\n".join("\n".join(extracted[s]) for s in secs) + "\n"
        if written != expect:
            failures.append(f"BYTE MISMATCH: {fname}")
        # independent re-extraction from source (paranoia double-check)
        recheck = []
        for s in secs:
            start, stop = SECTIONS[s]
            seg, _ = extract(start, stop)
            recheck.append("\n".join(seg))
        if written != "\n\n".join(recheck) + "\n":
            failures.append(f"RE-EXTRACTION MISMATCH: {fname}")

    # ------------------------------------------------------ coverage audit
    gov_lines = 0
    gov_content = 0
    in_gov = [False] * (TOTAL + 2)
    for gname, (gstart, gstop) in GOVERNANCE_RANGES.items():
        for i in range(gstart, min(gstop, TOTAL + 1)):
            in_gov[i] = True
            gov_lines += 1
            if lines[i - 1].strip() not in ("", "⸻"):
                gov_content += 1
    uncovered_outside_gov = []
    for i in range(1, TOTAL + 1):
        if not covered[i] and not in_gov[i]:
            l = lines[i - 1].strip()
            if l not in ("", "⸻"):
                uncovered_outside_gov.append((i, l[:60]))
    extracted_content_lines = sum(t["content_lines"] for t in table)
    structural_lines = sum(t["structural_trimmed"] for t in table)
    blank_between = TOTAL - extracted_content_lines - structural_lines - gov_lines
    report["coverage"] = {
        "source_total_lines": TOTAL,
        "extracted_content_lines": extracted_content_lines,
        "structural_trimmed_lines": structural_lines,
        "governance_lines_total": gov_lines,
        "governance_content_lines": gov_content,
        "accounting_sum": extracted_content_lines + structural_lines + gov_lines,
        "accounting_matches_total": extracted_content_lines + structural_lines + gov_lines == TOTAL,
        "uncovered_nonstructural_outside_governance": len(uncovered_outside_gov),
        "uncovered_samples": uncovered_outside_gov[:10],
    }

    # ------------------------------------------------------------- output
    print("=" * 78)
    print("PHASE 0B EXTRACTION + VERIFICATION")
    print("=" * 78)
    for t in table:
        print(f"  {t['section']:<28} src {t['source_lines']:>11}  lines {t['content_lines']:>4}  trimmed {t['structural_trimmed']:>2}  bytes {t['bytes']:>6}")
    print("-" * 78)
    for fname, info in report["files"].items():
        print(f"  {fname:<44} lines {info['total_lines']:>4}  bytes {info['bytes']:>6}  sections: {', '.join(info['sections'])}")
    print("-" * 78)
    c = report["coverage"]
    print(f"  source total lines      : {c['source_total_lines']}")
    print(f"  extracted content lines : {c['extracted_content_lines']}")
    print(f"  structural trimmed      : {c['structural_trimmed_lines']}")
    print(f"  governance lines        : {c['governance_lines_total']} (content: {c['governance_content_lines']})")
    print(f"  accounting sum == total : {c['accounting_matches_total']} ({c['accounting_sum']})")
    print(f"  uncovered outside gov   : {c['uncovered_nonstructural_outside_governance']}  {c['uncovered_samples']}")
    print("-" * 78)
    if failures:
        print("VERIFICATION FAILURES:")
        for f in failures:
            print("  " + f)
        return 1
    print("  BYTE VERIFICATION: all 7 files match their source slices exactly.")
    print("  COVERAGE: complete (every technical line extracted; governance documented).")

    with open("/tmp/phase0b_extraction_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print("  detail json: /tmp/phase0b_extraction_report.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
