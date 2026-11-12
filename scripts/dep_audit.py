#!/usr/bin/env python3
"""Dependency audit: which package.json deps are actually imported by app code?

Usage: python3 scripts/dep_audit.py [--include-ui]

Scans src/ (app code, excluding src/components/ui boilerplate unless --include-ui),
plus root config files, for imports/requires of each dependency.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INCLUDE_UI = "--include-ui" in sys.argv

with open(os.path.join(ROOT, "package.json")) as f:
    pkg = json.load(f)

deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

# Files that count as "app code"
src_dir = os.path.join(ROOT, "src")
app_files = []
for dirpath, dirnames, filenames in os.walk(src_dir):
    if not INCLUDE_UI and os.path.join(dirpath) == os.path.join(src_dir, "components", "ui"):
        dirnames[:] = []  # skip ui boilerplate subtree
        continue
    for fn in filenames:
        if fn.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs", ".css")):
            app_files.append(os.path.join(dirpath, fn))

config_files = [
    "next.config.ts", "postcss.config.mjs", "tailwind.config.ts",
    "eslint.config.mjs", "components.json", "prisma/schema.prisma",
]
config_blobs = ""
for cf in config_files:
    p = os.path.join(ROOT, cf)
    if os.path.exists(p):
        with open(p, errors="replace") as f:
            config_blobs += f"\n/* {cf} */\n" + f.read()

# package.json scripts reference some CLIs (prisma, next, eslint)
scripts_blob = json.dumps(pkg.get("scripts", {}))

import_re = re.compile(
    r"""(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*|import\s+["'])(["'])([^"']+)\1"""
)


def pkg_import_pattern(pkg_name):
    # match 'pkg' or 'pkg/subpath' or '@scope/pkg' or '@scope/pkg/sub'
    return re.compile(r"^[a-zA-Z@][^\"']*$")


results = {}
for dep in sorted(deps):
    pat = re.compile(r"^(?:" + re.escape(dep) + r")(?:/[^\"']+)?$")
    found = []
    for fp in app_files:
        try:
            with open(fp, errors="replace") as f:
                content = f.read()
        except OSError:
            continue
        for m in import_re.finditer(content):
            spec = m.group(2)
            if pat.match(spec):
                found.append(os.path.relpath(fp, ROOT))
                break
    # config-level references (tailwind plugins, prisma provider, etc.)
    cfg_hit = []
    if dep in ("tailwindcss-animate", "tw-animate-css"):
        if dep in config_blobs:
            cfg_hit.append("config")
    if dep == "prisma":
        if "prisma" in scripts_blob:
            cfg_hit.append("scripts")
    if dep == "sharp" and "next/image" in config_blobs:
        cfg_hit.append("next.config")
    results[dep] = (found, cfg_hit)

used, unused = [], []
for dep, (found, cfg) in results.items():
    if found or cfg:
        used.append((dep, (found + cfg) or []))
    else:
        unused.append(dep)

print("=== USED by app code ===")
for dep, locs in used:
    print(f"  {dep:40s} {', '.join(locs[:4])}{' ...' if len(locs) > 4 else ''}")
print()
print("=== NOT imported by app code (candidates to remove) ===")
for dep in unused:
    print(f"  {dep}")
print()
print(f"Total: {len(deps)} deps | used: {len(used)} | unused: {len(unused)}")
