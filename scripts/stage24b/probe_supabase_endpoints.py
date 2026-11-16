#!/usr/bin/env python3
"""Probe the NEW supabase backup endpoints on live production.

OWNER_KEY is read from Railway variables into memory ONLY (never printed,
never logged, never persisted). Checks:
  1. unauthenticated GET /railway/backup/supabase/status -> 401 (auth boundary)
  2. unauthenticated GET /railway/backup/supabase/list -> 401
  3. owner-authenticated GET /railway/backup/supabase/status -> 200 with an
     honest configured/missingVariables/protectionStatus report
  4. owner-authenticated /railway/backups logical.supabase block shape
  5. /metrics includes the backup counters surface (no secrets)
"""
import json
import re
import urllib.request

BASE = "https://jarvis-nexus-production.up.railway.app"
API = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"

OUT = {"startedAt": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()), "checks": []}


def check(name, ok, detail):
    OUT["checks"].append({"name": name, "ok": bool(ok), "detail": str(detail)[:400]})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {str(detail)[:240]}")


def load_token():
    for ln in open("/home/z/my-project/.env"):
        m = re.match(r"^(?:export\s+)?RAILWAY_API_TOKEN=(.+)$", ln.strip())
        if m:
            return m.group(1).strip().strip("'").strip('"')


def get_owner_key(token):
    q = ('query { variables(projectId: "%s", environmentId: "%s", serviceId: "%s") }'
         % (PROJECT_ID, ENV_ID, SERVICE_ID))
    req = urllib.request.Request(API, data=json.dumps({"query": q}).encode(), headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"}, method="POST")
    d = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    raw = (((d.get("data") or {}).get("variables")))
    parsed = json.loads(raw) if isinstance(raw, str) else (raw or {})
    return parsed.get("OWNER_KEY") if isinstance(parsed, dict) else None


def http(path, key=None):
    req = urllib.request.Request(BASE + path)
    if key:
        req.add_header("authorization", f"Bearer {key}")
    req.add_header("user-agent", "Mozilla/5.0 (X11; Linux x86_64)")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


token = load_token()
owner_key = get_owner_key(token)

# 1+2: unauthenticated boundary
c1, _ = http("/railway/backup/supabase/status")
check("supabase.status.unauthenticated", c1 == 401, f"GET without owner key -> {c1} (401 expected)")
c2, _ = http("/railway/backup/supabase/list")
check("supabase.list.unauthenticated", c2 == 401, f"GET without owner key -> {c2} (401 expected)")
c3, _ = http("/railway/backup/supabase/restore", )
# POST without body still must 401 before anything else
req = urllib.request.Request(BASE + "/railway/backup/supabase/restore", method="POST", data=b"{}")
req.add_header("user-agent", "Mozilla/5.0")
try:
    with urllib.request.urlopen(req, timeout=30) as res:
        c3 = res.status
except urllib.error.HTTPError as e:
    c3 = e.code
check("supabase.restore.unauthenticated", c3 == 401, f"POST without owner key -> {c3} (401 expected)")

if not owner_key:
    check("owner.key", False, "OWNER_KEY not readable — authenticated probes skipped")
else:
    # 3: honest status without credentials
    c4, b4 = http("/railway/backup/supabase/status", owner_key)
    doc4 = json.loads(b4) if c4 == 200 else {}
    sb = (doc4.get("data") or {})
    check("supabase.status.authenticated", c4 == 200, f"GET with owner key -> {c4}")
    check("supabase.status.honest", sb.get("configured") is False and
          sorted(sb.get("missingVariables") or []) == ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"],
          f"configured={sb.get('configured')} missing={sb.get('missingVariables')} status={sb.get('protectionStatus')}")
    # 4: the /railway/backups supabase block
    c5, b5 = http("/railway/backups", owner_key)
    doc5 = json.loads(b5) if c5 == 200 else {}
    logical = (doc5.get("data") or {}).get("logical") or {}
    sb5 = logical.get("supabase") or {}
    check("backups.supabase.block", c5 == 200 and sb5.get("configured") is False,
          f"supabase block present: configured={sb5.get('configured')}, "
          f"protectionStatus={sb5.get('protectionStatus')}, "
          f"missing={sb5.get('missingVariables')}")
    check("backups.rpo.provider", (logical.get("rpo") or {}).get("offVolume", {}).get("enabled") is False,
          "rpo.offVolume.enabled=false (honest: no verified off-volume copy yet)")
    check("no.secret.leak", "SUPABASE_SERVICE_ROLE_KEY=" not in b5 and "sb_secret_" not in b5,
          "no credential values in the response")

# 5: metrics surface
c6, b6 = http("/metrics")
check("metrics", c6 == 200 and "counters" in b6, f"/metrics -> {c6} (counters surface present)")

OUT["finishedAt"] = __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime())
OUT["verdict"] = "PASS" if all(c["ok"] for c in OUT["checks"]) else "FAIL"
path = "/home/z/my-project/docs/stage2.4b/evidence/production-acceptance/supabase-endpoints-probe.json"
with open(path, "w") as f:
    json.dump(OUT, f, indent=2)
print(f"\nverdict: {OUT['verdict']} — evidence: {path}")
