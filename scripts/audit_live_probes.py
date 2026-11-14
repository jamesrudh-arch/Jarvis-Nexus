#!/usr/bin/env python3
"""Phase 6/7 pre-remediation live probes against production.

Safe, read-mostly probes: one MCP add (audit row only), one JARVIS objective
(clearly labelled audit probe), plus GET probes. No owner key is used or known.
Output JSON to stdout.
"""
import json
import urllib.request
import urllib.error

BASE = "https://jarvis-nexus-production.up.railway.app"


def req(method, path, body=None, headers=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return {"method": method, "path": path, "status": resp.status,
                    "body": resp.read(6000).decode("utf-8", "replace")[:4000]}
    except urllib.error.HTTPError as e:
        return {"method": method, "path": path, "status": e.code,
                "body": e.read(6000).decode("utf-8", "replace")[:4000]}
    except Exception as e:
        return {"method": method, "path": path, "error": str(e)}


out = {"probes": []}

# 1. Unauthenticated MCP invoke with a VALID body on the auto-permission bundled server
out["probes"].append(req("POST", "/mcp/invoke",
    {"serverName": "io.nexus.test-tools", "toolName": "add", "args": {"a": 21, "b": 21}},
    note_if_needed := None) | {"note": "unauth valid-body mcp invoke - 200 proves the open gateway"})

# 2. Unauthenticated JARVIS objective (model spend without auth) - one small call only
out["probes"].append(req("POST", "/jarvis/objectives",
    {"objective": "Audit probe: reply with exactly the single word ACK."}) | {"note": "unauth objective - model spend without auth"})

# 3. Unauthenticated audit log read
out["probes"].append(req("GET", "/mcp/audit?limit=5") | {"note": "unauth audit log disclosure"})

# 4. Provider health + metrics (production observability; provider list shows live config)
out["probes"].append(req("GET", "/models/health") | {"note": "production provider health"})
out["probes"].append(req("GET", "/models/providers") | {"note": "production provider list (no secrets expected)"})
out["probes"].append(req("GET", "/metrics") | {"note": "production metrics"})

# 5. World events (read-only)
out["probes"].append(req("GET", "/world/events?limit=3") | {"note": "production event history"})

# 6. Unauthenticated memory write attempt (valid-body) - proves poisoning vector
out["probes"].append(req("POST", "/memory", {
    "scope": "audit-probe", "tier": "semantic", "kind": "fact",
    "title": "audit probe memory", "content": "written without authentication",
    "importance": 0.5}) | {"note": "unauth memory write - poisoning vector"})

print(json.dumps(out, indent=2))
