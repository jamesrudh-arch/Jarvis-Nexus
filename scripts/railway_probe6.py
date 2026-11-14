#!/usr/bin/env python3
"""Railway probe v6 — GitHub integration availability checks."""
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
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:  # noqa: BLE001
            return e.code, {}
    except Exception as e:  # noqa: BLE001
        return 0, {"error": str(e)}


out = {}
for name, q in [
    ("gitHubRepoAccessAvailable", "{ gitHubRepoAccessAvailable }"),
    ("githubWritableScopes", "{ githubWritableScopes }"),
    ("githubIsRepoNameAvailable", '{ githubIsRepoNameAvailable(repo: "x/y") }'),
    ("githubRepos", "{ githubRepos { id fullName } }"),
    ("githubRepo_single", '{ githubRepo(repo: "irrelevant/probe") { id } }'),
]:
    st, d = gql(q)
    out[name] = {"http": st, "body": str(d)[:300]}

print(json.dumps(out, indent=1))
