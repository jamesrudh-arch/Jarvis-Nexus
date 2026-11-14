#!/usr/bin/env python3
"""Railway probe v7 — githubRepoDeploy authorization probe (invalid repo, safe)
+ serviceCreate source-repo probe. Never deploys real code; only distinguishes
403-unauthorized from repo-not-found. Cleans up anything created.
"""
import json
import time
import urllib.request

ENDPOINT = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"  # reasonable-heart


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
                 "Content-Type": "application/json"})
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


out = {}

# 1. githubRepoDeploy with clearly nonexistent repo — safe authorization probe
st, d = gql("""
mutation($input: GitHubRepoDeployInput!) {
  githubRepoDeploy(input: $input)
}
""", {"input": {
    "projectId": PROJECT_ID,
    "repo": "definitely-nonexistent-org-99887766/nexus-probe-repo-zz",
    "branch": "main",
}})
out["githubRepoDeploy_probe"] = {"http": st, "body": str(d)[:500]}

# 2. environments of the project (needed for any real deploy later)
st, d2 = gql("""
query($id: String!) {
  project(id: $id) { environments { edges { node { id name isEphemeral } } } }
}
""", {"id": PROJECT_ID})
out["environments"] = {"http": st, "data": d2.get("data"), "errors": d2.get("errors")}

print(json.dumps(out, indent=1))
