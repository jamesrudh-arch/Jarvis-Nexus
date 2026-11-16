#!/usr/bin/env python3
"""Regenerate docs/stage2.4b/SHA256SUMS over the final evidence package
(production-acceptance extension). Repo-root-relative, CI-loop compatible."""
import hashlib
import os
import sys

ROOT = "/home/z/my-project"
PKG = "docs/stage2.4b"
EXTRA = [
    "scripts/stage24b/apply_production_backup_config.py",
    "scripts/stage24b/push_integration.sh",
    "scripts/stage24b/deploy_and_verify.py",
    "scripts/stage24b/regen_sha256sums.py",
]

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()

entries = []
for dirpath, _dirs, files in os.walk(os.path.join(ROOT, PKG)):
    for name in sorted(files):
        rel = os.path.relpath(os.path.join(dirpath, name), ROOT)
        if rel == f"{PKG}/SHA256SUMS":
            continue
        entries.append(rel)
for rel in EXTRA:
    if os.path.exists(os.path.join(ROOT, rel)):
        entries.append(rel)
    else:
        print(f"MISSING expected file: {rel}", file=sys.stderr)
        sys.exit(1)
entries.sort()

header = f"""# STAGE 2.4B package checksums (authoritative tree: docs/stage2.4b/)
# Standard sha256sum format: verify from repo root with
#   sha256sum -c docs/stage2.4b/SHA256SUMS
# Covers the required deliverables, appendix/first-pass/ (first-pass documents,
# preserved verbatim), evidence/ incl. the reverify/ second-pass record, the
# production-acceptance extension (report + session evidence) and the three
# Stage 2.4B production-execution scripts under scripts/stage24b/.
# Regenerated {__import__('time').strftime('%Y-%m-%dT%H:%M:%SZ', __import__('time').gmtime())} for the production acceptance package.
"""
lines = [f"{sha256(os.path.join(ROOT, rel))}  {rel}" for rel in entries]
with open(os.path.join(ROOT, PKG, "SHA256SUMS"), "w") as f:
    f.write(header)
    f.write("\n".join(lines) + "\n")
print(f"wrote {len(lines)} checksums")
