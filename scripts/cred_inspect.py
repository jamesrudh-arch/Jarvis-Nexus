#!/usr/bin/env python3
"""Safely inspect credential env files: report variable names + masked fingerprints only.
Never prints full secret values."""
import os, re, hashlib, sys

FILES = [
    "/home/z/my-project/.env",
    "/home/z/my-project/.env.local",
    "/home/z/my-project/.env.example",
]

def mask(v: str) -> str:
    v = v.strip().strip('"').strip("'")
    n = len(v)
    if n == 0:
        return "<EMPTY>"
    # fingerprint: first 2 chars + last 2 chars + length + short sha
    fp = hashlib.sha256(v.encode()).hexdigest()[:6]
    if n <= 8:
        return f"<len={n} fp={fp}>"
    return f"{v[:3]}...{v[-2:]} (len={n} fp={fp})"

for f in FILES:
    print(f"===== {f} =====")
    if not os.path.exists(f):
        print("  (missing)")
        continue
    with open(f) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"^([A-Za-z0-9_]+)=(.*)$", line)
            if not m:
                continue
            k, v = m.group(1), m.group(2)
            print(f"  {k} = {mask(v)}")
    print()
