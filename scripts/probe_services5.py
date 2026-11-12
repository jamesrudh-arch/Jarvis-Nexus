#!/usr/bin/env python3
"""
JARVIS NEXUS — Stage 5 probes.
Railway: correct introspection (Query fields, Service, ServiceInstance,
Deployment, VariableDeleteInput), service source discovery, cleanup of the
write-probe variable, deployment status.
"""
import json
import os
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env(path=os.path.join(ROOT, ".env.local")):
    env = {}
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


ENV = load_env()


def req(method, url, headers=None, body=None, timeout=40):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("User-Agent", "jarvis-nexus-probe/5.0")
    r.add_header("Accept", "application/json")
    if body is not None:
        r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, raw.decode("utf-8", "replace")[:500]
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, ""
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


GQL = "https://backboard.railway.app/graphql/v2"


def gql(query, variables=None):
    return req("POST", GQL,
               {"Authorization": f"Bearer {ENV['RAILWAY_API_TOKEN']}"},
               {"query": query, "variables": variables or {}})


ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"

print("=" * 72)
print("  RAILWAY — schema introspection (correct shapes)")
print("=" * 72)
st, body = gql("""
{
  q: __type(name: "Query") { fields { name } }
  s: __type(name: "Service") { fields { name } }
  si: __type(name: "ServiceInstance") { fields { name } }
  d: __type(name: "Deployment") { fields { name } }
  vdi: __type(name: "VariableDeleteInput") { inputFields { name } }
}""")
data = (body.get("data") or {}) if isinstance(body, dict) else {}
print(f"[Query fields] {[f['name'] for f in (data.get('q') or {}).get('fields', [])]}")
print(f"[Service fields] {[f['name'] for f in (data.get('s') or {}).get('fields', [])]}")
print(f"[ServiceInstance fields] {[f['name'] for f in (data.get('si') or {}).get('fields', [])]}")
print(f"[Deployment fields] {[f['name'] for f in (data.get('d') or {}).get('fields', [])]}")
print(f"[VariableDeleteInput] {[f['name'] for f in (data.get('vdi') or {}).get('inputFields', [])]}")

print("\n" + "=" * 72)
print("  RAILWAY — cleanup write-probe variable")
print("=" * 72)
st, body = gql("""
  mutation($input: VariableDeleteInput!) { variableDelete(input: $input) }""",
              {"input": {
                  "environmentId": ENV_ID,
                  "name": "JARVIS_NEXUS_WRITE_PROBE",
              }})
print(f"[variableDelete] HTTP {st} — {json.dumps(body)[:200]}")

print("\n" + "=" * 72)
print("  RAILWAY — service instance + source")
print("=" * 72)
st, body = gql(f"""
{{
  serviceInstance(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") {{
    id status runtime
    serviceId
    source {{ ... on Source {{ ... on RepoSource {{ repo branch }} }} }}
  }}
}}""")
print(f"[serviceInstance] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:400]}")

# Try the documented deployments input signature
st, body = gql("""
  query($input: DeploymentsInput!) {
    deployments(input: $input) {
      edges { node { id status createdAt } }
    }
  }""", {"input": {"environmentId": ENV_ID, "serviceId": SERVICE_ID, "first": 5}})
print(f"[deployments] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:500]}")

# Project-level deployment list (covers all services)
st, body = gql(f"""
{{
  project(id: "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3") {{
    id name
    deployments(first: 5) {{ edges {{ node {{ id status createdAt }} }} }}
  }}
}}""")
print(f"[project deployments] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:500]}")

# domains for the service
st, body = gql(f"""
{{
  serviceDomain(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") {{ id domain suffix }}
}}""")
print(f"[serviceDomain] HTTP {st} — {json.dumps(body)[:300]}")

print("\nStage-5 probes complete.")
