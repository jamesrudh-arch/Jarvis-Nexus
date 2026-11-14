#!/usr/bin/env python3
"""Railway remaining-credit + instances + restart evidence (Directive 4, part 3)."""
import json
import re
import time
import urllib.request
import urllib.error

GQL = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.1"
PROJ = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
DEP = "8128960e-edf7-4a0f-88f2-dfde6964d168"
WS = "359b04d0-007d-4903-a210-05fb31a3aa35"
OUT = "/home/z/my-project/NEXUS_WORLD/reports/RAILWAY_CREDIT_INSTANCES.json"


def load_token():
    for line in open("/home/z/my-project/.env"):
        line = line.strip()
        if line.startswith("RAILWAY_TOKEN="):
            return line.split("=", 1)[1].strip()
    return ""


def gql(query, variables=None):
    token = load_token()
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        GQL, data=body, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Accept": "application/json",
                 "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode() or "{}")
        except Exception:
            return {"http_error": e.code}
    except Exception as e:
        return {"exception": str(e)[:300]}


out = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

# --- 1. deployment instances (correct shape: direct list) ---
r = gql('query($id: String!) { deployment(id: $id) { id status createdAt statusUpdatedAt canRedeploy canRollback instances { id status } } }', {"id": DEP})
out["deployment"] = (r.get("data") or {}).get("deployment") or {"errors": r.get("errors")}

# --- 2. full deployment logs (working format) — restart/crash evidence ---
r = gql('query($id: String!) { deploymentLogs(deploymentId: $id) { message severity timestamp } }', {"id": DEP})
logs = (r.get("data") or {}).get("deploymentLogs") or []
out["log_count"] = len(logs)
out["log_time_range"] = {
    "first": logs[0].get("timestamp") if logs else None,
    "last": logs[-1].get("timestamp") if logs else None,
}
# count restart-ish markers
restart_markers = [l for l in logs if re.search(
    r"restart|crash|OOM|killed|exit|SIGTERM|SIGKILL|unhealthy|sleeping|idled",
    (l.get("message") or ""), re.I)]
out["restart_marker_count"] = len(restart_markers)
out["restart_markers_sample"] = [
    {"ts": l.get("timestamp"), "severity": l.get("severity"),
     "msg": re.sub(r"(rlwy_|sk-|ghp_)[A-Za-z0-9_\-]{6,}", r"\1[REDACTED]", (l.get("message") or ""))[:180]}
    for l in restart_markers[:10]]
out["first_logs"] = [
    {"ts": l.get("timestamp"),
     "msg": re.sub(r"(rlwy_|sk-|ghp_)[A-Za-z0-9_\-]{6,}", r"\1[REDACTED]", (l.get("message") or ""))[:180]}
    for l in logs[:8]]
out["last_logs"] = [
    {"ts": l.get("timestamp"),
     "msg": re.sub(r"(rlwy_|sk-|ghp_)[A-Za-z0-9_\-]{6,}", r"\1[REDACTED]", (l.get("message") or ""))[:180]}
    for l in logs[-8:]]

# --- 3. workspace usage / remaining credit attempts ---
attempts = {}
# a) workspace node
r = gql('query($id: String!) { workspace(id: $id) { id name subscription { tier status } usage { cpu memory disk egress limit } } }', {"id": WS})
attempts["workspace_subscription_usage"] = (r.get("data") or {}).get("workspace") or {"errors": [e.get("message") for e in (r.get("errors") or [])][:2]}
# b) billing via project.workspace path
r = gql('query($id: String!) { project(id: $id) { workspace { id name subscription { tier status currentPeriodEnd } usage { cpu memory disk egress limit } } } }', {"id": PROJ})
attempts["project_workspace"] = (r.get("data") or {}).get("project") or {"errors": [e.get("message") for e in (r.get("errors") or [])][:2]}
out["credit_attempts"] = attempts

with open(OUT, "w") as f:
    json.dump(out, f, indent=1, default=str)
print(f"[saved] {OUT}")
print(json.dumps(out, indent=1, default=str)[:4500])
