#!/usr/bin/env python3
"""Fetch required service variables from Railway into local .env (values never printed)."""
import json, os, urllib.request

token = os.environ["RAILWAY_TOKEN"]
service_id = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
env_id = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
project_id = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"

query = "query($p: String!, $e: String!, $s: String!) { variables(projectId: $p, environmentId: $e, serviceId: $s) }"
body = json.dumps({"query": query, "variables": {"p": project_id, "e": env_id, "s": service_id}}).encode()
req = urllib.request.Request(
    "https://backboard.railway.com/graphql/v2",
    data=body,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "nexus-build/1.0",
    },
)
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.load(r)

variables = data["data"]["variables"]
if not isinstance(variables, dict):
    raise SystemExit(f"Unexpected response: {json.dumps(data)[:300]}")
wanted = ["OPENAI_API_KEY", "OPENAI_MODEL", "OWNER_KEY", "NEXUS_LLM_PROVIDERS"]
env_path = "/home/z/my-project/.env"
existing = open(env_path).read()
added = []
for key in wanted:
    val = variables.get(key, "")
    if not val:
        print(f"MISSING in Railway: {key}")
        continue
    if key + "=" in existing:
        # refresh value in place
        import re
        existing = re.sub(rf"^{key}=.*$", f"{key}={val}", existing, flags=re.M)
        added.append(key + " (refreshed)")
    else:
        existing += f"\n{key}={val}"
        added.append(key)

open(env_path, "w").write(existing)
os.chmod(env_path, 0o600)
print("Updated .env with:", ", ".join(added))
print("OPENAI_MODEL =", variables.get("OPENAI_MODEL", ""))  # model name is config, safe to show
print("NEXUS_LLM_PROVIDERS =", variables.get("NEXUS_LLM_PROVIDERS", "")[:200])
print("key length check:", {k: len(variables.get(k, "")) for k in wanted})
