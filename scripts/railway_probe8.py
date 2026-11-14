#!/usr/bin/env python3
"""Railway probe v8 — retry with backoff after 403s."""
import json
import time
import urllib.error
import urllib.request

ENDPOINT = "https://backboard.railway.com/graphql/v2"


def gql(query, variables=None, retries=3):
    token = ""
    for line in open("/home/z/my-project/.env"):
        line = line.strip()
        if line.startswith("RAILWAY_TOKEN="):
            token = line.split("=", 1)[1].strip().strip('"').strip("'")
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    for attempt in range(retries):
        req = urllib.request.Request(
            ENDPOINT, data=body,
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (429, 403) and attempt < retries - 1:
                time.sleep(15 * (attempt + 1))
                continue
            try:
                return e.code, json.loads(e.read().decode() or "{}")
            except Exception:  # noqa: BLE001
                return e.code, {}
        except Exception as e:  # noqa: BLE001
            return 0, {"error": str(e)}
    return 0, {"error": "retries exhausted"}


if __name__ == "__main__":
    st, d = gql("{ projects { edges { node { id name } } } }")
    print("projects HTTP", st, json.dumps((d.get("data") or {}).get("projects"))[:200])

    time.sleep(2)
    st, d = gql(
        "query($id: String!) { project(id: $id) { id name "
        "environments { edges { node { id name } } } } }",
        {"id": "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"})
    print("project+env HTTP", st, json.dumps(d)[:400])

    time.sleep(2)
    st, d = gql("mutation($input: GitHubRepoDeployInput!) { githubRepoDeploy(input: $input) }",
                {"input": {"projectId": "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3",
                           "repo": "definitely-nonexistent-org-99887766/nexus-probe-repo-zz",
                           "branch": "main"}})
    print("githubRepoDeploy probe HTTP", st, json.dumps(d)[:400])
