#!/usr/bin/env python3
"""Railway GraphQL v2 client: verify token, find project/service/env,
list current variable NAMES (never values), and upsert new ones.
"""
import json
import os
import subprocess
import sys

with open("/home/z/my-project/credentials.env") as f:
    for line in f:
        line = line.strip()
        if line.startswith("export "):
            k, _, v = line[len("export "):].partition("=")
            os.environ[k.strip()] = v.strip().strip("'").strip('"')

TOKEN = os.environ["RAILWAY_API_TOKEN"]
API = "https://backboard.railway.com/graphql/v2"

def gql(query, variables=None):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    out = subprocess.run(
        ["curl", "-sS", "-w", "\n%{http_code}", "--max-time", "40",
         "-X", "POST", API,
         "-H", f"Authorization: Bearer {TOKEN}",
         "-H", "Content-Type: application/json",
         "-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
         "-d", json.dumps(payload)],
        capture_output=True, text=True, timeout=60).stdout
    body, _, code = out.rpartition("\n")
    code = int(code or 0)
    try:
        return code, json.loads(body)
    except Exception:
        return code, {"raw": body}

cmd = sys.argv[1] if len(sys.argv) > 1 else "me"

if cmd == "me":
    code, d = gql("query { me { id name workspaces { edges { node { id name } } } } }")
    print(f"HTTP {code}")
    print(json.dumps(d, indent=2)[:1500])

elif cmd == "projects":
    code, d = gql("""query { workspaces { edges { node { id name projects { edges { node { id name environments { edges { node { id name } } } } } } } } } }""")
    print(f"HTTP {code}")
    for w in ((d.get("data") or {}).get("workspaces") or {}).get("edges", []):
        wn = w["node"]["name"]
        for p in (w["node"].get("projects") or {}).get("edges", []):
            pn = p["node"]["name"]
            envs = [e["node"]["name"] for e in (p["node"].get("environments") or {}).get("edges", [])]
            print(f"workspace={wn!r} project={pn!r} envs={envs} pid={p['node']['id']}")

elif cmd == "vars":
    # list variable names only — values are NEVER printed
    code, d = gql("""query($envId: String!) { environment(id: $envId) { id name variables { edges { node { id name } } } } }""",
                  {"envId": sys.argv[2]})
    print(f"HTTP {code}")
    env = (d.get("data") or {}).get("environment") or {}
    names = sorted(e["node"]["name"] for e in (env.get("variables") or {}).get("edges", []))
    print(f"environment: {env.get('name')}")
    print(f"{len(names)} variables (names only):")
    for n in names:
        print(f"  {n}")

elif cmd == "upsert":
    # upsert one variable: serviceId + environmentId + name + value
    service_id, env_id, name, value = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
    code, d = gql("""mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) { id name } }""",
                  {"input": {"serviceId": service_id, "environmentId": env_id,
                             "name": name, "value": value}})
    ok = "errors" not in d and code == 200
    print(f"HTTP {code} upsert {name}: {'OK' if ok else json.dumps(d)[:200]}")

elif cmd == "services":
    code, d = gql("""query($envId: String!) { environment(id: $envId) { id name serviceInstances { edges { node { id service { id name } } } } } }""",
                  {"envId": sys.argv[2]})
    print(f"HTTP {code}")
    env = (d.get("data") or {}).get("environment") or {}
    for s in (env.get("serviceInstances") or {}).get("edges", []):
        n = s["node"]
        print(f"serviceInstance={n['id']} service={n['service']['name']} serviceId={n['service']['id']}")

elif cmd == "deploy":
    # trigger redeploy of a service in an environment
    service_id, env_id = sys.argv[2], sys.argv[3]
    code, d = gql("""mutation($input: DeploymentCreateInput!) { deploymentCreate(input: $input) { id status } }""",
                  {"input": {"serviceId": service_id, "environmentId": env_id}})
    print(f"HTTP {code} {json.dumps(d)[:300]}")
