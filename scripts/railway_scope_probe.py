#!/usr/bin/env python3
"""
Probe Railway workspace-token permission scope (READ-ONLY).
Workspace tokens may not answer `me` but can answer resource queries.
Tries: project/service/variables/domains/deployments with known IDs.
"""
import json
import sys
import urllib.request
import urllib.error

ENV_PATH = "/home/z/my-project/.env"
GQL = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.1"

PROJ = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
SVC = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
ENV = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
DEP = "8128960e-edf7-4a0f-88f2-dfde6964d168"


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
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode() or "{}")
        except Exception:
            return {"http_error": e.code}
    except Exception as e:
        return {"exception": str(e)}


def probe(label, query, variables=None, extract=None):
    r = gql(query, variables)
    errs = [e.get("message") for e in (r.get("errors") or [])]
    data = (r.get("data") or {})
    if extract:
        data = extract(data)
    status = "OK " if not errs and r.get("data") is not None else "ERR "
    print(f"[{status}] {label}: {json.dumps(data, default=str)[:300]}"
          + (f"  errors={errs[:2]}" if errs else ""))
    return r


print("=== Railway workspace token scope probe ===")
probe("project(id)", 'query($id: String!) { project(id: $id) { id name } }',
      {"id": PROJ})
probe("service(id)", 'query($id: String!) { service(id: $id) { id name } }',
      {"id": SVC})
probe("variables(projectId,environmentId) names-only",
      'query($p: String!, $e: String!) { variables(projectId: $p, environmentId: $e) }',
      {"p": PROJ, "e": ENV},
      extract=lambda d: sorted((d.get("variables") or {}).keys()))
probe("domains(serviceId)",
      'query($s: String!) { domains(serviceId: $s) { serviceDomains { domain syncStatus targetPort } customDomains { domain } } }',
      {"s": SVC})
# deployments: introspect input shape first
r = gql('query { __type(name: "DeploymentListInput") { inputFields { name type { name kind ofType { name kind } } } } }')
fields = (((r.get("data") or {}).get("__type") or {}).get("inputFields")) or []
print(f"[INTROSPECT] DeploymentListInput fields: "
      f"{json.dumps([f['name'] for f in fields])[:300]}")
