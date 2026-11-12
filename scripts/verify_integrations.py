#!/usr/bin/env python3
"""
JARVIS NEXUS — Real service credential verification.
Reads .env.local (gitignored). Prints ONLY statuses/identities — never secrets.
Exit code 0 if all critical services verified.
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


def req(method, url, headers=None, body=None, timeout=20):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("User-Agent", "jarvis-nexus-verify/1.0")
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
    for repo in ("Jarvis-Nexus", "Jarvis"):
        st, r = req("GET", f"https://api.github.com/repos/jamesrudh-arch/{repo}",
                    {"Authorization": f"Bearer {gh}", "Accept": "application/vnd.github+json"})
        if st == 200 and isinstance(r, dict):
            perm = r.get("permissions", {})
            record(f"github:repo:{repo}", bool(perm.get("push")),
                   f"default_branch={r.get('default_branch')} push={perm.get('push')} "
                   f"size={r.get('size_kb', r.get('size'))}KB")
        else:
            record(f"github:repo:{repo}", False, f"HTTP {st} — {str(r)[:120]}")
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
    if st == 404:  # endpoint absent on this API version — fall back to authenticated list
        st, hello = req("GET", "https://www.kaggle.com/api/v1/datasets/list?mine=true", hdr)
    if st == 200:
        kaggle_ok += 1
        record(f"kaggle:account-{i}", True, f"HTTP 200 — token valid ({str(hello)[:60]})")
    else:
        record(f"kaggle:account-{i}", False, f"HTTP {st} — {str(hello)[:80]}")

# ---- Supabase ------------------------------------------------------------
sb = ENV.get("SUPABASE_ACCESS_TOKEN", "")
if sb:
    st, projects = req("GET", "https://api.supabase.com/api/v1/projects", {"Authorization": f"Bearer {sb}"})
    projects = None
    for base in ("https://api.supabase.com/api/v1", "https://api.supabase.com/v1"):
        st, projects = req("GET", f"{base}/projects", {"Authorization": f"Bearer {sb}"})
        if st == 200 and isinstance(projects, list):
            break
    if st == 200 and isinstance(projects, list):
        names = ", ".join(p.get("name", "?") for p in projects) or "(no projects)"
        record("supabase:management", True, f"HTTP 200 — projects: {names}")
    else:
        record("supabase:management", False, f"HTTP {st} — not a project list: {str(projects)[:100]}")
else:
    record("supabase:management", False, "token missing")

# ---- Cloudflare ----------------------------------------------------------
cf = ENV.get("CLOUDFLARE_API_TOKEN", "")
if cf:
    st, body = req("GET", "https://api.cloudflare.com/client/v4/user/tokens/verify",
                   {"Authorization": f"Bearer {cf}"})
    active = (isinstance(body, dict) and body.get("success")
              and (body.get("result") or {}).get("status") == "active")
    detail = (body.get("result") or {}).get("status") if isinstance(body, dict) else str(body)[:80]
    record("cloudflare:token", st == 200 and bool(active), f"HTTP {st} — {detail}")
    st, body = req("GET", "https://api.cloudflare.com/client/v4/accounts", {"Authorization": f"Bearer {cf}"})
    if st == 200 and isinstance(body, dict):
        accs = [a.get("name", "?") for a in body.get("result", [])]
        want = ENV.get("CLOUDFLARE_ACCOUNT_ID", "")
        match = any(a == want or True for a in accs) and any(
            a.get("id") == want for a in body.get("result", []))
        record("cloudflare:account", match, f"HTTP {st} — accounts: {', '.join(accs)}")
    else:
        record("cloudflare:account", False, f"HTTP {st} — {str(body)[:100]}")
else:
    record("cloudflare:token", False, "token missing")

# ---- Railway -------------------------------------------------------------
rw = ENV.get("RAILWAY_API_TOKEN", "")
if rw:
    st, body = req("POST", "https://backboard.railway.app/graphql/v2",
                   {"Authorization": f"Bearer {rw}"},
                   {"query": "{ me { id name email } projects { edges { node { id name } } } }"})
    if st == 200 and isinstance(body, dict) and body.get("data"):
        me = body["data"].get("me") or {}
        projs = [e["node"]["name"] for e in (body["data"].get("projects") or {}).get("edges", [])]
        record("railway:token", True,
               f"HTTP 200 — user={me.get('name')} projects={projs}")
    else:
        record("railway:token", False, f"HTTP {st} — {str(body)[:140]}")
else:
    record("railway:token", False, "token missing")

print("\nSummary:", f"{sum(1 for _, s, _ in results if s == 'OK')}/{len(results)} checks OK")
sys.exit(0 if all(s == "OK" for _, s, _ in results) else 1)
