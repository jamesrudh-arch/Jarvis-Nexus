#!/usr/bin/env python3
"""
Full production inspection of reasonable-heart / Jarvis-Nexus (READ-ONLY).
- Environments, services, volumes
- Deployment list (latest first) with status + meta
- Service-scoped variable NAMES only (values masked/omitted)
- Domains with full args
- Region metadata discovery via introspection
"""
import json
import time
import urllib.request
import urllib.error

ENV_PATH = "/home/z/my-project/.env"
GQL = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.1"

PROJ = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
SVC = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
ENVID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"


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


def section(title):
    print(f"\n=== {title} ===")


out = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

# --- 1. project: environments + services + volumes ---
section("project environments/services")
r = gql("""
query($id: String!) {
  project(id: $id) {
    id name
    environments { edges { node { id name isEphemeral } } }
    services { edges { node { id name } } }
    volumes { edges { node { id name mountPath } } }
  }
}
""", {"id": PROJ})
proj = (r.get("data") or {}).get("project") or {}
if proj:
    envs = [e["node"] for e in ((proj.get("environments") or {}).get("edges") or [])]
    svcs = [e["node"] for e in ((proj.get("services") or {}).get("edges") or [])]
    vols = [e["node"] for e in ((proj.get("volumes") or {}).get("edges") or [])]
    print(f"project: {proj.get('name')}")
    print(f"environments: {json.dumps(envs)}")
    print(f"services:     {json.dumps(svcs)}")
    print(f"volumes:      {json.dumps(vols)}")
    out["environments"] = envs
    out["services"] = svcs
    out["volumes"] = vols
else:
    print(f"ERROR: {json.dumps(r)[:400]}")

# --- 2. deployments ---
section("deployments (latest 10)")
r = gql("""
query($input: DeploymentListInput!) {
  deployments(input: $input) {
    edges { node { id status createdAt meta } }
  }
}
""", {"input": {"projectId": PROJ, "environmentId": ENVID,
                "serviceId": SVC, "includeDeleted": False}})
edges = (((r.get("data") or {}).get("deployments") or {}).get("edges")) or []
if edges:
    out["deployments"] = []
    for e in edges[:10]:
        n = e["node"]
        meta = n.get("meta")
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                pass
        row = {"id": n["id"], "status": n["status"],
               "createdAt": n.get("createdAt"), "meta": meta}
        out["deployments"].append(row)
        print(f"- {n['status']:12s} {n.get('createdAt')} id={n['id']}")
        print(f"    meta={json.dumps(meta, default=str)[:220]}")
else:
    print(f"no deployments / errors: "
          f"{json.dumps([e.get('message') for e in (r.get('errors') or [])])[:400]}")

# --- 3. service-scoped variables (NAMES ONLY) ---
section("service-scoped variable names (values never printed)")
r = gql('query($p: String!, $e: String!, $s: String!) '
        '{ variables(projectId: $p, environmentId: $e, serviceId: $s) }',
        {"p": PROJ, "e": ENVID, "s": SVC})
variables = (r.get("data") or {}).get("variables") or {}
if variables:
    names = sorted(variables.keys())
    out["variable_names"] = names
    print(f"count={len(names)}")
    for n in names:
        # mask value entirely; only indicate presence
        v = variables.get(n)
        ln = len(v) if isinstance(v, str) else 0
        print(f"  - {n}  (len={ln})")
else:
    errs = [e.get("message") for e in (r.get("errors") or [])]
    print(f"none or error: {errs[:2]}")

# --- 4. domains ---
section("domains")
r = gql("""
query($p: String!, $e: String!, $s: String!) {
  domains(projectId: $p, environmentId: $e, serviceId: $s) {
    serviceDomains { domain syncStatus targetPort suffix }
    customDomains { domain status }
  }
}
""", {"p": PROJ, "e": ENVID, "s": SVC})
dom = (r.get("data") or {}).get("domains")
if dom:
    out["domains"] = dom
    print(json.dumps(dom, indent=1)[:800])
else:
    print(f"errors: {json.dumps([e.get('message') for e in (r.get('errors') or [])])[:300]}")

# --- 5. region discovery: introspect Project & Deployment fields ---
section("region-related fields (introspection)")
for tname in ("Project", "Deployment", "Service", "Environment"):
    r = gql('query { __type(name: "%s") { fields { name } } }' % tname)
    node = (r.get("data") or {}).get("__type") or {}
    fields = [f["name"] for f in (node.get("fields") or [])]
    regionish = [f for f in fields
                 if any(k in f.lower() for k in ("region", "zone", "location", "infra"))]
    print(f"{tname}: {len(fields)} fields; region-ish: {regionish}")

# save
with open("/home/z/my-project/NEXUS_WORLD/reports/RAILWAY_INSPECT_TOKEN_RESTORED.json", "w") as f:
    json.dump(out, f, indent=1, default=str)
print("\n[saved] NEXUS_WORLD/reports/RAILWAY_INSPECT_TOKEN_RESTORED.json")
