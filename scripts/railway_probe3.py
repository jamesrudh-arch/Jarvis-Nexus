#!/usr/bin/env python3
"""Railway probe v3 — Query root, ServiceSourceInput, workspace discovery."""
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

# Query root fields
st, d = gql("{ __schema { queryType { fields { name args { name type { kind name ofType { kind name } } } } } } }")
fields = ((((d.get("data") or {}).get("__schema") or {}).get("queryType") or {}).get("fields")) or []
out["query_root_fields"] = sorted(f["name"] for f in fields)
# keep arg details for workspace-ish queries
for f in fields:
    if f["name"] in ("workspace", "me", "workspaces", "githubRepos", "gitHubRepos", "railwayGithubRepos"):
        out[f"query_{f['name']}"] = f

# ServiceSourceInput
st, d2 = gql('{ __type(name: "ServiceSourceInput") { inputFields { name type { kind name ofType { kind name ofType { kind name } } } } } }')
out["ServiceSourceInput"] = ((d2.get("data") or {}).get("__type") or {}).get("inputFields")

print(json.dumps(out, indent=1, default=str))
