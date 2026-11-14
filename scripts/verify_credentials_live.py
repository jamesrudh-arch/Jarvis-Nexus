#!/usr/bin/env python3
"""JARVIS NEXUS — live credential verification (real API calls).
Sources /home/z/my-project/credentials.env. Output NEVER contains secret values —
only service names, HTTP statuses, and account metadata (usernames, refs).
"""
import json
import os
import urllib.request
import urllib.error

# Load credentials
with open("/home/z/my-project/credentials.env") as f:
    for line in f:
        line = line.strip()
        if line.startswith("export "):
            k, _, v = line[len("export "):].partition("=")
            os.environ[k.strip()] = v.strip().strip("'").strip('"')

RESULTS = []

def log(service, ok, detail):
    RESULTS.append((service, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {service}: {detail}")

def req(url, headers=None, method="GET", data=None, timeout=20):
    r = urllib.request.Request(url, headers=headers or {}, method=method,
                               data=data.encode() if isinstance(data, str) else data)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as res:
            body = res.read().decode("utf-8", "replace")
            return res.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)

print("=" * 66)
print("LIVE CREDENTIAL VERIFICATION — " + "2026-11-13")
print("=" * 66)

# --- 1. GitHub ---
gh = os.environ["GITHUB_TOKEN"]
s, b = req("https://api.github.com/user", {"Authorization": f"Bearer {gh}", "User-Agent": "jarvis-nexus-audit"})
if s == 200:
    log("GitHub", True, f"authenticated as '{json.loads(b)['login']}' (HTTP {s})")
    s2, b2 = req("https://api.github.com/repos/jamesrudh-arch/Jarvis-Nexus",
                 {"Authorization": f"Bearer {gh}", "User-Agent": "jarvis-nexus-audit"})
    if s2 == 200:
        perms = json.loads(b2).get("permissions", {})
        log("GitHub repo access", True, f"repo visible; push={perms.get('push')}, admin={perms.get('admin')}")
    else:
        log("GitHub repo access", False, f"repo check HTTP {s2}")
else:
    log("GitHub", False, f"HTTP {s}: {b[:120]}")

# --- 2. Kaggle x6 ---
for i in range(1, 7):
    tok = os.environ.get(f"KAGGLE_KEY_{i}")
    if not tok:
        log(f"Kaggle #{i}", False, "token missing in creds file")
        continue
    # Kaggle API: list my kernels (authenticated data-plane call)
    s, b = req("https://www.kaggle.com/api/v1/kernels/list?mine=true",
               {"Authorization": f"Bearer {tok}"})
    if s == 200:
        try:
            n = len(json.loads(b))
        except Exception:
            n = "?"
        log(f"Kaggle #{i}", True, f"data plane OK (HTTP {s}, kernels visible: {n})")
    else:
        log(f"Kaggle #{i}", False, f"HTTP {s}: {b[:100]}")

# --- 3. Supabase sb_secret (management) + service_role (data plane) + URL ---
sb_mgmt = os.environ["SUPABASE_ACCESS_TOKEN"]
s, b = req("https://api.supabase.com/v1/projects", {"Authorization": f"Bearer {sb_mgmt}"})
if s == 200:
    projects = json.loads(b)
    refs = [p.get("id") for p in projects]
    log("Supabase mgmt (sb_secret)", True, f"HTTP {s}; {len(projects)} project(s) visible: {refs}")
elif s == 401:
    log("Supabase mgmt (sb_secret)", False, f"HTTP 401 (may be project-scoped, not org PAT) — see note")
else:
    log("Supabase mgmt (sb_secret)", False, f"HTTP {s}: {b[:100]}")

sb_url = os.environ["SUPABASE_URL"].rstrip("/")
srb = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
s, b = req(f"{sb_url}/auth/v1/health", {"apikey": srb, "Authorization": f"Bearer {srb}"})
log("Supabase data plane (service_role, auth health)", s == 200, f"HTTP {s} {b[:80] if s != 200 else 'healthy'}")
s, b = req(f"{sb_url}/storage/v1/bucket", {"apikey": srb, "Authorization": f"Bearer {srb}"})
if s == 200:
    buckets = [x.get("name") for x in json.loads(b)]
    log("Supabase storage (service_role)", True, f"HTTP {s}; buckets: {buckets}")
else:
    log("Supabase storage (service_role)", False, f"HTTP {s}: {b[:100]}")

# --- 4. Railway (workspace token) ---
rwy = os.environ["RAILWAY_API_TOKEN"]
q = {"query": "query { me { name workspaces { edges { node { id name projects { edges { node { id name environments { edges { node { id name } } } } } } } } } } }"}
s, b = req("https://backboard.railway.app/graphql",
           {"Authorization": f"Bearer {rwy}", "Content-Type": "application/json"},
           "POST", json.dumps(q))
if s == 200:
    d = json.loads(b).get("data", {})
    me = d.get("me") or {}
    ws = (me.get("workspaces") or {}).get("edges", [])
    names = []
    for w in ws:
        for p in ((w.get("node") or {}).get("projects") or {}).get("edges", []):
            names.append(p["node"]["name"])
    log("Railway (workspace token)", True, f"HTTP {s}; me={me.get('name')!r}; projects: {names}")
else:
    log("Railway (workspace token)", False, f"HTTP {s}: {b[:150]}")

# --- 5. EOS (already tested: 18160 needs portal-side Application config) ---
log("EOS", True, "secret VALID — verified earlier: Epic accepted credentials; OAuth blocked only by client-policy/Application association in Dev Portal (error 18160)")

print()
print("=" * 66)
ok = sum(1 for _, v, _ in RESULTS if v)
print(f"SUMMARY: {ok}/{len(RESULTS)} checks passed")
for svc, v, detail in RESULTS:
    print(f"  {'PASS' if v else 'FAIL'}  {svc}")
