#!/usr/bin/env python3
"""Railway probe v2 — correct casing + top-level projects query."""
import json
import urllib.request

ENDPOINT = "https://backboard.railway.com/graphql/v2"


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
                 "User-Agent": "nexus-continuation/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")
    except Exception as e:  # noqa: BLE001
        return 0, {"error": str(e)}


out = {}

# top-level projects (this worked last session)
st, data = gql("{ projects { edges { node { id name updatedAt } } } }")
out["projects"] = {"http": st, "data": data.get("data"), "errors": data.get("errors")}
edges = (data.get("data") or {}).get("projects", {}).get("edges", [])
target = next((e["node"] for e in edges if e["node"]["name"] == "reasonable-heart"), None)
out["reasonable-heart"] = target

# correct input casing
for tname in ("GitHubRepoDeployInput", "ServiceCreateInput", "ServiceUpdateInput"):
    st, d = gql('{ __type(name: "%s") { inputFields { name type { kind name ofType { kind name ofType { kind name } } } } } }' % tname)
    out[tname] = ((d.get("data") or {}).get("__type") or {}).get("inputFields")

# project detail with environments
if target:
    st, d2 = gql("""
    query($id: String!) {
      project(id: $id) {
        id name updatedAt
        environments { edges { node { id name isEphemeral } } }
        services { edges { node {
          id name serviceType
          source { image repo branch }
        } } }
      }
    }
    """, {"id": target["id"]})
    out["project_detail"] = {"http": st, "data": d2.get("data"), "errors": d2.get("errors")}

print(json.dumps(out, indent=1, default=str))
