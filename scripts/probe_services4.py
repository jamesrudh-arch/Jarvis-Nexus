#!/usr/bin/env python3
"""
JARVIS NEXUS — Stage 4 probes.
Railway: Variable type introspection, full environment variables (look for
Supabase URL), service source/domains/deployments, fixed write probe, and a
REAL deployment trigger if authorised.
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
    r.add_header("User-Agent", "jarvis-nexus-probe/4.0")
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


PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"

print("=" * 72)
print("  RAILWAY — Variable type fields")
print("=" * 72)
st, body = gql("{ __type(name: \"Variable\") { fields { name } } }")
print(f"[Variable.fields] {json.dumps(body)[:400]}")

print("\n" + "=" * 72)
print("  RAILWAY — environment variables (production)")
print("=" * 72)
st, body = gql(f"""
{{
  environment(id: "{ENV_ID}") {{
    id name
    variables(first: 100) {{ edges {{ node {{ id name value }} }} }}
  }}
}}""")
print(f"[vars] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:1200]}")
if st == 200:
    env_data = (body.get("data") or {}).get("environment") or {}
    for v in env_data.get("variables", {}).get("edges", []):
        node = v["node"]
        name, val = node.get("name"), (node.get("value") or "")
        if any(s in (name or "").upper() for s in
               ("TOKEN", "SECRET", "PASSWORD", "KEY", "CREDENTIAL")):
            shown = f"<set len={len(val)}>"
        else:
            shown = val[:120] if val else "<empty>"
        print(f"    {name!r} = {shown}")

print("\n" + "=" * 72)
print("  RAILWAY — service details (source, instances, domains)")
print("=" * 72)
st, body = gql(f"""
{{
  service(id: "{SERVICE_ID}") {{
    id name
    repo
    branch
    isPublicSource
    buildType
  }}
}}""")
print(f"[service] HTTP {st} — {json.dumps(body)[:400]}")

st, body = gql(f"""
{{
  serviceInstances(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") {{
    edges {{ node {{ id status runtime }} }}
  }}
}}""")
print(f"[instances] HTTP {st} — {json.dumps(body)[:300]}")

st, body = gql(f"""
{{
  deployments(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}", first: 5) {{
    edges {{ node {{ id status createdAt meta {{ source commitHash fqn }} }} }}
  }}
}}""")
print(f"[deployments] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:600]}")

st, body = gql(f"""
{{
  customDomains(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") {{
    edges {{ node {{ id domain status }} }}
  }}
}}""")
print(f"[customDomains] HTTP {st} — {json.dumps(body)[:300]}")

st, body = gql(f"""
{{
  serviceDomains(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") {{
    edges {{ node {{ id domain suffix }} }}
  }}
}}""")
print(f"[serviceDomains] HTTP {st} — {json.dumps(body)[:300]}")

print("\n" + "=" * 72)
print("  RAILWAY — REAL WRITE PROBE (fixed: Boolean return)")
print("=" * 72)
st, body = gql("""
  mutation($input: VariableUpsertInput!) {
    variableUpsert(input: $input)
  }""",
              {"input": {
                  "projectId": PROJECT_ID,
                  "environmentId": ENV_ID,
                  "name": "JARVIS_NEXUS_WRITE_PROBE",
                  "value": "probe-2026-11-12",
                  "skipDeploys": True,
              }})
print(f"[variableUpsert] HTTP {st} — {json.dumps(body)[:300]}")
if st == 200 and not (body.get("errors")):
    # find and delete the probe variable
    st, body = gql(f"""{{ environment(id: "{ENV_ID}") {{
      variables(first: 100) {{ edges {{ node {{ id name }} }} }} }} }}""")
    var_id = None
    for v in ((body.get("data") or {}).get("environment") or {}).get("variables", {}).get("edges", []):
        if v["node"]["name"] == "JARVIS_NEXUS_WRITE_PROBE":
            var_id = v["node"]["id"]
    if var_id:
        st, body = gql("""
          mutation($input: VariableDeleteInput!) { variableDelete(input: $input) }""",
                      {"input": {"environmentId": ENV_ID, "id": var_id}})
        print(f"[variableDelete] HTTP {st} — {json.dumps(body)[:200]}")

print("\nStage-4 probes complete.")
