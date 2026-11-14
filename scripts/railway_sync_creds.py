#!/usr/bin/env python3
"""Sync owner-provided credentials into Railway production env.
- Fetches current values (NEVER prints them).
- Hash-compares against credentials.env values.
- Upserts ONLY missing or changed variables.
- Prints actions + variable names, never values.
"""
import hashlib
import json
import os
import subprocess

with open("/home/z/my-project/credentials.env") as f:
    for line in f:
        line = line.strip()
        if line.startswith("export "):
            k, _, v = line[len("export "):].partition("=")
            os.environ[k.strip()] = v.strip().strip("'").strip('"')

TOKEN = os.environ["RAILWAY_API_TOKEN"]
API = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"

def gql(query, variables=None):
    payload = {"query": query, "variables": variables or {}}
    out = subprocess.run(
        ["curl", "-sS", "-w", "\n%{http_code}", "--max-time", "60",
         "-X", "POST", API,
         "-H", f"Authorization: Bearer {TOKEN}",
         "-H", "Content-Type: application/json",
         "-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64)",
         "-d", json.dumps(payload)],
        capture_output=True, text=True, timeout=90).stdout
    body, _, code = out.rpartition("\n")
    return int(code or 0), json.loads(body)

def h(v):
    return hashlib.sha256(v.encode()).hexdigest()[:12]

# 1. Fetch current values (service-scoped)
code, d = gql(
    "query($projectId: String!, $environmentId: String!, $serviceId: String) { variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }",
    {"projectId": PROJECT_ID, "environmentId": ENV_ID, "serviceId": SERVICE_ID})
current = d["data"]["variables"]
if isinstance(current, str):
    current = json.loads(current)
print(f"Current production variables: {len(current)} (values held in memory only)")

# 2. Desired state from owner-provided credentials
desired = {
    "EPIC_CLIENT_ID": os.environ["EOS_CLIENT_ID"],
    "EPIC_CLIENT_SECRET": os.environ["EOS_CLIENT_SECRET"],
    "EPIC_PRODUCT_ID": os.environ["EOS_PRODUCT_ID"],
    "EPIC_SANDBOX_IDS": os.environ["EOS_SANDBOX_ID"],
    "EPIC_DEPLOYMENT_ID": os.environ["EOS_DEPLOYMENT_ID"],
    "SUPABASE_URL": os.environ["SUPABASE_URL"],
    "SUPABASE_ACCESS_TOKEN": os.environ["SUPABASE_ACCESS_TOKEN"],
    "SUPABASE_SERVICE_ROLE_KEY": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    "GITHUB_TOKEN": os.environ["GITHUB_TOKEN"],
    "RAILWAY_API_TOKEN": os.environ["RAILWAY_API_TOKEN"],
    "KAGGLE_API_TOKEN_1": os.environ["KAGGLE_KEY_1"],
    "KAGGLE_API_TOKEN_2": os.environ["KAGGLE_KEY_2"],
    "KAGGLE_API_TOKEN_3": os.environ["KAGGLE_KEY_3"],
    "KAGGLE_API_TOKEN_4": os.environ["KAGGLE_KEY_4"],
    "KAGGLE_API_TOKEN_5": os.environ["KAGGLE_KEY_5"],
    "KAGGLE_API_TOKEN_6": os.environ["KAGGLE_KEY_6"],
}

# 3. Compare (hash-only reporting)
to_upsert = {}
for name, want in desired.items():
    have = current.get(name)
    if have is None:
        to_upsert[name] = want
        print(f"[MISSING] {name} -> will create (sha {h(want)})")
    elif have == want:
        print(f"[MATCH]   {name} (in sync, sha {h(want)})")
    else:
        to_upsert[name] = want
        print(f"[STALE]   {name} (current sha {h(have)} != desired sha {h(want)}) -> will update")

if not to_upsert:
    print("\nNothing to change — production already in sync.")
    raise SystemExit(0)

# 4. Upsert each changed/missing variable
print(f"\nUpserting {len(to_upsert)} variable(s)…")
for name, value in to_upsert.items():
    code, d = gql(
        """mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }""",
        {"input": {"projectId": PROJECT_ID, "serviceId": SERVICE_ID,
                   "environmentId": ENV_ID, "name": name, "value": value,
                   "skipDeploys": True}})
    ok = code == 200 and "errors" not in d and d.get("data", {}).get("variableUpsert") is True
    errs = json.dumps(d.get("errors"))[:150] if "errors" in d else f"returned {d.get('data', {}).get('variableUpsert')}"
    print(f"  {'OK  ' if ok else 'FAIL'} {name} {'(upserted)' if ok else errs}")
