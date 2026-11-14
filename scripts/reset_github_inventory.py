#!/usr/bin/env python3
"""
RESET Phase 3: GitHub inventory + verification.
Usage: python3 reset_github_inventory.py pre|post
Reads GITHUB_TOKEN from .env (never printed). Output into
download/reset_20261114/ (04_github_pre.json / 06_github_post.json).
"""
import json
import sys
import time
import urllib.request
import urllib.error

ENV_PATH = "/home/z/my-project/.env"
API = "https://api.github.com"
REPO = "jamesrudh-arch/Jarvis-Nexus"
UA = "nexus-reset/1.0"
OUT_DIR = "/home/z/my-project/download/reset_20261114"


def load_env():
    env = {}
    for line in open(ENV_PATH):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip()
    return env


def api(path, method="GET"):
    tok = load_env().get("GITHUB_TOKEN", "")
    req = urllib.request.Request(
        f"{API}{path}", method=method,
        headers={"Authorization": f"token {tok}", "User-Agent": UA,
                 "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read().decode() or "{}")
            return r.status, body, dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode() or "{}")
        except Exception:
            body = {}
        return e.code, body, dict(e.headers)
    except Exception as e:
        return None, {"exception": str(e)[:200]}, {}


phase = sys.argv[1] if len(sys.argv) > 1 else "pre"
out = {"phase": phase,
       "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
       "repo": REPO}

# --- 1. token check (login + scopes header only) ---
st, user, hdrs = api("/user")
out["token_check"] = {"http": st, "login": (user or {}).get("login"),
                      "scopes": hdrs.get("X-OAuth-Scopes", ""),
                      "note": "token value never read into output"}
print(f"[TOKEN] http={st} login={out['token_check']['login']} "
      f"scopes='{out['token_check']['scopes']}'")

# --- 2. repo identity + permissions ---
st, repo, _ = api(f"/repos/{REPO}")
out["repo"] = {"http": st,
               "full_name": (repo or {}).get("full_name"),
               "private": (repo or {}).get("private"),
               "default_branch": (repo or {}).get("default_branch"),
               "pushed_at": (repo or {}).get("pushed_at"),
               "size_kb": (repo or {}).get("size"),
               "permissions": (repo or {}).get("permissions")}
print(f"[REPO] http={st} default_branch={out['repo']['default_branch']} "
      f"private={out['repo']['private']} pushed_at={out['repo']['pushed_at']}")
print(f"       permissions={out['repo']['permissions']}")

# --- 3. branches ---
st, branches, _ = api(f"/repos/{REPO}/branches?per_page=100")
if isinstance(branches, list):
    out["branches"] = {
        "http": st,
        "names": [b.get("name") for b in branches],
        "head_commits": {b.get("name"): (b.get("commit") or {}).get("sha", "")[:8]
                         for b in branches}}
else:
    out["branches"] = {"http": st, "error": branches}
print(f"[BRANCHES] {json.dumps(out['branches'])}")

# --- 4. tags ---
st, tags, _ = api(f"/repos/{REPO}/tags?per_page=100")
if isinstance(tags, list):
    out["tags"] = {"http": st, "names": [t.get("name") for t in tags]}
else:
    out["tags"] = {"http": st, "error": tags}
print(f"[TAGS] {json.dumps(out['tags'])}")

# --- 5. post-wipe only: main tree contents ---
if phase == "post":
    st, contents, _ = api(f"/repos/{REPO}/contents/?ref=main")
    if isinstance(contents, list):
        out["main_root_tree"] = {"http": st,
                                 "entries": [[c.get("name"), c.get("type")]
                                             for c in contents]}
    else:
        out["main_root_tree"] = {"http": st, "error": contents}
    print(f"[TREE main] {json.dumps(out['main_root_tree'])}")
    st, br, _ = api(f"/repos/{REPO}/branches/main")
    out["main_head"] = {"http": st,
                        "sha": (br.get("commit") or {}).get("sha") if isinstance(br, dict) else None}
    print(f"[main HEAD] {json.dumps(out['main_head'])}")

fn = (f"{OUT_DIR}/04_github_pre.json" if phase == "pre"
      else f"{OUT_DIR}/06_github_post.json")
with open(fn, "w") as f:
    json.dump(out, f, indent=1, default=str)
print(f"[saved] {fn}")
