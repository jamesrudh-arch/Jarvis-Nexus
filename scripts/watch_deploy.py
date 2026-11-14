#!/usr/bin/env python3
"""Monitor the Railway deployment triggered by the latest push; poll until terminal state."""
import json, os, time, urllib.request, urllib.error

tok = [l.split("=", 1)[1].strip() for l in open("/home/z/my-project/.env") if l.startswith("RAILWAY_TOKEN=")][0]
SVC = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
ENV = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"

def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        "https://backboard.railway.com/graphql/v2", data=body, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "nexus-build/1.0",
                 "Accept": "application/json", "Authorization": f"Bearer {tok}"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode() or "{}")

QUERY = """
query($svc: String!, $env: String!) {
  serviceInstances { edges { node { id deployments(first: 3) { edges { node { id status createdAt meta { source { repo branch } } } } } } } }
}
"""

deadline = time.time() + 900  # 15 min
seen = None
while time.time() < deadline:
    r = gql(QUERY)
    edges = ((r.get("data") or {}).get("serviceInstances") or {}).get("edges") or []
    deployments = []
    for e in edges:
        n = e.get("node") or {}
        if n.get("id") != SVC:
            continue
        deployments = ((n.get("deployments") or {}).get("edges") or [])
    latest = None
    for d in deployments:
        node = d.get("node") or {}
        meta = (node.get("meta") or {}).get("source") or {}
        latest = {"id": node.get("id"), "status": node.get("status"), "branch": meta.get("branch"), "createdAt": node.get("createdAt")}
        break
    if latest != seen:
        print(time.strftime("%H:%M:%S"), json.dumps(latest), flush=True)
        seen = latest
    if latest and latest["status"] in ("SUCCESS", "FAILED", "CRASHED", "REMOVED"):
        break
    time.sleep(20)
print("final:", json.dumps(seen))
