#!/usr/bin/env python3
"""STAGE 2.3 — finalize the stage2.3 checksum register.

Records the standard-format SHA256SUMS over the COMPLETE docs/stage2.3/ tree
(8 documents + evidence/). Run LAST, after every stage2.3 artifact exists and
after the evidence validator / package register have written their outputs.
"""
import hashlib
from pathlib import Path

REPO = Path("/home/z/my-project")
PKG = REPO / "docs" / "stage2.3"

entries = []
for p in sorted(PKG.rglob("*")):
    if p.is_file() and p.name != "SHA256SUMS":
        entries.append(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(REPO)}")

sums = (
    "# STAGE 2.3 package checksums (authoritative tree: docs/stage2.3/)\n"
    "# Standard sha256sum format: verify from repo root with\n"
    "#   sha256sum -c docs/stage2.3/SHA256SUMS\n"
    "# finalized at stage close (all documents + evidence present)\n"
    + "\n".join(entries) + "\n"
)
(PKG / "SHA256SUMS").write_text(sums)
print(f"OK: docs/stage2.3/SHA256SUMS — {len(entries)} files recorded")
