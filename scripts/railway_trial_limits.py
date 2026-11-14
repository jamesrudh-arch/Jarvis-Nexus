#!/usr/bin/env python3
"""Railway trial-limit + instance + egress probes (Directive 4, part 2)."""
import json
import time
import urllib.request
import urllib.error

GQL = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.1"
PROJ = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
SVC = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
ENVID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
DEP = "8128960e-edf7-4a0f-88f2-dfde6964d168"
OUT = "/home/z/my-project/NEXUS_WORLD/reports/RAILWAY_TRIAL_LIMITS.json"


def load_token():
    for line in open("/home/z/my-project/.env"):
        line = line.strip()
        if line.startswith("RAILWAY_TOKEN="):
            return line.split("=", 1)[1].strip()
    return ""


def gql(query, variables=None):
    token = load_token()
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        GQL, data=body, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Accept": "application/json",
                 "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode() or "{}")
        except Exception:
            return {"http_error": e.code}
    except Exception as e:
        return {"exception": str(e)[:300]}


out = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

# --- trial / subscription facts on Project ---
r = gql('query($id: String!) { project(id: $id) { subscriptionType subscriptionPlanLimit expiredAt isTempProject createdAt updatedAt workspace { id name } } }', {"id": PROJ})
out["project_subscription"] = (r.get("data") or {}).get("project") or {"errors": r.get("errors")}

# --- deployment instances (restart/crash evidence) ---
r = gql('query($id: String!) { deployment(id: $id) { id status createdAt statusUpdatedAt canRedeploy canRollback instances { edges { node { id status since } } } } }', {"id": DEP})
out["deployment_instances"] = (r.get("data") or {}).get("deployment") or {"errors": r.get("errors")}

# --- deployment logs tail (startup + any restarts), filtered safe ---
r = gql('query($d: String!, $f: DeploymentLogsFilterInput) { deploymentLogs(deploymentId: $d, filter: $f, limit: 40) { edges { node { message timestamp } } } }',
        {"d": DEP, "f": {"limit": 40}})
logs = (((r.get("data") or {}).get("deploymentLogs") or {}).get("edges")) or []
safe_logs = []
for e in logs[-40:]:
    msg = (e["node"].get("message") or "")[:200]
    # redact anything token-like
    import re
    msg = re.sub(r"(rlwy_|sk-|ghp_|gho_)[A-Za-z0-9_\-]{6,}", r"\1[REDACTED]", msg)
    safe_logs.append({"ts": e["node"].get("timestamp"), "msg": msg})
out["deployment_logs_tail"] = safe_logs

# --- environment variables at env level (names only; look for usage/limit hints) ---
r = gql('query($e: String!) { environment(id: $e) { id name meta } }', {"e": ENVID})
out["environment_meta"] = (r.get("data") or {}).get("environment") or {"errors": r.get("errors")}

with open(OUT, "w") as f:
    json.dump(out, f, indent=1, default=str)
print(f"[saved] {OUT}")
print(json.dumps(out, indent=1, default=str)[:4000])
