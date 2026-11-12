#!/usr/bin/env python3
"""Push to GitHub using GITHUB_TOKEN from .env.local.
Token injected via git's env-var config (GIT_CONFIG_*): never in argv,
never in .git/config, never printed."""
import base64
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = {}
for line in open(os.path.join(ROOT, ".env.local")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        ENV[k.strip()] = v.strip()

token = ENV.get("GITHUB_TOKEN")
if not token:
    print("GITHUB_TOKEN missing")
    sys.exit(1)

basic = base64.b64encode(f"x-access-token:{token}".encode()).decode()

env = dict(os.environ)
env.update({
    "GIT_CONFIG_COUNT": "1",
    "GIT_CONFIG_KEY_0": "http.https://github.com/.extraheader",
    "GIT_CONFIG_VALUE_0": f"AUTHORIZATION: basic {basic}",
    "GIT_TERMINAL_PROMPT": "0",
})

r = subprocess.run(
    ["git", "push", "origin", "main"],
    cwd=ROOT, env=env, capture_output=True, text=True, timeout=300)
print(r.stdout.strip())
if r.returncode != 0:
    print(r.stderr.strip())
    sys.exit(r.returncode)
print("PUSH OK")
