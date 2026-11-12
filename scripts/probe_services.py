#!/usr/bin/env python3
"""
JARVIS NEXUS — Deep service probes (Stage 1).
Goal: establish, with REAL API evidence, exactly what each supplied credential
can do. Prints statuses, HTTP codes, permission/scope names and error codes —
NEVER secret values.

Stage 1 covers: Cloudflare (token verify raw, accounts, R2 enablement,
permission groups, token-creation capability), Railway (field-by-field GraphQL,
real well-formed mutation), Supabase (token classification, header variants,
management API), Epic EOS (credential classification, OAuth attempts).
"""
import base64
import hashlib
import json
import os
import re
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
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


ENV = load_env()


def req(method, url, headers=None, body=None, timeout=25, form_body=None):
    data = None
    if form_body is not None:
        data = urllib.parse.urlencode(form_body).encode()
    elif body is not None:
        data = json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("User-Agent", "jarvis-nexus-probe/1.0")
    if body is not None:
        r.add_header("Content-Type", "application/json")
    if form_body is not None:
        r.add_header("Content-Type", "application/x-www-form-urlencoded")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, dict(resp.headers), json.loads(raw)
            except Exception:
                return resp.status, dict(resp.headers), raw.decode("utf-8", "replace")[:600]
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, dict(e.headers), json.loads(raw)
        except Exception:
            return e.code, dict(e.headers), raw.decode("utf-8", "replace")[:600]
    except Exception as e:
        return 0, {}, f"{type(e).__name__}: {e}"


def section(name):
    print(f"\n{'='*72}\n  {name}\n{'='*72}")


def safe_json(x, limit=400):
    s = json.dumps(x, ensure_ascii=False) if not isinstance(x, str) else x
    return s[:limit]


# =========================================================================
section("CLOUDFLARE — token verify (raw) + account + R2 enablement")
# =========================================================================
cf = ENV.get("CLOUDFLARE_API_TOKEN", "")
acct = ENV.get("CLOUDFLARE_ACCOUNT_ID", "")
if not cf or not acct:
    print("Cloudflare credentials missing")
else:
    st, hdrs, body = req("GET", "https://api.cloudflare.com/client/v4/user/tokens/verify",
                         {"Authorization": f"Bearer {cf}"})
    print(f"[verify] HTTP {st} — {safe_json(body)}")

    st, hdrs, body = req("GET", "https://api.cloudflare.com/client/v4/accounts",
                         {"Authorization": f"Bearer {cf}"})
    accounts = []
    if st == 200 and isinstance(body, dict) and body.get("success"):
        accounts = body.get("result", [])
        for a in accounts:
            print(f"[accounts] id={a.get('id')} name={a.get('name')!r} "
                  f"matches_supplied={a.get('id') == acct}")
    else:
        print(f"[accounts] HTTP {st} — {safe_json(body)}")

    # R2 enablement check (management REST)
    st, hdrs, body = req("GET",
                         f"https://api.cloudflare.com/client/v4/accounts/{acct}/r2/buckets",
                         {"Authorization": f"Bearer {cf}"})
    if st == 200 and isinstance(body, dict) and body.get("success"):
        buckets = (body.get("result") or {}).get("buckets", [])
        print(f"[r2:buckets] R2 ENABLED — buckets: "
              f"{[b.get('name') for b in buckets]}")
    else:
        codes = [e.get("code") for e in (body.get("errors", []) if isinstance(body, dict) else [])]
        msgs = [e.get("message") for e in (body.get("errors", []) if isinstance(body, dict) else [])]
        print(f"[r2:buckets] HTTP {st} codes={codes} msgs={msgs}")

    # Permission groups (needed to mint an R2-scoped token via API)
    st, hdrs, body = req("GET",
                         "https://api.cloudflare.com/client/v4/user/tokens/permission_groups",
                         {"Authorization": f"Bearer {cf}"})
    if st == 200 and isinstance(body, dict) and body.get("success"):
        groups = body.get("result", [])
        r2_groups = [g for g in groups if "r2" in json.dumps(g).lower()]
        for g in r2_groups:
            print(f"[perm-groups] {g.get('name')} id={g.get('id')}")
        if not r2_groups:
            print("[perm-groups] token CAN list permission groups "
                  f"({len(groups)} total) but none are R2 — token lacks R2 scope?")
    else:
        print(f"[perm-groups] HTTP {st} — {safe_json(body, 300)}")

    # Can this token see existing API tokens? (proxy for token-management scope)
    st, hdrs, body = req("GET", "https://api.cloudflare.com/client/v4/user/tokens",
                         {"Authorization": f"Bearer {cf}"})
    if st == 200 and isinstance(body, dict) and body.get("success"):
        toks = body.get("result", []) or []
        print(f"[tokens:list] CAN list user tokens ({len(toks)} exist) — "
              "token has User>API Tokens>Read at minimum")
    else:
        codes = [e.get("code") for e in (body.get("errors", []) if isinstance(body, dict) else [])]
        print(f"[tokens:list] HTTP {st} codes={codes} — cannot list tokens")

# =========================================================================
section("RAILWAY — field-by-field GraphQL probes")
# =========================================================================
rw = ENV.get("RAILWAY_API_TOKEN", "")
GQL = "https://backboard.railway.app/graphql/v2"
if rw:
    def gql(query, variables=None):
        st, hdrs, body = req("POST", GQL,
                             {"Authorization": f"Bearer {rw}",
                              "Accept": "application/json"},
                             {"query": query, "variables": variables or {}})
        return st, body

    st, body = gql("{ projects { edges { node { id name } } } }")
    print(f"[projects] HTTP {st} — {safe_json(body)}")

    st, body = gql("{ me { id name email } }")
    print(f"[me] HTTP {st} — {safe_json(body)}")

    # A real, well-formed mutation probe (empty-string input, so even if
    # authorized it is a no-op validation error, NOT a destructive change).
    st, body = gql('mutation($name: String!) { projectCreate(name: $name) { id } }',
                   {"name": ""})
    print(f"[mutation:projectCreate] HTTP {st} — {safe_json(body)}")

    st, body = gql('mutation { variableCollectionUpdate {} }')
    print(f"[mutation:probe(formed)] HTTP {st} — {safe_json(body)}")

    # Introspection of the auth surface
    st, body = gql("{ __schema { queryType { name } mutationType { name } } }")
    print(f"[introspection] HTTP {st} — {safe_json(body, 200)}")

# =========================================================================
section("SUPABASE — token classification + header variants")
# =========================================================================
sb = ENV.get("SUPABASE_ACCESS_TOKEN", "")
if sb:
    # Classification (never print the token)
    kind = "unknown"
    if sb.startswith("sbp_"):
        kind = "sbp_ personal access token (management API capable)"
    elif sb.startswith("sb_secret_"):
        kind = "sb_secret_ project secret key (data-plane apikey)"
    elif sb.startswith("sb_publishable_"):
        kind = "sb_publishable_ project public key"
    elif sb.startswith("eyJ"):
        kind = "JWT (legacy anon/service_role key)"
    else:
        kind = f"unrecognised (prefix {sb[:3]}***, len {len(sb)})"
    print(f"[classify] {kind}")

    # Variant A: Authorization Bearer (known result: 401)
    st, hdrs, body = req("GET", "https://api.supabase.com/api/v1/projects",
                         {"Authorization": f"Bearer {sb}"})
    print(f"[mgmt:Bearer] HTTP {st} — {safe_json(body, 160)}")

    # Variant B: apikey header
    st, hdrs, body = req("GET", "https://api.supabase.com/api/v1/projects",
                         {"apikey": sb, "Authorization": f"Bearer {sb}"})
    print(f"[mgmt:apikey] HTTP {st} — {safe_json(body, 160)}")

    # Variant C: new platform API path
    st, hdrs, body = req("GET", "https://api.supabase.com/v1/projects",
                         {"apikey": sb, "Authorization": f"Bearer {sb}"})
    print(f"[mgmt:v1-path] HTTP {st} — {safe_json(body, 160)}")

    # Variant D: whoami endpoints (some Supabase keys answer here)
    st, hdrs, body = req("GET", "https://api.supabase.com/api/v1/user",
                         {"Authorization": f"Bearer {sb}"})
    print(f"[mgmt:user] HTTP {st} — {safe_json(body, 160)}")

# =========================================================================
section("EPIC EOS — credential classification + real OAuth attempts")
# =========================================================================
epic = ENV.get("EPIC_CLIENT_CREDENTIAL", "")
if epic:
    if epic.startswith("xyza7891"):
        print(f"[classify] Epic CLIENT ID format (xyza7891…, len {len(epic)})")
    else:
        print(f"[classify] NOT xyza7891-format (prefix {epic[:3]}***, len {len(epic)}) — "
              "possibly a client secret or other credential")

    OAUTH = "https://api.epicgames.dev/epic/oauth/v2/token"

    def eos_attempt(label, client_id, client_secret):
        basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        st, hdrs, body = req("POST", OAUTH,
                             {"Authorization": f"Basic {basic}"},
                             form_body={
                                 "grant_type": "client_credentials",
                                 "deployment_id": "00000000000000000000000000000000",
                             })
        # Only print non-sensitive parts of the response
        if isinstance(body, dict):
            keep = {k: body.get(k) for k in
                    ("error", "error_description", "errorCode", "errorMessage",
                     "access_token", "token_type", "expires_in", "scope") if k in body}
            if "access_token" in keep:
                keep["access_token"] = f"<PRESENT len={len(keep['access_token'])}>"
            print(f"[{label}] HTTP {st} — {safe_json(keep, 300)}")
        else:
            print(f"[{label}] HTTP {st} — {safe_json(body, 300)}")

    # Attempt 1: credential used as client ID with itself as secret
    eos_attempt("client_credentials id-as-id+secret", epic, epic)
    # Attempt 2: credential as client ID, empty secret
    eos_attempt("client_credentials id-as-id+empty-secret", epic, "")
    # Attempt 3: credential as secret with a clearly-invalid id (control)
    eos_attempt("control: bogus-id", "bogus", epic)

    # Attempt 4: authorize endpoint — reveals whether the client_id is a
    # registered EOS client (redirects to login page vs. error)
    try:
        r = urllib.request.Request(
            "https://api.epicgames.dev/epic/oauth/v2/authorize"
            "?client_id=" + urllib.parse.quote(epic)
            + "&response_type=code&redirect_uri=https%3A%2F%2Flocalhost%2Fcb"
            + "&scope=basic_profile",
            method="GET")
        r.add_header("User-Agent", "jarvis-nexus-probe/1.0")
        with urllib.request.urlopen(r, timeout=20) as resp:
            print(f"[authorize] HTTP {resp.status} — client_id accepted by authorize endpoint")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")[:200]
        print(f"[authorize] HTTP {e.code} — {raw!r}")
    except Exception as e:
        print(f"[authorize] {type(e).__name__}: {e}")

print("\nStage-1 probes complete.")
