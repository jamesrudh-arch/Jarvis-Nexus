#!/usr/bin/env python3
"""
Session-7 deep security audit supplement:
  S1  Full GIT HISTORY scan for every credential pattern (all commits, all
      blobs) — not just the working tree.
  S2  The exact EOS Client Secret value from .env.local must not appear in
      any tracked file, any commit, or the local .next build output.
  S3  Production bundle scan: download every JS chunk the live deployment
      serves and grep for credential patterns (frontend exposure).
Never prints secret values — only verdicts and fingerprints.
"""
import hashlib
import json
import re
import subprocess
import sys
import urllib.request

ROOT = "/home/z/my-project"
PATTERNS = [
    ("GitHub classic PAT", re.compile(r"ghp_[A-Za-z0-9]{36}")),
    ("GitHub fine-grained PAT", re.compile(r"github_pat_[A-Za-z0-9_]{22,}")),
    ("Kaggle token", re.compile(r"KGAT_[A-Za-z0-9]{20,}")),
    ("Cloudflare token", re.compile(r"cfat_[A-Za-z0-9_-]{20,}")),
    ("Supabase secret key", re.compile(r"sb_secret_[A-Za-z0-9]{20,}")),
    ("Supabase PAT", re.compile(r"sbp_[A-Za-z0-9]{20,}")),
    ("Railway token", re.compile(r"rlwy_wksp_[A-Za-z0-9_]{10,}")),
    ("EOS client id", re.compile(r"xyza7891[A-Za-z0-9]{24}")),
]

results = []


def check(name, ok, detail=""):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))


# --- S1: full history scan ---------------------------------------------------
# Walk every blob in every object; this catches secrets added then deleted.
out = subprocess.run(
    ["git", "-C", ROOT, "rev-list", "--objects", "--all"],
    capture_output=True, text=True, check=True,
).stdout
blobs = [l.split(" ", 1) for l in out.splitlines() if " " in l]
hits = 0
for sha, path in blobs:
    cat = subprocess.run(["git", "-C", ROOT, "cat-file", "-p", sha],
                         capture_output=True, text=True, errors="replace")
    for name, pat in PATTERNS:
        for m in pat.finditer(cat.stdout or ""):
            val = m.group(0)
            # Placeholder detector (2026-11-14): templates like
            # xyza7891XXXXXXXXXXXXXXXXXXXXXXXX (the EOS example config) and
            # 0000…0 product ids are FORMAT EXAMPLES, not credential values.
            # A run of 20+ identical characters never occurs in real tokens.
            import re as _re
            if _re.search(r"(.)\1{19,}", val):
                continue
            hits += 1
            print(f"  HISTORY HIT: {name} in {path or sha[:10]}")
            break
check("S1 full git history free of credential values", hits == 0, f"{len(blobs)} objects scanned")

# --- S2: exact EOS secret absent everywhere ---------------------------------
env = {}
for line in open(f"{ROOT}/.env.local"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
secret = env.get("EPIC_CLIENT_SECRET", "")
fp = hashlib.sha256(secret.encode()).hexdigest()[:12] if secret else "n/a"

tracked_hits = subprocess.run(
    ["git", "-C", ROOT, "grep", "-l", secret], capture_output=True, text=True
).stdout.strip() if secret else ""
hist = subprocess.run(
    ["git", "-C", ROOT, "log", "--all", "-p", "-S", secret],
    capture_output=True, text=True,
).stdout if secret else ""
build_hits = ""
try:
    build_hits = subprocess.run(
        ["grep", "-r", "-l", secret, f"{ROOT}/.next/static"], capture_output=True, text=True
    ).stdout.strip()
except Exception:
    pass
check("S2 EOS Client Secret (sha256[:12]=" + fp + ") absent from tracked files, history, and build output",
      (not tracked_hits) and (not hist) and (not build_hits))

# --- S3: production bundle scan ---------------------------------------------
BASE = "https://jarvis-nexus-production.up.railway.app"
html = urllib.request.urlopen(BASE + "/", timeout=30).read().decode()
chunk_urls = sorted(set(re.findall(r'(/_next/static/chunks/[^"\']+\.js)', html)))
found_hits = []
secret_in_bundles = False
for cu in chunk_urls:
    js = urllib.request.urlopen(BASE + cu, timeout=30).read().decode("utf-8", "replace")
    for name, pat in PATTERNS:
        if pat.search(js):
            found_hits.append((name, cu))
    if secret and secret in js:
        secret_in_bundles = True
check("S3 production JS bundles free of credential patterns",
      not found_hits and not secret_in_bundles,
      f"{len(chunk_urls)} chunks scanned, hits={found_hits or 'none'}, eos-secret-in-bundles={secret_in_bundles}")

ok = sum(1 for _, o in results if o)
print(f"\n=== {ok}/{len(results)} security supplement checks passed ===")
sys.exit(0 if ok == len(results) else 1)
