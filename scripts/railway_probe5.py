#!/usr/bin/env python3
"""Railway probe v5 — GitHubRepo/User introspection + githubRepos list."""
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
st, d = gql('{ g: __type(name: "GitHubRepo") { fields { name } } '
            'u: __type(name: "User") { fields { name } } }')
out["GitHubRepo_fields"] = [f["name"] for f in (((d.get("data") or {}).get("g") or {}).get("fields")) or []]
out["User_fields"] = [f["name"] for f in (((d.get("data") or {}).get("u") or {}).get("fields")) or []]

if out["GitHubRepo_fields"]:
    sub = " ".join(out["GitHubRepo_fields"])
    st, d2 = gql("{ githubRepos { %s } }" % sub)
    out["githubRepos"] = {"http": st, "data": d2.get("data"), "errors": d2.get("errors")}

st, d3 = gql("{ me { %s } }" % " ".join(out["User_fields"]))
out["me"] = {"http": st, "data": d3.get("data"), "errors": d3.get("errors")}

print(json.dumps(out, indent=1, default=str))
