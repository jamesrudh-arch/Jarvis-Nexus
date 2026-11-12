#!/usr/bin/env python3
"""
JARVIS NEXUS — recover credentials lost with the recycled .env.local.

Reads the LIVE Railway production variables (written by Session-5
configure_production.py) and restores any missing values into .env.local.
Prints ONLY variable names — never values. Also probes the live deployment
health endpoint (no credentials involved).
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env.local")

PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"

WANTED = [
    "GITHUB_TOKEN", "GITHUB_REPO", "EPIC_CLIENT_SECRET",
    "SUPABASE_DB_PASSWORD", "SUPABASE_URL", "CLOUDFLARE_ACCOUNT_ID",
    "OWNER_EMAIL", "EPIC_PRODUCT_ID", "EPIC_DEPLOYMENT_ID",
    "EPIC_SANDBOX_IDS", "EPIC_CLIENT_ID",
]


def load_env():
    env = {}
    for line in open(ENV_PATH):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


def gql(query, variables=None, token=None):
    data = json.dumps({"query": query, "variables": variables or {}}).encode()
    r = urllib.request.Request("https://backboard.railway.app/graphql/v2",
                               data=data, method="POST")
    r.add_header("Authorization", f"Bearer {token}")
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "jarvis-nexus-recover/1.0")
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            return resp.status, json.loads(resp.read())
    except Exception as e:
        try:
            return getattr(e, "code", 0), json.loads(e.read())
        except Exception:
            return 0, f"{type(e).__name__}: {e}"


def upsert_env_var(key, value):
    content = open(ENV_PATH).read()
    if re.search(rf"^{key}=.*$", content, re.M):
        content = re.sub(rf"^{key}=.*$", f"{key}={value}", content, flags=re.M)
    else:
        content += f"\n{key}={value}"
    with open(ENV_PATH, "w") as fh:
        fh.write(content)


ENV = load_env()
token = ENV.get("RAILWAY_API_TOKEN", "")
print(f"== Railway variables (project {PROJECT_ID[:8]}…) ==")

st, b = gql('query($p: String!, $e: String!, $s: String!) '
            '{ variables(projectId: $p, environmentId: $e, serviceId: $s) }',
            {"p": PROJECT_ID, "e": ENV_ID, "s": SERVICE_ID}, token)

remote_vars = {}
if st == 200 and isinstance((b.get("data") or {}).get("variables"), dict):
    remote_vars = b["data"]["variables"] or {}
    print(f"[railway] authenticated OK — {len(remote_vars)} variables on service "
          f"(names: {sorted(remote_vars.keys())})")
else:
    print(f"[railway] FAILED HTTP {st} — {json.dumps(b)[:250]}")
    raise SystemExit(1)

print("\n== Recovery into .env.local ==")
recovered, already, absent = [], [], []
for key in WANTED:
    rv = (remote_vars.get(key) or "").strip()
    lv = (ENV.get(key) or "").strip()
    if lv:
        already.append(key)
    elif rv:
        upsert_env_var(key, rv)
        recovered.append(key)
    else:
        absent.append(key)

print(f"[recovered] {recovered or 'none'}")
print(f"[already-local] {already or 'none'}")
print(f"[not-on-railway] {absent or 'none'}")

print("\n== Live deployment health ==")
try:
    with urllib.request.urlopen(
            "https://jarvis-nexus-production.up.railway.app/api/v1/health",
            timeout=30) as resp:
        body = json.loads(resp.read())
        print(f"[health] HTTP {resp.status} — {json.dumps(body)[:300]}")
except Exception as e:
    print(f"[health] FAILED — {type(e).__name__}: {e}")
