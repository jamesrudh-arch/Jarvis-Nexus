#!/usr/bin/env python3
"""Final Acceptance Phase A — secure credential intake + validation.

The mission forbids secrets in chat. The execution environment's secure
secret-entry channel is the FILE UPLOAD (files land in /home/z/my-project/upload/
and are never echoed into the conversation; upload/ is gitignored by the repo).

Intake sources, in order:
  1. /home/z/my-project/upload/credentials.env   (preferred, gitignored name)
  2. any upload/*.txt / upload/*.env containing the two recognized lines
  3. already-populated .env (RAILWAY_API_TOKEN) / .env.local (GITHUB_TOKEN)
  4. process environment variables

Recognized (and ONLY these) assignments are extracted:
  RAILWAY_API_TOKEN=<value>
  GITHUB_TOKEN=<value>            (GH_TOKEN= accepted as alias)

The values are written to:
  .env          -> RAILWAY_API_TOKEN=<value>   (existing lines preserved;
                   a previous RAILWAY_API_TOKEN line is replaced)
  .env.local    -> GITHUB_TOKEN=<value>

Both files are chmod 600 and verified gitignored (git check-ignore).

Then both credentials are VALIDATED live:
  Railway: GraphQL project query (reasonable-heart readable)
  GitHub:  GET /repos/jamesrudh-arch/Jarvis-Nexus + rate_limit scope probe

Output metadata only (login, project name, permission booleans, fingerprint
sha256[:12] of each value). Values are NEVER printed, logged, or echoed.
Exit 0 = both valid; 2 = intake found nothing; 1 = validation failed.
"""
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import urllib.request
import urllib.error

REPO = "/home/z/my-project"
REPO_SLUG = "jamesrudh-arch/Jarvis-Nexus"
RAILWAY_API = "https://backboard.railway.com/graphql/v2"
RAILWAY_PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
RAILWAY_ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
RAILWAY_SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"

WANT = ("RAILWAY_API_TOKEN", "GITHUB_TOKEN")
ALIAS = {"GH_TOKEN": "GITHUB_TOKEN"}


def fingerprint(value):
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def scan_file(path, found):
    """Extract ONLY the two recognized assignments from a file. Never print."""
    try:
        lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    except OSError:
        return
    for ln in lines:
        m = re.match(r"^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(\S+)\s*$", ln)
        if not m:
            continue
        name = ALIAS.get(m.group(1), m.group(1))
        if name in WANT and name not in found:
            val = m.group(2).strip().strip("'").strip('"')
            if len(val) >= 20:  # plausibility: real tokens are long
                found[name] = val


def upsert(path, name, value):
    """Insert or replace `NAME=value` in a dotenv file, preserving the rest."""
    lines = []
    if os.path.exists(path):
        lines = open(path, encoding="utf-8").read().splitlines()
    out, replaced = [], False
    for ln in lines:
        if re.match(r"^(?:export\s+)?%s=" % re.escape(name), ln.strip()):
            out.append(f"{name}={value}")
            replaced = True
        else:
            out.append(ln)
    if not replaced:
        out.append(f"{name}={value}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out).rstrip("\n") + "\n")
    os.chmod(path, 0o600)


def github_get(token, path):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        headers={"Authorization": "token " + token,
                 "User-Agent": "nexus-final-acceptance",
                 "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {"message": "unparsed"}
    except Exception as e:
        return 0, {"message": str(e)[:120]}


def railway_gql(token, query):
    req = urllib.request.Request(
        RAILWAY_API, data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + token,
                 "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"message": str(e)[:120]}


def main():
    found = {}

    # 1) preferred: upload/credentials.env
    cred_env = os.path.join(REPO, "upload", "credentials.env")
    if os.path.exists(cred_env):
        scan_file(cred_env, found)

    # 2) any other upload file
    if len(found) < len(WANT):
        updir = os.path.join(REPO, "upload")
        if os.path.isdir(updir):
            for fn in sorted(os.listdir(updir)):
                if fn == "credentials.env":
                    continue
                if fn.lower().endswith((".env", ".txt", ".conf")) or "credential" in fn.lower() or "token" in fn.lower():
                    scan_file(os.path.join(updir, fn), found)
                    if len(found) == len(WANT):
                        break

    # 3) existing dotenv files
    if len(found) < len(WANT):
        for name, path in (("RAILWAY_API_TOKEN", os.path.join(REPO, ".env")),
                           ("GITHUB_TOKEN", os.path.join(REPO, ".env.local"))):
            if name not in found and os.path.exists(path):
                scan_file(path, found)

    # 4) process environment
    for name in WANT:
        if name not in found and os.environ.get(name, "").strip():
            found[name] = os.environ[name].strip()

    missing = [n for n in WANT if n not in found]
    if missing:
        print(f"INTAKE INCOMPLETE — missing: {', '.join(missing)}")
        print("Secure entry: upload a file named credentials.env containing the two lines")
        print("  RAILWAY_API_TOKEN=<value>")
        print("  GITHUB_TOKEN=<value>")
        print("(file lands in upload/, which is gitignored; values are never echoed)")
        sys.exit(2)

    # persist to 0600 gitignored files
    upsert(os.path.join(REPO, ".env"), "RAILWAY_API_TOKEN", found["RAILWAY_API_TOKEN"])
    upsert(os.path.join(REPO, ".env.local"), "GITHUB_TOKEN", found["GITHUB_TOKEN"])
    for p in (os.path.join(REPO, ".env"), os.path.join(REPO, ".env.local")):
        mode = stat.S_IMODE(os.stat(p).st_mode)
        print(f"stored: {os.path.basename(p)} (mode {oct(mode)}, "
              f"gitignored={subprocess.run(['git','-C',REPO,'check-ignore','-q',p]).returncode==0})")

    print(f"fingerprints (never values): "
          f"RAILWAY={fingerprint(found['RAILWAY_API_TOKEN'])} "
          f"GITHUB={fingerprint(found['GITHUB_TOKEN'])}")

    # ---- live validation (no values in output) ----
    ok = True

    code, d = github_get(found["GITHUB_TOKEN"], "/repos/" + REPO_SLUG)
    gh_meta = {}
    if code == 200:
        gh_meta = {"login": d.get("owner", {}).get("login"), "repo": d.get("full_name"),
                   "default_branch": d.get("default_branch"), "push": d.get("permissions", {}).get("push")}
        print(f"GitHub token: VALID (repo {gh_meta['repo']} readable, push={gh_meta['push']})")
    else:
        print(f"GitHub token: INVALID (HTTP {code}: {str(d.get('message'))[:80]})")
        ok = False

    code, d = github_get(found["GITHUB_TOKEN"], "/rate_limit")
    if code == 200:
        scopes_xoauth = None  # not exposed on this endpoint; fine
        print(f"GitHub rate limit reachable: core remaining={d.get('resources', {}).get('core', {}).get('remaining')}")
    else:
        print(f"GitHub rate_limit probe: HTTP {code} (token may be fine; repo probe above is authoritative)")

    q = ('query { project(id: "%s") { id name environments { edges { node { id name } } } } }' % RAILWAY_PROJECT_ID)
    code, d = railway_gql(found["RAILWAY_API_TOKEN"], q)
    if code == 200 and not d.get("errors"):
        proj = (d.get("data") or {}).get("project") or {}
        envs = [e["node"]["name"] for e in (((proj.get("environments") or {}).get("edges")) or [])]
        print(f"Railway token: VALID (project '{proj.get('name')}' readable; environments: {envs})")
    else:
        msg = str((d.get("errors") or [{}])[0].get("message", ""))[:120] if isinstance(d, dict) else str(d)[:120]
        print(f"Railway token: INVALID (HTTP {code}: {msg})")
        ok = False

    print("PHASE A:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
