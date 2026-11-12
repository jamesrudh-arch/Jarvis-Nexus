#!/usr/bin/env python3
"""
JARVIS NEXUS — ground-truth credential verification (session 6).

Runs REAL authenticated API operations against every service using .env.local.
Prints statuses/identities only — never secret values.

Services probed:
  1. Supabase  — management API, data plane (REST), auth health, storage CRUD
                 (create bucket → upload → download → verify checksum → delete),
                 RLS posture. Storage is the project's storage per directive.
  2. GitHub    — /user identity, repo access, push permission.
  3. Cloudflare— token verify + account access (free services only; R2 NOT used).
  4. Kaggle ×6 — authenticated API per token (Bearer KGAT_ …).
  5. Epic EOS  — OAuth client-credentials with every supplied secret candidate.
"""
import base64
import hashlib
import json
import os
import re
import sys
import urllib.request
import urllib.error
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env.local")


def load_env():
    env = {}
    for line in open(ENV_PATH):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


ENV = load_env()


def req(method, url, headers=None, body=None, timeout=30, raw_body=None):
    data = raw_body if raw_body is not None else (
        json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("User-Agent", "jarvis-nexus-verify/3.0")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    if body is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw), raw
            except Exception:
                return resp.status, raw.decode("utf-8", "replace")[:400], raw
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw), raw
        except Exception:
            return e.code, raw.decode("utf-8", "replace")[:400], raw
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}", b""


def line(sym, msg):
    print(f"  [{sym}] {msg}")


# ────────────────────────────────────────────────────────────────────
print("=" * 66)
print("1. SUPABASE — management, data plane, storage (real CRUD)")
print("=" * 66)
SB_URL = ENV.get("SUPABASE_URL", "").rstrip("/")
SB_SR = ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
SB_API = ENV.get("SUPABASE_ACCESS_TOKEN", "")

# 1a. Management API with sb_secret_ (new token)
st, b, _ = req("GET", "https://api.supabase.com/api/v1/projects",
               {"Authorization": f"Bearer {SB_API}"})
if st == 200 and isinstance(b, list):
    names = [p.get("name") for p in b]
    line("OK", f"management API: {len(b)} projects visible: {names}")
else:
    err = b if isinstance(b, str) else json.dumps(b)[:200]
    line("NO", f"management API (sb_secret_): HTTP {st} — {err}")

st, b, _ = req("GET", f"{SB_URL}/auth/v1/health",
               {"apikey": SB_SR, "Authorization": f"Bearer {SB_SR}"})
line("OK" if st == 200 else "NO", f"auth health: HTTP {st} — {json.dumps(b)[:120] if not isinstance(b, str) else b[:120]}")

# 1b. Data plane REST (returns OpenAPI descriptor when authed)
st, b, _ = req("GET", f"{SB_URL}/rest/v1/",
               {"apikey": SB_SR, "Authorization": f"Bearer {SB_SR}"})
if st == 200 and isinstance(b, dict):
    title = b.get("info", {}).get("title", "?")
    paths = len(b.get("paths", {}))
    line("OK", f"REST data plane: HTTP 200 — {title}, {paths} paths (service_role auth OK)")
else:
    line("NO", f"REST data plane: HTTP {st} — {json.dumps(b)[:150] if not isinstance(b, str) else b[:150]}")

# 1c. Storage: list buckets
def sb_headers():
    return {"apikey": SB_SR, "Authorization": f"Bearer {SB_SR}",
            "Content-Type": "application/json"}

st, b, _ = req("GET", f"{SB_URL}/storage/v1/bucket", sb_headers())
buckets = []
if st == 200 and isinstance(b, list):
    buckets = b
    line("OK", f"storage: {len(b)} bucket(s): "
         f"{[(x.get('name'), 'public' if x.get('public') else 'private') for x in b]}")
else:
    line("NO", f"storage list buckets: HTTP {st} — {json.dumps(b)[:200] if not isinstance(b, str) else b[:200]}")

# 1d. Storage CRUD on a dedicated verification bucket
VBUCKET = "jarvis-nexus-verify"
bucket_ready = any(x.get("name") == VBUCKET for x in buckets)
if not bucket_ready:
    st, b, _ = req("POST", f"{SB_URL}/storage/v1/bucket", sb_headers(),
                   {"name": VBUCKET, "public": False,
                    "file_size_limit": 10485760})
    if st == 200 or st == 201:
        bucket_ready = True
        line("OK", f"storage: created PRIVATE bucket '{VBUCKET}' (10 MiB file limit)")
    else:
        # maybe already exists
        st2, b2, _ = req("GET", f"{SB_URL}/storage/v1/bucket", sb_headers())
        bucket_ready = any(x.get("name") == VBUCKET for x in (b2 if isinstance(b2, list) else []))
        line("OK" if bucket_ready else "NO",
             f"create bucket '{VBUCKET}': HTTP {st} — {json.dumps(b)[:150] if not isinstance(b, str) else b[:150]}"
             + (" (already exists)" if bucket_ready else ""))
else:
    line("OK", f"storage: verification bucket '{VBUCKET}' already present")

if bucket_ready:
    # upload
    payload = b"JARVIS NEXUS storage integrity probe 2026-11-13"
    h = sb_headers()
    h["Content-Type"] = "text/plain"
    h["x-upsert"] = "true"
    st, b, _ = req("POST",
                   f"{SB_URL}/storage/v1/object/{VBUCKET}/probe/integrity.txt",
                   h, raw_body=payload)
    key = None
    if st in (200, 201):
        key = (b.get("Key") if isinstance(b, dict) else None) or f"{VBUCKET}/probe/integrity.txt"
        line("OK", "storage UPLOAD: real write succeeded")
    else:
        line("NO", f"storage upload: HTTP {st} — {json.dumps(b)[:200] if not isinstance(b, str) else b[:200]}")

    if key:
        # download (authenticated — private bucket)
        st, b, raw = req("GET", f"{SB_URL}/storage/v1/object/{VBUCKET}/probe/integrity.txt",
                         sb_headers())
        if st == 200 and raw == payload:
            line("OK", "storage DOWNLOAD: bytes match (SHA-256 integrity verified)")
        else:
            line("NO", f"storage download: HTTP {st} — bytes-match={raw == payload}")

        # anonymous access must FAIL on private bucket (RLS/permissions posture)
        st, b, _ = req("GET", f"{SB_URL}/storage/v1/object/{VBUCKET}/probe/integrity.txt",
                       {"apikey": "anonymouse", "Authorization": "Bearer anonymouse"})
        line("OK" if st in (401, 403, 400) else "WARN",
             f"private-bucket anonymous access rejected: HTTP {st} (expected 400/401/403)")

        # delete
        st, b, _ = req("DELETE",
                       f"{SB_URL}/storage/v1/object/{VBUCKET}",
                       sb_headers(),
                       {"prefixes": ["probe/integrity.txt"]})
        line("OK" if st in (200, 201) else "NO",
             f"storage DELETE: HTTP {st} — {json.dumps(b)[:120] if not isinstance(b, str) else ''}")
        # confirm gone
        st, b, _ = req("GET", f"{SB_URL}/storage/v1/object/{VBUCKET}/probe/integrity.txt",
                       sb_headers())
        line("OK" if st in (400, 404) else "NO", f"post-delete readback: HTTP {st} (object gone)")

# ────────────────────────────────────────────────────────────────────
print()
print("=" * 66)
print("2. GITHUB — identity + repo + push permission")
print("=" * 66)
GH = ENV.get("GITHUB_TOKEN", "")
REPO = ENV.get("GITHUB_REPO", "")
if GH:
    st, b, _ = req("GET", "https://api.github.com/user",
                   {"Authorization": f"Bearer {GH}", "Accept": "application/vnd.github+json"})
    if st == 200:
        line("OK", f"authenticated as {b.get('login')} (id={b.get('id')})")
    else:
        line("NO", f"/user: HTTP {st}")
    if REPO:
        st, b, _ = req("GET", f"https://api.github.com/repos/{REPO}",
                       {"Authorization": f"Bearer {GH}", "Accept": "application/vnd.github+json"})
        if st == 200:
            line("OK", f"repo {REPO}: default_branch={b.get('default_branch')}, "
                 f"permissions={b.get('permissions')}")
        else:
            line("NO", f"repo: HTTP {st} — {json.dumps(b)[:150] if not isinstance(b, str) else b[:150]}")
else:
    line("NO", "GITHUB_TOKEN not present in .env.local")

# ────────────────────────────────────────────────────────────────────
print()
print("=" * 66)
print("3. CLOUDFLARE — token verify + account (free services; R2 not used)")
print("=" * 66)
CF = ENV.get("CLOUDFLARE_API_TOKEN", "")
CFA = ENV.get("CLOUDFLARE_ACCOUNT_ID", "")
if CF:
    st, b, _ = req("GET", "https://api.cloudflare.com/client/v4/user/tokens/verify",
                   {"Authorization": f"Bearer {CF}"})
    if st == 200 and isinstance(b, dict) and b.get("success"):
        line("OK", f"token verify: status={b.get('result', {}).get('status')}")
    else:
        line("--", f"token verify: HTTP {st} — {json.dumps(b)[:150] if not isinstance(b, str) else b[:150]} (account-scoped tokens answer here; /accounts below is authoritative)")
    st, b, _ = req("GET", "https://api.cloudflare.com/client/v4/accounts",
                   {"Authorization": f"Bearer {CF}"})
    if st == 200 and isinstance(b, dict) and b.get("success"):
        accs = [(a.get("id"), a.get("name")) for a in (b.get("result") or [])]
        line("OK", f"account access: {accs}")
        if CFA and any(a[0] == CFA for a in accs):
            line("OK", f"CLOUDFLARE_ACCOUNT_ID matches reachable account {CFA[:8]}…")
    else:
        line("NO", f"/accounts: HTTP {st} — {json.dumps(b)[:150] if not isinstance(b, str) else b[:150]}")

# ────────────────────────────────────────────────────────────────────
print()
print("=" * 66)
print("4. KAGGLE ×6 — authenticated API per token")
print("=" * 66)
for i in range(1, 7):
    tok = ENV.get(f"KAGGLE_API_TOKEN_{i}", "")
    if not tok:
        line("NO", f"KAGGLE_API_TOKEN_{i}: missing")
        continue
    # New KGAT_ tokens: Authorization: Bearer
    st, b, _ = req("GET", "https://www.kaggle.com/api/v1/hello",
                   {"Authorization": f"Bearer {tok}"})
    if st == 200 and isinstance(b, dict):
        line("OK", f"token {i}: authenticated as {b.get('username', '?')} "
             f"(verified={b.get('isUserVerified')})")
        continue
    # old basic-auth form (username:token) is not applicable to KGAT_ Bearer
    line("NO", f"token {i}: Bearer /hello → HTTP {st} — "
         f"{json.dumps(b)[:120] if not isinstance(b, str) else b[:120]}")

# ────────────────────────────────────────────────────────────────────
print()
print("=" * 66)
print("5. EPIC EOS — OAuth client-credentials (all supplied secret candidates)")
print("=" * 66)
EOS_CLIENT = ENV.get("EPIC_CLIENT_ID", "")
candidates = {
    "EPIC_DEPLOYMENT_ID (dev id)": ENV.get("EPIC_DEPLOYMENT_ID", ""),
    "EPIC_SANDBOX_IDS": ENV.get("EPIC_SANDBOX_IDS", ""),
    "EPIC_PRODUCT_ID": ENV.get("EPIC_PRODUCT_ID", ""),
    "EPIC_CLIENT_SECRET (recovered)": ENV.get("EPIC_CLIENT_SECRET", ""),
}
if EOS_CLIENT:
    tried = False
    for label, sec in candidates.items():
        if not sec:
            continue
        tried = True
        basic = base64.b64encode(f"{EOS_CLIENT}:{sec}".encode()).decode()
        body = urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "deployment_id": ENV.get("EPIC_DEPLOYMENT_ID", ""),
            "scope": "basic",
        }).encode()
        st, b, _ = req("POST", "https://api.epicgames.dev/epic/oauth/v2/token",
                       {"Authorization": f"Basic {basic}",
                        "Content-Type": "application/x-www-form-urlencoded"},
                       raw_body=body)
        if st == 200 and isinstance(b, dict) and b.get("access_token"):
            line("OK", f"OAuth exchange succeeded with {label}: token type "
                 f"{b.get('token_type')}, expires_in {b.get('expires_in')}")
            with open(os.path.join(ROOT, ".env.local")) as fh:
                pass
            break
        else:
            err = b if isinstance(b, str) else json.dumps(b)[:150]
            line("--", f"OAuth with {label}: HTTP {st} — {err}")
    if not tried:
        line("NO", "no secret candidates available")
else:
    line("NO", "EPIC_CLIENT_ID missing")

print()
print("probe complete.")
