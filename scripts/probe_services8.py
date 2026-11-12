#!/usr/bin/env python3
"""Stage 8: volume introspection + probe-variable cleanup + variables map."""
import json
import os
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
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"


def gql(query, variables=None):
    data = json.dumps({"query": query, "variables": variables or {}}).encode()
    r = urllib.request.Request("https://backboard.railway.app/graphql/v2",
                               data=data, method="POST")
    r.add_header("Authorization", f"Bearer {ENV['RAILWAY_API_TOKEN']}")
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "jarvis-nexus-probe/8.0")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, e.read().decode("utf-8", "replace")[:300]
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


st, b = gql('{ __type(name: "Mutation") { fields { name } } }')
if st == 200:
    names = [f["name"] for f in b["data"]["__type"]["fields"]]
    print("volume mutations:", [n for n in names if "volume" in n.lower()])

st, b = gql('query($e: String!, $s: String!) { volumeInstance(environmentId: $e, serviceId: $s) { id volumeId currentMountPath } }',
            {"e": ENV_ID, "s": SERVICE_ID})
print(f"volumeInstance: HTTP {st} — {json.dumps(b)[:300]}")

st, b = gql('mutation($input: VariableDeleteInput!) { variableDelete(input: $input) }',
            {"input": {"projectId": PROJECT_ID, "environmentId": ENV_ID,
                       "name": "JARVIS_NEXUS_WRITE_PROBE"}})
print(f"variableDelete(no serviceId): HTTP {st} — {json.dumps(b)[:200]}")

st, b = gql(f'{{ variables(projectId: "{PROJECT_ID}", environmentId: "{ENV_ID}") }}')
print(f"variables map: HTTP {st} — {json.dumps(b)[:300]}")

# volumeInstanceDetails for mount path info
st, b = gql(f'{{ serviceInstance(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") {{ id }} }}')
print(f"serviceInstance sanity: HTTP {st} — {json.dumps(b)[:200]}")
