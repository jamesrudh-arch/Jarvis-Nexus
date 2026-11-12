#!/usr/bin/env python3
"""
JARVIS NEXUS — Stage 6 probes.
Railway: serviceInstance source/domains, deployment meta, variables query,
probe-variable cleanup, GitHub repo connection check.
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
    r.add_header("User-Agent", "jarvis-nexus-probe/6.0")
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
print("  RAILWAY — args of `variables` query + Source union")
print("=" * 72)
st, body = gql("""
{
  q: __type(name: "Query") {
    fields(includeDeprecated: true) {
      name
      args { name type { kind name ofType { kind name } } }
    }
  }
}""")
if st == 200:
    fields = ((body.get("data") or {}).get("q") or {}).get("fields", [])
    for f in fields:
        if f["name"] in ("variables", "variablesForServiceDeployment"):
            print(f"  {f['name']} args: {json.dumps(f['args'])[:300]}")

st, body = gql("{ __schema { types { kind name possibleTypes { name } } } }")
if st == 200:
    types = (body.get("data") or {}).get("__schema", {}).get("types", [])
    for t in types:
        if t.get("name") in ("Source", "RepoSource", "ImageSource", "VariableCollection"):
            print(f"  union/object {t['name']}: possible={t.get('possibleTypes')}")
    # RepoSource fields
st, body = gql("{ __type(name: \"RepoSource\") { fields { name } } }")
print(f"  RepoSource fields: {json.dumps((body.get('data') or {}))[:300]}")
st, body = gql("{ __type(name: \"ImageSource\") { fields { name } } }")
print(f"  ImageSource fields: {json.dumps((body.get('data') or {}))[:300]}")

print("\n" + "=" * 72)
print("  RAILWAY — serviceInstance (correct fields)")
print("=" * 72)
st, body = gql(f"""
{{
  serviceInstance(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") {{
    id
    hasEverDeployed
    builder
    rootDirectory
    dockerfilePath
    startCommand
    healthcheckPath
    region
    upstreamUrl
    source {{ __typename ... on RepoSource {{ repo branch }} ... on ImageSource {{ image }} }}
    latestDeployment {{ id status createdAt meta }}
    domains {{ edges {{ node {{ domain }} }} }}
  }}
}}""")
print(f"[serviceInstance] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:900]}")

print("\n" + "=" * 72)
print("  RAILWAY — successful deployment meta")
print("=" * 72)
st, body = gql("""
  query($id: String!) {
    deployment(id: $id) { id status meta staticUrl url createdAt }
  }""", {"id": "b320d328-ba8f-43a1-8eff-783b08dd5218"})
print(f"[deployment] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:600]}")

print("\n" + "=" * 72)
print("  RAILWAY — environment variables (values)")
print("=" * 72)
st, body = gql(f"""
{{
  variables(environmentId: "{ENV_ID}") {{
    edges {{ node {{ id name references serviceId }} }}
  }}
}}""")
print(f"[variables] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:800]}")

st, body = gql(f"""
{{
  variablesForServiceDeployment(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") {{
    nodes {{ name value }}
  }}
}}""")
print(f"[varsForServiceDeployment] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:1000]}")
if st == 200:
    nodes = ((body.get("data") or {}).get("variablesForServiceDeployment") or {}).get("nodes", [])
    for n in nodes:
        name, val = n.get("name"), (n.get("value") or "")
        if any(s in (name or "").upper() for s in
               ("TOKEN", "SECRET", "PASSWORD", "KEY", "CREDENTIAL")):
            shown = f"<set len={len(val)}>"
        else:
            shown = val[:120] if val else "<empty>"
        print(f"    {name!r} = {shown}")

print("\n" + "=" * 72)
print("  RAILWAY — cleanup probe variable (all 4 fields)")
print("=" * 72)
st, body = gql("""
  mutation($input: VariableDeleteInput!) { variableDelete(input: $input) }""",
              {"input": {
                  "projectId": PROJECT_ID,
                  "environmentId": ENV_ID,
                  "serviceId": SERVICE_ID,
                  "name": "JARVIS_NEXUS_WRITE_PROBE",
              }})
print(f"[variableDelete] HTTP {st} — {json.dumps(body)[:200]}")

print("\n" + "=" * 72)
print("  RAILWAY — GitHub connection state")
print("=" * 72)
st, body = gql("{ gitHubRepoAccessAvailable { isAvailable } }")
print(f"[gh-access] HTTP {st} — {json.dumps(body)[:200]}")

print("\nStage-6 probes complete.")
