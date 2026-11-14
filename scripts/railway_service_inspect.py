#!/usr/bin/env python3
"""Railway service deep-inspection: Jarvis-Nexus service source,
deployments, domains, variables, health, logs."""
import json
import time
import urllib.error
import urllib.request

ENDPOINT = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.0"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"


def gql(query, variables=None):
    token = ""
    for line in open("/home/z/my-project/.env"):
        line = line.strip()
        if line.startswith("RAILWAY_TOKEN="):
            token = line.split("=", 1)[1].strip().strip('"').strip("'")
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json",
                 "User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:  # noqa: BLE001
            return e.code, {}
    except Exception as e:  # noqa: BLE001
        return 0, {"error": str(e)}


out = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

# Service type fields (introspect to get the right query shape)
st, d = gql('{ __type(name: "Service") { fields { name } } }')
fields = [f["name"] for f in
          (((d.get("data") or {}).get("__type") or {}).get("fields")) or []]
out["service_fields"] = fields

# pick queryable fields safely
want = [f for f in ("id", "name", "createdAt", "updatedAt", "description",
                    "isArchived", "tags") if f in fields]
st, d2 = gql(
    "query($id: String!) { service(id: $id) { %s } }" % " ".join(want),
    {"id": SERVICE_ID})
out["service_detail"] = {"http": st, "data": d2.get("data"),
                         "errors": d2.get("errors")}

# deployments of the service (any)
st, d3 = gql("""
query($id: String!) {
  deployments(serviceId: $id) {
    edges { node {
      id status createdAt stoppedAt
      meta { source { repo branch commitHash } }
    } }
  }
}""", {"id": SERVICE_ID})
out["deployments"] = {"http": st, "data": d3.get("data"),
                      "errors": [e.get("message")
                                 for e in (d3.get("errors") or [])]}

# domains
for qname, q in [
    ("serviceDomains",
     "query($id: String!) { service(id: $id) { "
     "serviceDomains { id domain status createdAt } } }"),
    ("projectDomains",
     "query($id: String!) { project(id: $id) { "
     "domains { projectDomains { id domain status } } } }"),
]:
    st, d4 = gql(q, {"id": SERVICE_ID if qname == "serviceDomains"
                     else PROJECT_ID})
    out[qname] = {"http": st, "data": d4.get("data"),
                  "errors": [e.get("message")
                             for e in (d4.get("errors") or [])]}

# variables (names only — never print values)
st, d5 = gql("""
query($id: String!) {
  variables(serviceId: $id, environmentId: $id) { edges { node { name } } }
}""", {"id": SERVICE_ID})
if d5.get("errors"):
    st, d5 = gql("query($e: String!) { variables(environmentId: $e) "
                 "{ edges { node { name } } } }", {"e": ENV_ID})
out["variable_names"] = {"http": st, "data": d5.get("data"),
                         "errors": [e.get("message")
                                    for e in (d5.get("errors") or [])]}

print(json.dumps(out, indent=1, default=str)[:4000])
with open("/home/z/my-project/NEXUS_WORLD/reports/RAILWAY_SERVICE_INSPECT.json",
          "w") as f:
    json.dump(out, f, indent=1, default=str)
