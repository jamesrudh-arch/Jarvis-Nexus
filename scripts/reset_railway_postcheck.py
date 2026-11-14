#!/usr/bin/env python3
"""
RESET Phase 4: Railway post-push check.
- Did the GitHub wipe push trigger a new (auto) deployment?
- Endpoint probe (expect 502 — obsolete implementation stopped)
- Stopped deployment status
Output: download/reset_20261114/07_railway_postpush.json
"""
import json
import time
import urllib.request
import urllib.error

ENV_PATH = "/home/z/my-project/.env"
GQL = "https://backboard.railway.com/graphql/v2"
UA = "nexus-reset/1.0"
OUT_DIR = "/home/z/my-project/download/reset_20261114"
PROJ = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
SVC = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
ENVID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
DEP = "8128960e-edf7-4a0f-88f2-dfde6964d168"
URL = "https://jarvis-nexus-production.up.railway.app/api/v1/health"


def load_token():
    for line in open(ENV_PATH):
        line = line.strip()
        if line.startswith("RAILWAY_TOKEN="):
            return line.split("=", 1)[1].strip()
    return ""


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        GQL, data=body, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Accept": "application/json",
                 "Authorization": f"Bearer {load_token()}"})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode() or "{}")
        except Exception:
            return {"http_error": e.code}
    except Exception as e:
        return {"exception": str(e)}


out = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
       "context": "checked ~3 min after GitHub main push e599eb9 (wipe commit)"}

# 1. deployments list — any NEW deployment triggered by the push?
r = gql("""
query($input: DeploymentListInput!) {
  deployments(input: $input) { edges { node { id status createdAt meta } } }
}
""", {"input": {"projectId": PROJ, "environmentId": ENVID,
                "serviceId": SVC, "includeDeleted": False}})
edges = (((r.get("data") or {}).get("deployments") or {}).get("edges")) or []
out["deployments_latest"] = []
print("[DEPLOYMENTS] latest 5:")
for e in edges[:5]:
    n = e["node"]
    meta = n.get("meta")
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            pass
    row = {"id": n["id"], "status": n["status"], "createdAt": n.get("createdAt"),
           "meta": meta}
    out["deployments_latest"].append(row)
    print(f"  - {n['status']:10s} {n.get('createdAt')} id={n['id']} "
          f"meta={json.dumps(meta, default=str)[:160]}")
new_deps = [d for d in out["deployments_latest"]
            if d["id"] != DEP and d["createdAt"] and
            d["createdAt"] > "2026-11-14T08:15"]
out["new_deployments_since_push"] = new_deps
print(f"[NEW since push] {len(new_deps)} "
      f"({json.dumps([d['id'] for d in new_deps])})")

# 2. stopped deployment status
r = gql('query($id: String!) { deployment(id: $id) { id status } }', {"id": DEP})
d = (r.get("data") or {}).get("deployment")
out["stopped_deployment_status"] = d
print(f"[STOPPED DEP] {json.dumps(d)}")

# 3. endpoint probe (expect 502)
try:
    req = urllib.request.Request(URL, method="GET", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        out["endpoint_probe"] = {"http": resp.status}
except urllib.error.HTTPError as e:
    out["endpoint_probe"] = {"http": e.code}
except Exception as e:
    out["endpoint_probe"] = {"error": str(e)[:150]}
print(f"[ENDPOINT] {json.dumps(out['endpoint_probe'])}")

with open(f"{OUT_DIR}/07_railway_postpush.json", "w") as f:
    json.dump(out, f, indent=1, default=str)
print(f"[saved] {OUT_DIR}/07_railway_postpush.json")
