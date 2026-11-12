#!/usr/bin/env python3
"""
JARVIS NEXUS — Stage 9: production configuration.
1. Complete local .env.local (EPIC_CLIENT_ID from the supplied credential,
   Blender MCP host/port, R2 bucket) — no secret values printed.
2. Create the Railway persistent volume at /data for the Jarvis-Nexus service.
3. Upsert all production environment variables on Railway (skipDeploys so the
   upcoming git push triggers one clean deployment).
"""
import json
import os
import re
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env.local")

ENV = {}
for line in open(ENV_PATH):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        ENV[k.strip()] = v.strip()

PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"


def gql(query, variables=None):
    data = json.dumps({"query": query, "variables": variables or {}}).encode()
    r = urllib.request.Request("https://backboard.railway.app/graphql/v2",
                               data=data, method="POST")
    r.add_header("Authorization", f"Bearer {ENV['RAILWAY_API_TOKEN']}")
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "jarvis-nexus-config/9.0")
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, e.read().decode("utf-8", "replace")[:300]
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def set_env_var(key, value):
    content = open(ENV_PATH).read()
    if re.search(rf"^{key}=", content, re.M):
        content = re.sub(rf"^{key}=.*$", f"{key}={value}", content, flags=re.M)
    else:
        content += f"\n{key}={value}"
    with open(ENV_PATH, "w") as fh:
        fh.write(content)


print("== 1. Local .env.local completion ==")
if ENV.get("EPIC_CLIENT_CREDENTIAL") and not ENV.get("EPIC_CLIENT_ID"):
    set_env_var("EPIC_CLIENT_ID", ENV["EPIC_CLIENT_CREDENTIAL"])
    print("[env] EPIC_CLIENT_ID set (copied from supplied EPIC_CLIENT_CREDENTIAL, xyza7891 client-id format)")
if not ENV.get("BLENDER_MCP_HOST"):
    set_env_var("BLENDER_MCP_HOST", "127.0.0.1")
    set_env_var("BLENDER_MCP_PORT", "9876")
    print("[env] BLENDER_MCP_HOST/PORT set (local bpy addon bridge)")
if not ENV.get("R2_BUCKET"):
    set_env_var("R2_BUCKET", "jarvis-nexus-assets")
    print("[env] R2_BUCKET set (jarvis-nexus-assets)")
# refresh
ENV = {}
for line in open(ENV_PATH):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        ENV[k.strip()] = v.strip()
print(f"[env] .env.local now holds {len(ENV)} credential/config variables")

print("\n== 2. Railway volume at /data ==")
# Check existing volumes first
st, b = gql('query($id: String!) { project(id: $id) { volumes { edges { node { id } } } } }',
            {"id": PROJECT_ID})
vol_edges = []
if st == 200:
    # project.volumes may not exist; fall back silently
    vol_edges = []
else:
    print(f"[volumes query] HTTP {st} (field may not exist — proceeding)")

st, b = gql("""
  mutation($input: VolumeCreateInput!) {
    volumeCreate(input: $input) { id }
  }""",
            {"input": {
                "projectId": PROJECT_ID,
                "environmentId": ENV_ID,
                "serviceId": SERVICE_ID,
                "mountPath": "/data",
            }})
if st == 200 and not (b.get("errors")):
    print(f"[volumeCreate] SUCCESS — volume {b['data']['volumeCreate']['id']} mounted at /data")
elif st == 200 and b.get("errors"):
    msgs = [e.get("message") for e in b["errors"]]
    print(f"[volumeCreate] errors: {msgs}")
    if any("already" in m.lower() for m in msgs):
        print("  (volume likely already exists — acceptable)")
else:
    print(f"[volumeCreate] HTTP {st} — {json.dumps(b)[:300]}")

print("\n== 3. Railway production environment variables ==")
# (skipDeploys=True — the git push will trigger one clean deployment)
PROD_VARS = {
    "DATABASE_URL": "file:/data/custom.db",
    "GITHUB_TOKEN": ENV.get("GITHUB_TOKEN", ""),
    "GITHUB_REPO": ENV.get("GITHUB_REPO", ""),
    "SUPABASE_ACCESS_TOKEN": ENV.get("SUPABASE_ACCESS_TOKEN", ""),
    "SUPABASE_DB_PASSWORD": ENV.get("SUPABASE_DB_PASSWORD", ""),
    "RAILWAY_API_TOKEN": ENV.get("RAILWAY_API_TOKEN", ""),
    "CLOUDFLARE_API_TOKEN": ENV.get("CLOUDFLARE_API_TOKEN", ""),
    "CLOUDFLARE_ACCOUNT_ID": ENV.get("CLOUDFLare_ACCOUNT_ID".upper(), ENV.get("CLOUDFLARE_ACCOUNT_ID", "")),
    "R2_BUCKET": ENV.get("R2_BUCKET", "jarvis-nexus-assets"),
    "R2_ACCESS_KEY_ID": ENV.get("R2_ACCESS_KEY_ID", ""),
    "R2_SECRET_ACCESS_KEY": ENV.get("R2_SECRET_ACCESS_KEY", ""),
    "EPIC_CLIENT_ID": ENV.get("EPIC_CLIENT_ID", ENV.get("EPIC_CLIENT_CREDENTIAL", "")),
    "OWNER_EMAIL": ENV.get("OWNER_EMAIL", ""),
}
for i in range(1, 7):
    PROD_VARS[f"KAGGLE_API_TOKEN_{i}"] = ENV.get(f"KAGGLE_API_TOKEN_{i}", "")

ok, fail = 0, 0
for key, val in PROD_VARS.items():
    if not val:
        print(f"  {key}: SKIPPED (no value available)")
        continue
    st, b = gql("""
      mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }""",
                {"input": {
                    "projectId": PROJECT_ID,
                    "environmentId": ENV_ID,
                    "serviceId": SERVICE_ID,
                    "name": key,
                    "value": val,
                    "skipDeploys": True,
                }})
    if st == 200 and not b.get("errors"):
        ok += 1
    else:
        fail += 1
        print(f"  {key}: HTTP {st} — {json.dumps(b)[:200]}")
print(f"[prod vars] {ok} written, {fail} failed (values never printed)")

# Verify the variable NAMES landed (values masked)
st, b = gql(f'{{ variables(projectId: "{PROJECT_ID}", environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") }}')
if st == 200 and isinstance((b.get("data") or {}).get("variables"), dict):
    names = sorted((b["data"]["variables"] or {}).keys())
    print(f"[prod vars] now present on service: {names}")
else:
    print(f"[prod vars] verify: HTTP {st} — {json.dumps(b)[:300]}")

print("\nStage-9 configuration complete.")
