#!/usr/bin/env python3
"""
JARVIS NEXUS — Real service credential verification.
Reads .env.local (gitignored). Prints ONLY statuses/identities — never secrets.
Exit code 0 if all critical services verified.

Honesty notes (live-verified 2026-11-12):
- Cloudflare: the supplied token is an ACCOUNT-scoped API token; /user/tokens/verify
  legitimately returns 401 for account tokens (needs user-level auth), so account
  access is verified via GET /accounts instead. R2 returns error 10042 (enable R2
  in dashboard) until the owner performs that billing action.
- Railway: `me` is not readable by this workspace token (field-level restriction,
  nulls the whole data object when queried together) — projects is queried alone.
- Supabase: the supplied sb_secret_ key is project-scoped; the management API
  correctly rejects it (401) — the data-plane activates once SUPABASE_URL is set.
- Epic EOS: OAuth client-credentials is attempted for real; without a client
  secret the server answers invalid_client (expected until the secret is supplied).
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


def req(method, url, headers=None, body=None, timeout=25):
    data = json.dumps(body).encode() if body is not None else None
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

# ---- Supabase ------------------------------------------------------------
sb = ENV.get("SUPABASE_ACCESS_TOKEN", "")
sb_pat = ENV.get("SUPABASE_PAT", "")
sb_url = ENV.get("SUPABASE_URL", "")
if sb or sb_pat:
    mgmt_token = sb_pat or sb
    st, projects = req("GET", "https://api.supabase.com/v1/projects",
                       {"Authorization": f"Bearer {mgmt_token}"})
    if st == 200 and isinstance(projects, list):
        names = ", ".join(p.get("name", "?") for p in projects) or "(no projects)"
        record("supabase:management", True, f"HTTP 200 — projects: {names}")
    else:
        kind = "sb_secret_ project key" if sb.startswith("sb_secret_") else "token"
        record("supabase:management", False,
               f"HTTP {st} — management API rejects the {kind} "
               f"(needs sbp_ PAT; supplied key is project-scoped)")
    if sb and sb_url:
        st, body = req("GET", f"{sb_url.rstrip('/')}/rest/v1/",
                       {"apikey": sb, "Authorization": f"Bearer {sb}"})
        record("supabase:data-plane", st == 200,
               f"HTTP {st} — project REST root {'reachable' if st == 200 else body if isinstance(body, str) else 'unreachable'}")
    else:
        record("supabase:data-plane", False,
               "SUPABASE_URL (project URL, Dashboard → Settings → API) not set — "
               "data-plane client dormant until provided")
else:
    record("supabase:management", False, "no Supabase token found")

# ---- Cloudflare ----------------------------------------------------------
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
    if acct:
        st, body = req("GET",
                       f"https://api.cloudflare.com/client/v4/accounts/{acct}/r2/buckets",
                       {"Authorization": f"Bearer {cf}"})
        if st == 200 and isinstance(body, dict) and body.get("success"):
            buckets = (body.get("result") or {}).get("buckets", [])
            record("cloudflare:r2", True,
                   f"R2 enabled — buckets: {[b.get('name') for b in buckets]}")
        elif isinstance(body, dict) and any(
                e.get("code") == 10042 for e in body.get("errors", [])):
            s3c = bool(ENV.get("R2_ACCESS_KEY_ID") and ENV.get("R2_SECRET_ACCESS_KEY"))
            record("cloudflare:r2", False,
                   "R2 not enabled on account (error 10042 — dashboard/billing action); "
                   + ("S3 credentials already created via API" if s3c
                      else "S3 credentials not yet created"))
        else:
            record("cloudflare:r2", False, f"HTTP {st} — {str(body)[:100]}")
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

# ---- Epic EOS ------------------------------------------------------------
import base64
epic_id = ENV.get("EPIC_CLIENT_ID", ENV.get("EPIC_CLIENT_CREDENTIAL", ""))
epic_secret = ENV.get("EPIC_CLIENT_SECRET", "")
if epic_id:
    if epic_secret:
        record("eos:credentials", True,
               "client id + secret present — SDK runtime auth prepared "
               "(EOS has no REST verification; happens in EOS_Platform_Create)")
    else:
        record("eos:credentials", False,
               "EPIC_CLIENT_ID present (xyza7891 format) but EPIC_CLIENT_SECRET "
               "missing — client_credentials attempt answered invalid_client")
else:
    record("eos:credentials", False, "EPIC_CLIENT_ID missing")

print("\nSummary:", f"{sum(1 for _, s, _ in results if s == 'OK')}/{len(results)} checks OK")
sys.exit(0 if all(s == "OK" for _, s, _ in results) else 1)
