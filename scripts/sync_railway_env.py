#!/usr/bin/env python3
"""
JARVIS NEXUS — session 6: align Railway production env with the completed
credential integrations.

Adds: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EPIC_CLIENT_ID,
      EPIC_CLIENT_SECRET, EPIC_PRODUCT_ID, EPIC_DEPLOYMENT_ID,
      EPIC_SANDBOX_IDS, OWNER_KEY, NEXUS_STORAGE_BUCKET
Retires (deletes): R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
      (R2 retired by owner directive — storage backend is Supabase)

skipDeploys=True everywhere — the upcoming git push triggers one clean deploy.
Values are read from .env.local and NEVER printed.
"""
import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env.local")

PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"

UPSERT = [
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    "EPIC_CLIENT_ID", "EPIC_CLIENT_SECRET",
    "EPIC_PRODUCT_ID", "EPIC_DEPLOYMENT_ID", "EPIC_SANDBOX_IDS",
    "OWNER_KEY", "NEXUS_STORAGE_BUCKET",
    # refresh these too (same values the owner re-supplied today)
    "SUPABASE_ACCESS_TOKEN", "CLOUDFLARE_API_TOKEN", "RAILWAY_API_TOKEN",
] + [f"KAGGLE_API_TOKEN_{i}" for i in range(1, 7)]

DELETE = ["R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]


def load_env():
    env = {}
    for line in open(ENV_PATH):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


ENV = load_env()
TOKEN = ENV["RAILWAY_API_TOKEN"]


def gql(query, variables=None):
    data = json.dumps({"query": query, "variables": variables or {}}).encode()
    r = urllib.request.Request("https://backboard.railway.app/graphql/v2",
                               data=data, method="POST")
    r.add_header("Authorization", f"Bearer {TOKEN}")
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "jarvis-nexus-envsync/6.0")
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            return resp.status, json.loads(resp.read())
    except Exception as e:
        try:
            return getattr(e, "code", 0), json.loads(e.read())
        except Exception:
            return 0, f"{type(e).__name__}: {e}"


ok = fail = 0
for key in UPSERT:
    val = ENV.get(key, "")
    if not val:
        print(f"  {key}: SKIP (not in .env.local)")
        continue
    st, b = gql(
        "mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }",
        {"input": {
            "projectId": PROJECT_ID, "environmentId": ENV_ID,
            "serviceId": SERVICE_ID, "name": key, "value": val,
            "skipDeploys": True,
        }})
    if st == 200 and not b.get("errors"):
        ok += 1
    else:
        fail += 1
        print(f"  {key}: HTTP {st} — {json.dumps(b)[:180]}")
print(f"[upsert] {ok} written, {fail} failed")

okd = faild = 0
for key in DELETE:
    st, b = gql(
        "mutation($input: VariableDeleteInput!) { variableDelete(input: $input) }",
        {"input": {
            "projectId": PROJECT_ID, "environmentId": ENV_ID,
            "serviceId": SERVICE_ID, "name": key,
        }})
    if st == 200 and not b.get("errors"):
        okd += 1
    elif st == 200 and any("not found" in e.get("message", "").lower() for e in b.get("errors", [])):
        print(f"  {key}: already absent")
    else:
        faild += 1
        print(f"  {key}: HTTP {st} — {json.dumps(b)[:180]}")
print(f"[delete] {okd} removed, {faild} failed")

# Verify final variable NAME inventory (no values)
st, b = gql('query($p: String!, $e: String!, $s: String!) '
            '{ variables(projectId: $p, environmentId: $e, serviceId: $s) }',
            {"p": PROJECT_ID, "e": ENV_ID, "s": SERVICE_ID})
if st == 200 and isinstance((b.get("data") or {}).get("variables"), dict):
    names = sorted((b["data"]["variables"] or {}).keys())
    print(f"[verify] service now holds {len(names)} variables: {names}")
    r2_left = [n for n in names if n.startswith("R2_")]
    print(f"[verify] R2_* leftovers: {r2_left or 'none'}")
else:
    print(f"[verify] FAILED HTTP {st} — {json.dumps(b)[:200]}")
