#!/usr/bin/env python3
"""Probe current Railway deployment state (read-only) for precheck P-03."""
import json
import re
import urllib.request

API = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"


def load_token():
    for ln in open("/home/z/my-project/.env"):
        m = re.match(r"^(?:export\s+)?RAILWAY_API_TOKEN=(.+)$", ln.strip())
        if m:
            return m.group(1).strip().strip("'").strip('"')
    return None


def gql(token, query):
    req = urllib.request.Request(API, data=json.dumps({"query": query}).encode(), headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return json.loads(body)
        except Exception:
            return {"errors": [{"message": body[:400]}]}
    except Exception as e:
        return {"errors": [{"message": str(e)}]}


token = load_token()
q = ('query { serviceInstance(environmentId: "%s", serviceId: "%s") { '
     'id name latestDeployment { id status createdAt meta } } }' % (ENV_ID, SERVICE_ID))
d = gql(token, q)
si = (((d or {}).get("data") or {}).get("serviceInstance"))
print("serviceInstance:", json.dumps(si, indent=1)[:800])

q2 = ('query { deployments(input: {environmentId: "%s", serviceId: "%s"}) { '
      'edges { node { id status createdAt meta } } } }' % (ENV_ID, SERVICE_ID))
d2 = gql(token, q2)
edges = (((d2 or {}).get("data") or {}).get("deployments") or {}).get("edges") or []
print(f"\ndeployments: {len(edges)}")
for e in edges[:5]:
    n = e.get("node") or {}
    meta = n.get("meta") or {}
    src = (meta.get("source") or {})
    print(f"  {n.get('id')} status={n.get('status')} createdAt={n.get('createdAt')} "
          f"commit={src.get('commit') or meta.get('commit')} branch={src.get('branch')}")
