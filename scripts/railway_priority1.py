#!/usr/bin/env python3
"""Railway PRIORITY 1 executor — with correct client signature.

Sequence:
  1. project detail (environments, services, domains)
  2. GitHub integration state (githubRepos list — user-scoped, expect 403
     for workspace tokens; honest record either way)
  3. githubRepoDeploy authorization probe (invalid repo, safe)
  4. serviceCreate probe (write capability re-verification + cleanup)
"""
import json
import time
import urllib.error
import urllib.request

ENDPOINT = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.0"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"


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
                 "User-Agent": UA, "Accept": "application/json"})
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


out = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
       "client": UA}

# 1. project detail
st, d = gql("""
query($id: String!) {
  project(id: $id) {
    id name updatedAt
    environments { edges { node { id name isEphemeral } } }
    services { edges { node { id name } } }
  }
}""", {"id": PROJECT_ID})
out["project_detail"] = {"http": st, "data": d.get("data"),
                         "errors": d.get("errors")}

# 2. GitHub integration (user-scoped queries)
st, d2 = gql("{ githubRepos { id fullName isPrivate defaultBranch } }")
out["github_repos_query"] = {"http": st, "body": str(d2)[:200]}

# 3. githubRepoDeploy authorization probe (clearly nonexistent repo)
st, d3 = gql("""
mutation($input: GitHubRepoDeployInput!) {
  githubRepoDeploy(input: $input)
}""", {"input": {"projectId": PROJECT_ID,
                 "repo": "nonexistent-org-99887766/nexus-probe-zz",
                 "branch": "main"}})
out["githubRepoDeploy_probe"] = {"http": st, "body": str(d3)[:300]}

print(json.dumps(out, indent=1))
with open("/home/z/my-project/NEXUS_WORLD/reports/RAILWAY_PRIORITY1.json",
          "w") as f:
    json.dump(out, f, indent=1)
