#!/usr/bin/env python3
"""Stage 2.4B Final Execution — Phase 0 credential validation.

Reads GITHUB_TOKEN from /home/z/my-project/.env.local and RAILWAY_API_TOKEN
from /home/z/my-project/.env (same loader conventions as the execution
scripts). Credential VALUES are never printed, logged, or written anywhere —
only VALID/INVALID outcomes plus non-secret metadata (login name, permission
booleans, project names, deployment ids, SHAs).

Exit 0 = both credentials valid and repo/project reachable; 1 otherwise.
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error

REPO_SLUG = "jamesrudh-arch/Jarvis-Nexus"
EXPECTED_ORIGIN_BASE = "6a788348a6aa7f59558e41143b3b786858548aff"
RAILWAY_API = "https://backboard.railway.com/graphql/v2"
RAILWAY_PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
RAILWAY_ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
RAILWAY_SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"


def load_env_var(path, name):
    if not os.path.exists(path):
        return None
    for ln in open(path):
        m = re.match(r"^(?:export\s+)?%s=(.+)$" % re.escape(name), ln.strip())
        if m:
            return m.group(1).strip().strip("'").strip('"')
    return None


def github_get(token, path):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        headers={"Authorization": "token " + token,
                 "User-Agent": "nexus-stage24b-phase0",
                 "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode()), dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"message": "unparsed error body"}
        return e.code, body, dict(e.headers)
    except Exception as e:
        return 0, {"message": str(e)[:120]}, {}


def railway_gql(token, query):
    payload = json.dumps({"query": query}).encode()
    req = urllib.request.Request(
        RAILWAY_API, data=payload,
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + token,
                 "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {"errors": [{"message": "HTTP %s" % e.code}]}
    except Exception as e:
        return 0, {"errors": [{"message": str(e)[:120]}]}


def main():
    ok = True
    print("=== Phase 0: credential validation (values never printed) ===")

    # ---------------- GitHub ----------------
    gh = load_env_var("/home/z/my-project/.env.local", "GITHUB_TOKEN")
    if not gh:
        print("[FAIL] GITHUB_TOKEN not found in .env.local")
        ok = False
    else:
        code, body, hdrs = github_get(gh, "/user")
        if code == 200 and body.get("login"):
            print("[OK] GitHub token VALID — authenticated as: %s" % body.get("login"))
        else:
            print("[FAIL] GitHub token invalid: HTTP %s %s"
                  % (code, str(body.get("message", ""))[:100]))
            ok = False

        code, body, hdrs = github_get(gh, "/repos/%s" % REPO_SLUG)
        if code == 200:
            perms = body.get("permissions") or {}
            push_ok = bool(perms.get("push") or perms.get("maintain")
                           or perms.get("admin"))
            print("[OK] repo access: %s (private=%s, default=%s)"
                  % (REPO_SLUG, body.get("private"), body.get("default_branch")))
            print("[%s] push permission on repo: %s"
                  % ("OK" if push_ok else "FAIL", push_ok))
            if not push_ok:
                ok = False
            scopes = hdrs.get("X-OAuth-Scopes", "") or ""
            print("[INFO] token scopes: %s"
                  % (scopes if scopes else "(none reported — fine-grained token)"))
            if scopes and ("contents" not in scopes and "repo" not in scopes):
                print("[FAIL] token lacks contents/repo scope — cannot push")
                ok = False
        else:
            print("[FAIL] cannot access repo: HTTP %s %s"
                  % (code, str(body.get("message", ""))[:100]))
            ok = False

        # gate G3 pre-check: origin/main must still sit at the approved base
        code, body, _ = github_get(gh, "/repos/%s/git/ref/heads/main" % REPO_SLUG)
        if code == 200:
            sha = (body.get("object") or {}).get("sha")
            match = (sha == EXPECTED_ORIGIN_BASE)
            print("[%s] origin/main = %s (%s)"
                  % ("OK" if match else "FAIL", sha,
                     "matches approved base 6a788348" if match
                     else "DRIFTED from approved base — reconcile before push"))
            if not match:
                ok = False
        else:
            print("[FAIL] cannot read origin/main ref: HTTP %s" % code)
            ok = False

    # ---------------- Railway ----------------
    rw = load_env_var("/home/z/my-project/.env", "RAILWAY_API_TOKEN")
    if not rw:
        print("[FAIL] RAILWAY_API_TOKEN not found in .env")
        ok = False
    else:
        # NOTE: workspace-scoped tokens (rlwy_wksp_*) do not support the user-
        # level `me` query — that is expected, not a failure. The execution
        # scripts use project/serviceInstance/variables queries only.
        code, d = railway_gql(rw, "query { me { id name } }")
        me = ((d.get("data") or {}).get("me")) or None
        if code == 200 and me:
            print("[OK] Railway token VALID — workspace: %s" % me.get("name"))
        else:
            print("[INFO] `me` query not authorized (expected for "
                  "workspace-scoped rlwy_wksp_* tokens; not used by any "
                  "execution script) — validating via project-level access")

        code, d = railway_gql(
            rw,
            'query { project(id: "%s") { name id } }' % RAILWAY_PROJECT_ID)
        proj = ((d.get("data") or {}).get("project") or {})
        if code == 200 and proj.get("name"):
            print("[OK] project readable: %s (%s)" % (proj.get("name"),
                                                      proj.get("id")))
        else:
            print("[FAIL] project query failed: HTTP %s %s"
                  % (code, json.dumps(d)[:140]))
            ok = False

        # volume instances on the production service (Phase 1 step 2 uses this)
        code, d = railway_gql(
            rw,
            'query { project(id: "%s") { environments { edges { node { '
            'id name volumeInstances { edges { node { id mountPath '
            'serviceId state region } } } } } } } }' % RAILWAY_PROJECT_ID)
        envs = ((((d.get("data") or {}).get("project") or {})
                 .get("environments") or {}).get("edges")) or []
        vols = []
        env_name = None
        for e in envs:
            node = e.get("node") or {}
            if node.get("id") != RAILWAY_ENV_ID:
                continue
            env_name = node.get("name")
            for ve in ((node.get("volumeInstances") or {}).get("edges") or []):
                v = ve.get("node") or {}
                if v.get("serviceId") == RAILWAY_SERVICE_ID:
                    vols.append(v)
        if code == 200 and env_name:
            print("[OK] environment readable: %s — %d volume instance(s) on "
                  "Jarvis-Nexus: %s"
                  % (env_name, len(vols),
                     ", ".join("%s (%s)" % (v.get("mountPath"), v.get("state"))
                               for v in vols) or "none"))
        else:
            print("[FAIL] volumeInstances query failed: HTTP %s %s"
                  % (code, json.dumps(d)[:160]))
            ok = False

        # service variables readable (Phase 4 OWNER_KEY retrieval depends on it)
        code, d = railway_gql(
            rw,
            'query { variables(projectId: "%s", environmentId: "%s", '
            'serviceId: "%s") }'
            % (RAILWAY_PROJECT_ID, RAILWAY_ENV_ID, RAILWAY_SERVICE_ID))
        raw = ((d.get("data") or {}).get("variables"))
        var_names = []
        if code == 200 and raw is not None:
            try:
                parsed = json.loads(raw) if isinstance(raw, str) else (raw or [])
                var_names = [v.get("name") for v in parsed
                             if isinstance(v, dict)] if isinstance(parsed, list) else []
            except Exception:
                parsed = []
            # redact values; report only names and presence booleans
            has_owner = "OWNER_KEY" in var_names
            has_offdir = "NEXUS_BACKUP_OFFSITE_DIR" in var_names
            has_key = "NEXUS_BACKUP_ENCRYPTION_KEY" in var_names
            print("[OK] service variables readable (%d defined) — OWNER_KEY: "
                  "%s, NEXUS_BACKUP_OFFSITE_DIR: %s, "
                  "NEXUS_BACKUP_ENCRYPTION_KEY: %s"
                  % (len(var_names),
                     "present" if has_owner else "absent",
                     "present" if has_offdir else "absent (Phase 1 sets it)",
                     "present" if has_key else "absent (Phase 1 sets it)"))
        else:
            print("[FAIL] variables query failed: HTTP %s %s"
                  % (code, json.dumps(d)[:160]))
            ok = False

        # production service state (read-only)
        code, d = railway_gql(
            rw,
            'query { serviceInstance(environmentId: "%s", serviceId: "%s") '
            '{ latestDeployment { id status createdAt meta } } }'
            % (RAILWAY_ENV_ID, RAILWAY_SERVICE_ID))
        dep = ((((d.get("data") or {}).get("serviceInstance") or {})
                .get("latestDeployment")) or {})
        if code == 200 and dep.get("id"):
            print("[OK] production latestDeployment: %s status=%s createdAt=%s"
                  % (dep.get("id"), dep.get("status"), dep.get("createdAt")))
        else:
            print("[FAIL] serviceInstance query failed: HTTP %s %s"
                  % (code, json.dumps(d)[:160]))
            ok = False

    print("=== Phase 0 result: %s ==="
          % ("ALL CREDENTIALS VALID — proceed to Phase 1"
             if ok else "FAILURE(S) PRESENT — stop at this boundary"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
