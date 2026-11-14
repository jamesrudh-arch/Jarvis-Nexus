#!/usr/bin/env python3
"""Stage 2 Phase 0 — production vs repository route parity probe (GET-only, read-only).

Probes every GET route documented in apps/nexus-api/src/index.ts against the
Railway production deployment and records status codes. No mutations are sent.
"""
import json
import ssl
import time
import urllib.request
import urllib.error

BASE = "https://jarvis-nexus-production.up.railway.app"

# All 33 GET routes from repository source (apps/nexus-api/src/index.ts)
GET_ROUTES = [
    "/",
    "/health",
    "/health/detailed",
    "/jarvis/tasks",
    "/jarvis/tasks/test-id",
    "/mcp/audit",
    "/mcp/servers",
    "/mcp/servers/io.nexus.test-tools/tools",
    "/memory/global",
    "/metrics",
    "/models/catalog",
    "/models/health",
    "/models/providers",
    "/naei/agents",
    "/naei/tasks",
    "/naei/tasks/test-id",
    "/railway/audit",
    "/railway/backups",
    "/railway/credentials/status",
    "/railway/discovery",
    "/railway/events",
    "/railway/operations",
    "/railway/reconciliation",
    "/railway/recovery/plans/test-id",
    "/railway/status",
    "/railway/usage",
    "/world/events",
    "/world/residents",
    "/world/residents/test-id",
    "/world/state",
]

ctx = ssl.create_default_context()
results = []
for path in GET_ROUTES:
    url = BASE + path
    try:
        req = urllib.request.Request(url, method="GET",
                                     headers={"User-Agent": "stage2-phase0-parity/1.0"})
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            body = resp.read(400).decode("utf-8", "replace")
            results.append({"path": path, "status": resp.status, "body_head": body[:200]})
    except urllib.error.HTTPError as e:
        body = e.read(200).decode("utf-8", "replace")
        results.append({"path": path, "status": e.code, "body_head": body[:200]})
    except Exception as e:
        results.append({"path": path, "status": None, "body_head": f"ERROR: {type(e).__name__}: {e}"})
    time.sleep(0.15)

ok = sum(1 for r in results if r["status"] == 200)
missing_404 = [r["path"] for r in results if r["status"] == 404]
other = [(r["path"], r["status"]) for r in results if r["status"] not in (200, 404)]

print(json.dumps({
    "probedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "base": BASE,
    "total_get_probed": len(results),
    "ok_200": ok,
    "missing_404": missing_404,
    "other_status": other,
}, indent=2))
print("\n--- per-route detail ---")
for r in results:
    print(f"{r['status']}\t{r['path']}\t{r['body_head'][:120]}")
