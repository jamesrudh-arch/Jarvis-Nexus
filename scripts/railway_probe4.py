#!/usr/bin/env python3
"""Railway probe v4 — list GitHub repos connected to the workspace + me + repo branches."""
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

st, d = gql("{ me { id name email workspaceId workspaces { id name } } }")
out["me"] = {"http": st, "data": d.get("data"), "errors": d.get("errors")}

# githubRepos — try common shapes
for q in ("{ githubRepos { id fullName name owner private defaultBranch } }",
          "{ githubRepos { id name owner } }",
          "{ githubRepos }"):
    st, d2 = gql(q)
    if st == 200 and not d2.get("errors"):
        out["githubRepos"] = d2.get("data")
        break
    out.setdefault("githubRepos_attempts", []).append(
        {"q": q[:60], "http": st, "errors": [e.get("message") for e in (d2.get("errors") or [])]})

# githubRepo single — introspect its shape first
st, d3 = gql('{ __type(name: "Query") { fields { name } } }')
if st == 200:
    pass

print(json.dumps(out, indent=1, default=str))
