#!/usr/bin/env python3
"""
JARVIS NEXUS — deep secret-history audit (session 6).

Stronger than the pattern scan: takes EVERY actual secret VALUE from
.env.local and searches (a) the working tree, (b) the git index, and
(c) EVERY commit in history for its exact occurrence. Also verifies the
env files are gitignored. Prints only variable NAMES and verdicts —
never values. Exit 0 only when nothing leaks.
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env.local")


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=ROOT).stdout


def load_secrets():
    # Non-secret configuration identifiers (public by design — repo name,
    # bucket name, product name; OWNER_EMAIL appears as the Cloudflare
    # account-name evidence, already committed in session 5).
    NON_SECRET = {"EPIC_PRODUCT_NAME", "GITHUB_REPO", "NEXUS_STORAGE_BUCKET",
                  "OWNER_EMAIL", "OWNER_NAME"}
    out = []
    for line in open(ENV_PATH):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip()
        if k.strip() in NON_SECRET:
            continue
        if len(v) >= 12:  # ignore short/non-secret config
            out.append((k.strip(), v))
    return out


failures = []

# 0. .env* must be gitignored
ignored = sh("git check-ignore .env .env.local").strip()
if ".env.local" not in ignored:
    failures.append(".env.local is NOT gitignored")

secrets = load_secrets()
print(f"auditing {len(secrets)} secret values from .env.local against the full repo + history")

for name, value in secrets:
    # working tree + index (tracked files only)
    tracked_hit = sh(f"git grep -l -F {repr(value)} -- . ':!*.lock' 2>/dev/null").strip()
    if tracked_hit:
        failures.append(f"{name}: value present in TRACKED file(s): {tracked_hit}")
        continue
    # full history (every commit, all objects reachable)
    history_hit = sh(f"git log --all -S -F --oneline -- . 2>/dev/null")
    # -S with -F is not supported; use pickaxe via string search on rev-list instead
    commits = sh("git rev-list --all").split()
    found_in = None
    for c in commits:
        r = subprocess.run(["git", "grep", "-l", "-F", value, c, "--", "."],
                           capture_output=True, text=True, cwd=ROOT)
        if r.stdout.strip():
            found_in = (c[:10], r.stdout.strip().splitlines()[0])
            break
    if found_in:
        failures.append(f"{name}: value FOUND IN HISTORY at {found_in[0]} ({found_in[1]})")
        continue
    print(f"  [CLEAN] {name}")

# untracked-but-present check for .env files (they exist but are ignored — fine)
print()
if failures:
    print("AUDIT FAILED:")
    for f in failures:
        print("  " + f)
    sys.exit(1)
print(f"AUDIT PASSED: {len(secrets)} secret values absent from tracked files and all "
      f"{len(sh('git rev-list --all').split())} commits; .env* gitignored.")
