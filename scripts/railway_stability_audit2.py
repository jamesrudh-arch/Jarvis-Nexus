#!/usr/bin/env python3
"""Railway stability audit — schema-introspection driven (Directive 4).

Fixes over previous attempts:
- Volume.mountPath / Service.serviceType removed from schema -> introspect first
- domains: customDomains.status now requires selection
Read-only. Token never printed.
"""
import json
import os
import time
import urllib.request
import urllib.error

GQL = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.1"
PROJ = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
SVC = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
ENVID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
OUT = "/home/z/my-project/NEXUS_WORLD/reports/RAILWAY_STABILITY_AUDIT.json"


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

# --- introspection: what fields exist now? ---
schema = {}
for tname in ("Project", "Volume", "Service", "Deployment", "Environment",
              "DeploymentConnection", "Usage"):
    r = gql('query { __type(name: "%s") { fields { name } } }' % tname)
    node = (r.get("data") or {}).get("__type") or {}
    schema[tname] = [f["name"] for f in (node.get("fields") or [])]
out["schema_fields"] = schema

# --- project: environments + services + volumes (schema-safe) ---
r = gql("""
query($id: String!) {
  project(id: $id) {
    id name
    environments { edges { node { id name isEphemeral } } }
    services { edges { node { id name } } }
    volumes { edges { node { id name } } }
  }
}
""", {"id": PROJ})
proj = (r.get("data") or {}).get("project") or {}
if proj:
    out["environments"] = [e["node"] for e in proj["environments"]["edges"]]
    out["services"] = [e["node"] for e in proj["services"]["edges"]]
    out["volumes"] = [e["node"] for e in proj["volumes"]["edges"]]

# --- try project usage fields (any that exist in schema) ---
usage_fields = [f for f in schema.get("Project", [])
                if f in ("usage", "resourceLimit", "estimatedUsage")]
if usage_fields:
    sel = " ".join(usage_fields)
    r = gql('query($id: String!) { project(id: $id) { %s } }' % sel, {"id": PROJ})
    out["project_usage_raw"] = (r.get("data") or {}).get("project")

# --- volume details (introspect Volume fields, query scalar ones) ---
vol_scalar_fields = schema.get("Volume", [])
safe_scalars = [f for f in vol_scalar_fields if f in
                ("id", "name", "createdAt", "updatedAt", "mountPath", "state")]
# discover actual scalar set via __type with type refs
r = gql('query { __type(name: "Volume") { fields { name type { kind name ofType { kind name } } } } }')
volf = (((r.get("data") or {}).get("__type") or {}).get("fields")) or []
scalar_names = [f["name"] for f in volf
                if f.get("type", {}).get("kind") == "SCALAR"]
out["volume_scalar_fields"] = scalar_names
if out.get("volumes") and scalar_names:
    sel = " ".join(scalar_names[:10])
    out["volume_details"] = []
    for v in out["volumes"][:3]:
        r = gql('query($id: String!) { volume(id: $id) { %s } }' % sel, {"id": v["id"]})
        out["volume_details"].append((r.get("data") or {}).get("volume"))

# --- deployments (latest 5) with meta string ---
r = gql("""
query($input: DeploymentListInput!) {
  deployments(input: $input) { edges { node { id status createdAt meta } } }
}
""", {"input": {"projectId": PROJ, "environmentId": ENVID,
                "serviceId": SVC, "includeDeleted": False}})
edges = (((r.get("data") or {}).get("deployments") or {}).get("edges")) or []
deps = []
for e in edges[:5]:
    n = e["node"]
    meta = n.get("meta")
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            pass
    deps.append({"id": n["id"], "status": n["status"],
                 "createdAt": n.get("createdAt"), "meta": meta})
out["deployments_latest5"] = deps

# --- domains (fixed: status as selection) ---
r = gql("""
query($p: String!, $e: String!, $s: String!) {
  domains(projectId: $p, environmentId: $e, serviceId: $s) {
    serviceDomains { domain syncStatus targetPort suffix }
    customDomains { domain status { code message } }
  }
}
""", {"p": PROJ, "e": ENVID, "s": SVC})
out["domains"] = (r.get("data") or {}).get("domains")

# --- live HTTP probes (production health) ---
import ssl
probes = {}
for path in ("/", "/api/v1/health"):
    url = f"https://jarvis-nexus-production.up.railway.app{path}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read()[:400].decode(errors="replace")
            probes[path] = {"http": resp.status, "body_head": body[:200]}
    except urllib.error.HTTPError as e:
        probes[path] = {"http": e.code, "err": e.read()[:200].decode(errors="replace")}
    except Exception as e:
        probes[path] = {"exception": str(e)[:200]}
out["live_probes"] = probes

with open(OUT, "w") as f:
    json.dump(out, f, indent=1, default=str)
print(f"[saved] {OUT}")
print(json.dumps(out, indent=1, default=str)[:5500])
