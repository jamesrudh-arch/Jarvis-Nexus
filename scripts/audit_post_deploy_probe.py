#!/usr/bin/env python3
"""Post-deploy verification: CI conclusion + production behavior probes.

Detects the new deployment by behavior change: /mcp/invoke (unauth) must go
from 200 (open gateway) to 401 (owner-gated). Writes JSON evidence to stdout.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

BASE = "https://jarvis-nexus-production.up.railway.app"
SHA = "269d422"
CI_TIMEOUT_S = 240
DEPLOY_TIMEOUT_S = 300


def load_env(path="/home/z/my-project/.env"):
    env = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


ENV = load_env()
TOKEN = ENV.get("GITHUB_TOKEN", "")


def gh_json(url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def probe(method, path, body=None, headers=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return {"method": method, "path": path, "status": resp.status,
                    "body": resp.read(4000).decode("utf-8", "replace")[:2500]}
    except urllib.error.HTTPError as e:
        return {"method": method, "path": path, "status": e.code,
                "body": e.read(4000).decode("utf-8", "replace")[:2500]}
    except Exception as e:
        return {"method": method, "path": path, "error": str(e)}


out = {"ci": None, "deploy": {"detected_by": "unauth /mcp/invoke -> 401", "seconds": None}, "probes": [], "notes": []}

# --- 1. CI conclusion ----------------------------------------------------------
deadline = time.time() + CI_TIMEOUT_S
while time.time() < deadline:
    try:
        runs = gh_json("https://api.github.com/repos/jamesrudh-arch/Jarvis-Nexus/actions/runs?per_page=5")
        run = next((r for r in runs.get("workflow_runs", []) if r.get("head_sha", "").startswith(SHA)), None)
        if not run:
            run = next((r for r in runs.get("workflow_runs", []) if r.get("head_sha", "").startswith("269d422")), None) if False else None
        if not run:
            # the sha we want may not be the head of any run yet; look by recency
            run = next((r for r in runs.get("workflow_runs", []) if r.get("head_sha", "") in (SHA, "269d4225f'")), None)
        # simpler: pick the newest run whose head_sha is NOT one of the old ones
        old = {"8e58a25", "af8bf00", "945a78d", "a65bf4f"}
        if not run:
            run = next((r for r in runs.get("workflow_runs", []) if r.get("head_sha", "")[:7] not in old), None)
        if run and run.get("status") == "completed":
            out["ci"] = {"id": run["id"], "head_sha": run["head_sha"][:7], "conclusion": run.get("conclusion"), "html_url": run.get("html_url")}
            break
        if run:
            out["ci"] = {"id": run["id"], "head_sha": run["head_sha"][:7], "status": run.get("status"), "html_url": run.get("html_url")}
    except Exception as e:
        out["notes"].append(f"ci poll: {e}")
    time.sleep(15)

# --- 2. wait for the new deployment (behavior change) ---------------------------
start = time.time()
deadline = time.time() + DEPLOY_TIMEOUT_S
deployed = False
while time.time() < deadline:
    p = probe("POST", "/mcp/invoke", {"serverName": "io.nexus.test-tools", "toolName": "add", "args": {"a": 2, "b": 3}})
    if p.get("status") == 401:
        deployed = True
        break
    time.sleep(15)
out["deploy"]["seconds"] = round(time.time() - start, 1)
out["deploy"]["deployed"] = deployed
if not deployed:
    out["notes"].append("deployment not detected within timeout — last probe: " + json.dumps(probe("POST", "/mcp/invoke", {"serverName": "io.nexus.test-tools", "toolName": "add", "args": {"a": 2, "b": 3}}))[:300])

# --- 3. full post-remediation probe set ------------------------------------------
if deployed:
    out["probes"].append(probe("GET", "/health") | {"note": "health post-remediation"})
    out["probes"].append(probe("GET", "/") | {"note": "root contract (contractVersion from CONTRACT_VERSION)"})
    out["probes"].append(probe("GET", "/world/state") | {"note": "world state"})
    out["probes"].append(probe("POST", "/mcp/invoke", {"serverName": "io.nexus.test-tools", "toolName": "add", "args": {"a": 21, "b": 21}}) | {"note": "unauth mcp invoke — MUST be 401 now"})
    out["probes"].append(probe("GET", "/mcp/audit?limit=5") | {"note": "unauth audit — MUST be 401 now"})
    out["probes"].append(probe("POST", "/memory", {"scope": "audit-probe-2", "tier": "semantic", "kind": "fact", "title": "x", "content": "y", "importance": 0.5, "confidence": 0.8}) | {"note": "unauth memory write — MUST be 401 now"})
    out["probes"].append(probe("POST", "/jarvis/objectives", {"objective": "audit probe 2"}) | {"note": "unauth objective — MUST be 401 now"})
    out["probes"].append(probe("POST", "/naei/tasks", {"requirement": "x", "acceptanceCriteria": ["y"]}) | {"note": "unauth naei task — MUST be 401 now"})
    out["probes"].append(probe("GET", "/models/health") | {"note": "provider health"})
    out["probes"].append(probe("GET", "/models/providers") | {"note": "provider list"})
    out["probes"].append(probe("GET", "/metrics") | {"note": "metrics — labels must be bounded (route allowlist)"})
    out["probes"].append(probe("GET", "/cardinality-check-1/deep/path") | {"note": "unknown path — counted under 'other'"})

print(json.dumps(out, indent=2))
