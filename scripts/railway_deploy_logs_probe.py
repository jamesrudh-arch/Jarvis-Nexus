#!/usr/bin/env python3
"""
Deployment meta + logs tail (READ-ONLY) + production HTTP probes.
Goal: find region/egress evidence and provider-call outcomes in prod logs.
"""
import json
import time
import urllib.request
import urllib.error

ENV_PATH = "/home/z/my-project/.env"
GQL = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.1"
DEP = "8128960e-edf7-4a0f-88f2-dfde6964d168"
BASE = "https://jarvis-nexus-production.up.railway.app"


def load_token():
    for line in open(ENV_PATH):
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
        return {"exception": str(e)}


print("=== full deployment meta ===")
r = gql('query($id: String!) { deployment(id: $id) { id status createdAt meta } }',
        {"id": DEP})
dep = (r.get("data") or {}).get("deployment") or {}
meta = dep.get("meta")
if isinstance(meta, str):
    try:
        meta = json.loads(meta)
    except Exception:
        pass
print(json.dumps({"id": dep.get("id"), "status": dep.get("status"),
                  "createdAt": dep.get("createdAt"), "meta": meta},
                 indent=1, default=str))

print("\n=== deployment logs: keyword scan (provider/openai/egress/geo/error) ===")
r = gql('query($id: String!) { deploymentLogs(deploymentId: $id) '
        '{ message severity timestamp } }', {"id": DEP})
logs = (r.get("data") or {}).get("deploymentLogs") or []
print(f"total log entries: {len(logs)}")
KEYWORDS = ("openai", "provider", "egress", "geo", "region", "403",
            "groq", "cloudflare", "workers ai", "model", "fail",
            "error", "blocked", "unsupported")
hits = []
for l in logs:
    m = (l.get("message") or "").lower()
    if any(k in m for k in KEYWORDS):
        hits.append(l)
print(f"keyword hits: {len(hits)}")
for h in hits[-40:]:
    print(f"  [{h.get('severity')}] {str(h.get('message'))[:150]}")

print("\n=== last 10 raw log lines ===")
for l in logs[-10:]:
    print(f"  [{l.get('severity')}] {str(l.get('message'))[:150]}")

print("\n=== production HTTP probes (read-only GET) ===")
for path in ("/api/v1/health", "/api/v1/telemetry", "/api/v1/integrations"):
    try:
        req = urllib.request.Request(BASE + path,
                                     headers={"User-Agent": UA,
                                              "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode()[:700]
            print(f"[{resp.status}] GET {path}\n    {body}\n")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode()[:300]
        except Exception:
            body = ""
        print(f"[{e.code}] GET {path}\n    {body}\n")
    except Exception as e:
        print(f"[ERR] GET {path}: {e}\n")
