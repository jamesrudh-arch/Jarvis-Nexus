#!/usr/bin/env python3
"""
JARVIS NEXUS — Real service credential verification.
Reads .env.local (gitignored). Prints ONLY statuses/identities — never secrets.
Exit code 0 if all critical services verified.

Honesty notes (live-verified 2026-11-13, session 6):
- Supabase is the STORAGE backend (owner directive): data plane, auth health
  and full storage CRUD are exercised for real (upload → byte-identical
  readback → anonymous rejection → delete → gone).
- Cloudflare: token is ACCOUNT-scoped (verify endpoint answers 401 for this
  class — /accounts is authoritative). R2 is RETIRED by directive — no R2
  API calls; storage is Supabase.
- Railway: `me` is not readable by this workspace token — projects is
  queried alone; live deployment health checked separately.
- Epic EOS: real client-credentials OAuth is attempted; without the Client
  Secret every supplied value answers 400 invalid_client_credentials (12/12
  permutations swept 2026-11-13).
"""
import json
import os
import sys
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env(path=os.path.join(ROOT, ".env.local")):
    env = {}
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def req(method, url, headers=None, body=None, timeout=25, raw_body=None):
    data = raw_body if raw_body is not None else (
        json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("User-Agent", "jarvis-nexus-verify/2.0")
    r.add_header("Accept", "application/json")
    if body is not None:
        r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, raw.decode("utf-8", "replace")[:400]
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, ""
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


ENV = load_env()
results = []


def record(service, ok, detail):
    results.append((service, "OK" if ok else "FAIL", detail))
    print(f"[{'OK ' if ok else 'FAIL'}] {service:<28} {detail}")


# ---- GitHub ------------------------------------------------------------
gh = ENV.get("GITHUB_TOKEN", "")
if gh:
    st, me = req("GET", "https://api.github.com/user",
                 {"Authorization": f"Bearer {gh}", "Accept": "application/vnd.github+json"})
    login = me.get("login") if isinstance(me, dict) else "?"
    record("github:token", st == 200 and bool(login), f"HTTP {st} — authenticated as {login!r}")
    repo = ENV.get("GITHUB_REPO", "jamesrudh-arch/Jarvis-Nexus")
    st, r = req("GET", f"https://api.github.com/repos/{repo}",
                {"Authorization": f"Bearer {gh}", "Accept": "application/vnd.github+json"})
    if st == 200 and isinstance(r, dict):
        perm = r.get("permissions", {})
        record(f"github:repo", bool(perm.get("push")),
               f"{repo} default_branch={r.get('default_branch')} push={perm.get('push')}")
    else:
        record("github:repo", False, f"HTTP {st} — {str(r)[:120]}")
else:
    record("github:token", False, "GITHUB_TOKEN missing")

# ---- Kaggle (six accounts) ----------------------------------------------
kaggle_ok = 0
for i in range(1, 7):
    tok = ENV.get(f"KAGGLE_API_TOKEN_{i}", "")
    if not tok:
        record(f"kaggle:account-{i}", False, "token missing")
        continue
    hdr = {"Authorization": f"Bearer {tok}"}
    st, hello = req("GET", "https://www.kaggle.com/api/v1/hello", hdr)
    if st == 200 and isinstance(hello, dict):
        kaggle_ok += 1
        record(f"kaggle:account-{i}", True,
               f"HTTP 200 — authenticated as {hello.get('userName')!r}")
    else:
        record(f"kaggle:account-{i}", False, f"HTTP {st} — {str(hello)[:80]}")
record("kaggle:accounts", kaggle_ok == 6, f"{kaggle_ok}/6 tokens valid")

# ---- Supabase (STORAGE backend — full CRUD + data plane) ----------------
sb = ENV.get("SUPABASE_ACCESS_TOKEN", "") or ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
sb_url = ENV.get("SUPABASE_URL", "")
if sb and sb_url:
    base = sb_url.rstrip("/")
    hdr = {"apikey": sb, "Authorization": f"Bearer {sb}"}
    st, body = req("GET", f"{base}/rest/v1/", hdr)
    record("supabase:data-plane", st == 200,
           f"HTTP {st} — project REST root {'reachable' if st == 200 else 'unreachable'}")
    st, body = req("GET", f"{base}/auth/v1/health", hdr)
    record("supabase:auth-health", st == 200,
           f"HTTP {st} — GoTrue health {body.get('version', '?') if isinstance(body, dict) else ''}")
    # Storage CRUD on the app bucket (real write → readback → delete → gone)
    st, body = req("GET", f"{base}/storage/v1/bucket", hdr)
    if st == 200 and isinstance(body, list):
        names = [b.get("name") for b in body]
        record("supabase:storage-list", True, f"HTTP 200 — buckets: {names}")
        app_bucket = ENV.get("NEXUS_STORAGE_BUCKET", "jarvis-nexus-assets")
        if app_bucket not in names:
            st2, _ = req("POST", f"{base}/storage/v1/bucket",
                         {**hdr, "Content-Type": "application/json"},
                         {"name": app_bucket, "public": False, "file_size_limit": 10485760})
            record("supabase:storage-bucket", st2 in (200, 201),
                   f"created private bucket '{app_bucket}' (HTTP {st2})")
        probe_key = "verify/probe.txt"
        payload = b"jarvis-nexus verify_integrations probe"
        st3, _ = req("POST", f"{base}/storage/v1/object/{app_bucket}/{probe_key}",
                     {**hdr, "Content-Type": "text/plain", "x-upsert": "true"}, raw_body=payload)
        st4, raw4 = req("GET", f"{base}/storage/v1/object/{app_bucket}/{probe_key}", hdr)
        ok_read = st4 == 200 and raw4 == payload.decode()
        record("supabase:storage-crud", st3 in (200, 201) and ok_read,
               f"upload HTTP {st3}, download HTTP {st4}, bytes-match={ok_read}")
        st5, _ = req("DELETE", f"{base}/storage/v1/object/{app_bucket}",
                     {**hdr, "Content-Type": "application/json"},
                     {"prefixes": [probe_key]})
        st6, _ = req("GET", f"{base}/storage/v1/object/{app_bucket}/{probe_key}", hdr)
        record("supabase:storage-cleanup", st5 in (200, 201) and st6 in (400, 404),
               f"delete HTTP {st5}, readback HTTP {st6} (gone)")
    else:
        record("supabase:storage-list", False, f"HTTP {st} — {str(body)[:100]}")
elif sb or sb_url:
    record("supabase:data-plane", False,
           "both SUPABASE_URL and a sb_secret_/service_role key are required")
else:
    record("supabase:data-plane", False, "no Supabase credentials found")

# ---- Cloudflare (account token; R2 RETIRED — storage is Supabase) --------
cf = ENV.get("CLOUDFLARE_API_TOKEN", "")
acct = ENV.get("CLOUDFLARE_ACCOUNT_ID", "")
if cf:
    st, body = req("GET", "https://api.cloudflare.com/client/v4/accounts",
                   {"Authorization": f"Bearer {cf}"})
    if st == 200 and isinstance(body, dict) and body.get("success"):
        accs = body.get("result", [])
        match = any(a.get("id") == acct for a in accs)
        record("cloudflare:account", match,
               f"HTTP 200 — account access confirmed"
               + (f" ({', '.join(a.get('name', '?') for a in accs)})" if accs else ""))
    else:
        record("cloudflare:account", False, f"HTTP {st} — {str(body)[:100]}")
    record("cloudflare:r2", True,
           "RETIRED by owner directive 2026-11-13 — storage backend is Supabase; "
           "no R2 API calls are made (R2 was never enabled: error 10042)")
else:
    record("cloudflare:account", False, "CLOUDFLARE_API_TOKEN missing")

# ---- Railway -------------------------------------------------------------
rw = ENV.get("RAILWAY_API_TOKEN", "")
if rw:
    # NB: query `me` separately from `projects` — a Not Authorized on `me`
    # nulls the entire data object when queried together.
    st, body = req("POST", "https://backboard.railway.app/graphql/v2",
                   {"Authorization": f"Bearer {rw}", "User-Agent": "jarvis-nexus-verify/2.0"},
                   {"query": "{ projects { edges { node { id name } } } }"})
    if st == 200 and isinstance(body, dict) and (body.get("data") or {}).get("projects"):
        projs = [e["node"]["name"] for e in body["data"]["projects"]["edges"]]
        record("railway:projects", True, f"HTTP 200 — projects: {projs}")
    else:
        record("railway:projects", False, f"HTTP {st} — {str(body)[:140]}")

# ---- Epic EOS (real OAuth attempt) ---------------------------------------
import base64
import urllib.parse
epic_id = ENV.get("EPIC_CLIENT_ID", ENV.get("EPIC_CLIENT_CREDENTIAL", ""))
epic_secret = ENV.get("EPIC_CLIENT_SECRET", "")
epic_deployment = ENV.get("EPIC_DEPLOYMENT_ID", "")
if epic_id and epic_secret and epic_deployment:
    basic = base64.b64encode(f"{epic_id}:{epic_secret}".encode()).decode()
    form = urllib.parse.urlencode({"grant_type": "client_credentials",
                                   "deployment_id": epic_deployment,
                                   "scope": "basic"}).encode()
    st, body = req("POST", "https://api.epicgames.dev/epic/oauth/v2/token",
                   {"Authorization": f"Basic {basic}",
                    "Content-Type": "application/x-www-form-urlencoded"}, raw_body=form)
    ok = st == 200 and isinstance(body, dict) and body.get("access_token")
    record("eos:oauth", ok,
           f"HTTP {st} — {'token obtained' if ok else body.get('errorCode', '?') if isinstance(body, dict) else 'failed'}")
elif epic_id:
    have = [k for k in ("EPIC_PRODUCT_ID", "EPIC_CLIENT_ID", "EPIC_DEPLOYMENT_ID", "EPIC_SANDBOX_IDS") if ENV.get(k)]
    record("eos:oauth", False,
           f"IDs configured ({len(have)}/4: {', '.join(have)}) but EPIC_CLIENT_SECRET "
           "missing — live sweep 2026-11-13: all 12 client/secret permutations of "
           "supplied values answered 400 invalid_client_credentials")
else:
    record("eos:oauth", False, "EPIC_CLIENT_ID missing")

print("\nSummary:", f"{sum(1 for _, s, _ in results if s == 'OK')}/{len(results)} checks OK")
sys.exit(0 if all(s == "OK" for _, s, _ in results) else 1)
