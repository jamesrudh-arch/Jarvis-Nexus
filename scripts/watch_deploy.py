#!/usr/bin/env python3
"""Watch the Railway auto-deployment triggered by the git push, then verify
the public healthcheck. Evidence-only output."""
import json
import os
import sys
import time
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = {}
for line in open(os.path.join(ROOT, ".env.local")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        ENV[k.strip()] = v.strip()

PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
NEW_COMMIT = "5ab061a"


def gql(query, variables=None):
    data = json.dumps({"query": query, "variables": variables or {}}).encode()
    r = urllib.request.Request("https://backboard.railway.app/graphql/v2",
                               data=data, method="POST")
    r.add_header("Authorization", f"Bearer {ENV['RAILWAY_API_TOKEN']}")
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "jarvis-nexus-watch/10.0")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"errors": [{"message": f"HTTP {e.code}"}]}


def latest():
    b = gql(f'{{ project(id: "{PROJECT_ID}") {{ deployments(first: 3) '
            f'{{ edges {{ node {{ id status createdAt meta {{ commitHash }} }} }} }} }} }}')
    edges = (((b.get("data") or {}).get("project") or {}).get("deployments") or {}).get("edges", [])
    return [(e["node"]["id"], e["node"]["status"], e["node"].get("meta", {}).get("commitHash", "?"),
             e["node"]["createdAt"]) for e in edges]


print("Waiting for the Railway auto-deploy of commit", NEW_COMMIT, "…")
deadline = time.time() + 420
target = None
seen = None
while time.time() < deadline:
    deps = latest()
    if deps:
        cur = deps[0]
        if cur != seen:
            print(f"  latest deployment: {cur[0][:8]} status={cur[1]} commit={str(cur[2])[:9]} at={cur[3]}")
            seen = cur
        if str(cur[2] or "").startswith(NEW_COMMIT) or any(
                str(d[2] or "").startswith(NEW_COMMIT) for d in deps):
            target = next(d for d in deps if str(d[2] or "").startswith(NEW_COMMIT))
            if cur[1] in ("SUCCESS", "FAILED", "CRASHED"):
                break
    time.sleep(15)

if not target:
    print("No deployment for the new commit observed within the window — "
          "repo auto-deploy may be disabled; will check current live state.")
    sys.exit(2)

print(f"\nTarget deployment {target[0][:8]} final status: {target[1]}")
if target[1] != "SUCCESS":
    sys.exit(1)

# Wait for the new deployment to take over traffic, then healthcheck
print("Healthchecking the public URL …")
for attempt in range(6):
    time.sleep(10)
    try:
        r = urllib.request.Request("https://jarvis-nexus-production.up.railway.app/api/v1/health")
        r.add_header("User-Agent", "jarvis-nexus-watch/10.0")
        with urllib.request.urlopen(r, timeout=20) as resp:
            body = json.loads(resp.read())
            print(f"  /api/v1/health → HTTP {resp.status}: {json.dumps(body)}")
            if body.get("status") == "ok":
                print("HEALTHY — production verified.")
                sys.exit(0)
    except Exception as e:
        print(f"  attempt {attempt+1}: {type(e).__name__}: {e}")
print("Deployment SUCCESS but health not yet 'ok' — check Railway logs.")
sys.exit(1)
