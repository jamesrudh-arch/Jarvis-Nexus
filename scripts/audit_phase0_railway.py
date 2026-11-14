#!/usr/bin/env python3
"""Phase 0 evidence: Railway deployment status + production probes.

Tokens are loaded from .env and never printed. Output is JSON to stdout;
redirect to the audit evidence directory when running.
"""
import json
import os
import sys
import urllib.request
import urllib.error


def load_env(path="/home/z/my-project/.env"):
    env = {}
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


ENV = load_env()
TOKEN = ENV.get("RAILWAY_TOKEN", "")
GQL = "https://backboard.railway.com/graphql/v2"
SERVICE = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
ENVIRONMENT = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
BASE = "https://jarvis-nexus-production.up.railway.app"


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        GQL, data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


out = {"railway": {}, "probes": [], "errors": []}

# Query 1: service + latest deployments
try:
    r = gql(
        "query($sid:String!){ service(id:$sid){ id name "
        "deployments(first:10){ edges { node { id status createdAt } } } } }",
        {"sid": SERVICE},
    )
    out["railway"]["service"] = r.get("data", {}).get("service")
    if r.get("errors"):
        out["errors"].append({"q1": r["errors"]})
except Exception as e:
    out["errors"].append({"q1": str(e)})

# Query 2: environment + variable NAMES only (values are never requested)
try:
    r = gql(
        "query($eid:String!){ environment(id:$eid){ id name } }",
        {"eid": ENVIRONMENT},
    )
    out["railway"]["environment"] = r.get("data", {}).get("environment")
    if r.get("errors"):
        out["errors"].append({"q2": r["errors"]})
except Exception as e:
    out["errors"].append({"q2": str(e)})

try:
    r = gql(
        "query($eid:String!){ environmentVariables(environmentId:$eid, first:100)"
        "{ edges { node { id name } } } }",
        {"eid": ENVIRONMENT},
    )
    out["railway"]["variable_names"] = [
        e["node"]["name"] for e in r.get("data", {}).get("environmentVariables", {}).get("edges", [])
    ] if r.get("data") else None
    if r.get("errors"):
        out["errors"].append({"q3": r["errors"]})
except Exception as e:
    out["errors"].append({"q3": str(e)})


def probe(method, path, body=None, headers=None, note=""):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = r.read(4000).decode("utf-8", "replace")
            return {"method": method, "path": path, "status": r.status, "body": payload[:2000], "note": note}
    except urllib.error.HTTPError as e:
        payload = e.read(4000).decode("utf-8", "replace")
        return {"method": method, "path": path, "status": e.code, "body": payload[:2000], "note": note}
    except Exception as e:
        return {"method": method, "path": path, "error": str(e), "note": note}


# Safe GET probes
out["probes"].append(probe("GET", "/health", note="health endpoint"))
out["probes"].append(probe("GET", "/world/state", note="world state (unauthenticated)"))
out["probes"].append(probe("GET", "/nonexistent", note="404 handling"))
# Unauthorised mutation probes: expect 401/403; if they succeed that is a defect finding
out["probes"].append(probe("POST", "/world/advance", body={"sim_hours": 1}, note="unauth world advance - expect 401"))
out["probes"].append(probe("POST", "/mcp/invoke", body={"server": "test", "tool": "add", "args": {"a": 1, "b": 2}}, note="unauth mcp invoke"))
out["probes"].append(probe("POST", "/jarvis/objectives", body={"text": "audit probe"}, note="unauth jarvis objective"))

print(json.dumps(out, indent=2))
