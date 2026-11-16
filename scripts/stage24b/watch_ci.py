#!/usr/bin/env python3
"""Stage 2.4B Final Execution — Phase 2 CI watcher.

Polls the GitHub Actions API for the CI run on the pushed SHA until all three
mandatory jobs (verify, production-build, visual-app-build) reach a terminal
state. Prints run id, URL, per-job conclusions and step-level detail for the
advisory scanner. Writes the evidence record to
docs/stage2.4b/evidence/production-acceptance/ci-qualification-run.json
(secrets never included — the token is read from .env.local, never printed).

Usage:
  python3 scripts/stage24b/watch_ci.py <full-40-hex-sha> [--wait]
  --wait: poll until completion (up to 30 min). Without it: single snapshot.
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

REPO_API = "https://api.github.com/repos/jamesrudh-arch/Jarvis-Nexus"
MANDATORY_JOBS = ("verify", "production-build", "visual-app-build")
OUT_PATH = ("/home/z/my-project/docs/stage2.4b/evidence/"
            "production-acceptance/ci-qualification-run.json")


def load_token():
    p = "/home/z/my-project/.env.local"
    if os.path.exists(p):
        for ln in open(p):
            m = re.match(r"^(?:export\s+)?GITHUB_TOKEN=(.+)$", ln.strip())
            if m:
                return m.group(1).strip().strip("'").strip('"')
    return os.environ.get("GITHUB_TOKEN")


def api(token, path):
    req = urllib.request.Request(
        REPO_API + path,
        headers={"Authorization": "token " + token,
                 "User-Agent": "nexus-stage24b-ci-watch",
                 "Accept": "application/vnd.github+json"})
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


def snapshot(token, sha):
    code, runs = api(token, "/actions/runs?head_sha=%s&per_page=20" % sha)
    if code != 200:
        return None, "runs query HTTP %s: %s" % (code, runs.get("message"))
    wf_runs = runs.get("workflow_runs") or []
    ci_runs = [r for r in wf_runs if (r.get("name") or "") == "CI"]
    if not ci_runs:
        return None, "no CI workflow run found for %s (found: %s)" % (
            sha[:12], [r.get("name") for r in wf_runs] or "none")
    run = ci_runs[0]
    jobs_out = []
    code, jr = api(token, "/actions/runs/%d/jobs?per_page=50" % run["id"])
    if code == 200:
        for j in jr.get("jobs") or []:
            steps = [{"name": s.get("name"), "status": s.get("status"),
                      "conclusion": s.get("conclusion")}
                     for s in (j.get("steps") or [])]
            jobs_out.append({"name": j.get("name"), "status": j.get("status"),
                             "conclusion": j.get("conclusion"),
                             "started_at": j.get("started_at"),
                             "completed_at": j.get("completed_at"),
                             "html_url": j.get("html_url"), "steps": steps})
    return {"run": {"id": run["id"], "status": run["status"],
                    "conclusion": run["conclusion"],
                    "html_url": run["html_url"],
                    "head_sha": run["head_sha"],
                    "event": run.get("event"),
                    "created_at": run.get("created_at"),
                    "updated_at": run.get("updated_at")},
            "jobs": jobs_out}, None


def main():
    sha = sys.argv[1] if len(sys.argv) > 1 else ""
    wait = "--wait" in sys.argv
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        print("usage: watch_ci.py <full-sha> [--wait]")
        sys.exit(2)
    token = load_token()
    if not token:
        print("[FAIL] no GITHUB_TOKEN")
        sys.exit(2)

    deadline = time.time() + 30 * 60
    snap, err = None, None
    while True:
        snap, err = snapshot(token, sha)
        if err:
            print("[..] %s" % err)
            if time.time() > deadline:
                break
            time.sleep(15)
            continue
        run = snap["run"]
        jobs = snap["jobs"]
        done = all(j.get("status") == "completed" for j in jobs
                   if j.get("name") in MANDATORY_JOBS) and len(
            [j for j in jobs if j.get("name") in MANDATORY_JOBS]) == 3
        print("[..] run %s status=%s — jobs: %s" % (
            run["id"], run["status"],
            ", ".join("%s=%s" % (j["name"], j.get("conclusion")
                                 or j.get("status")) for j in jobs)))
        if (done or run["status"] == "completed") or not wait:
            break
        if time.time() > deadline:
            print("[FAIL] 30-minute deadline exceeded")
            break
        time.sleep(30)

    if not snap:
        print("[FAIL] no snapshot: %s" % err)
        sys.exit(1)

    run, jobs = snap["run"], snap["jobs"]
    print()
    print("CI RUN: id=%s" % run["id"])
    print("  url: %s" % run["html_url"])
    print("  head_sha: %s" % run["head_sha"])
    print("  status: %s  conclusion: %s" % (run["status"], run["conclusion"]))
    mandatory = [j for j in jobs if j.get("name") in MANDATORY_JOBS]
    other = [j for j in jobs if j.get("name") not in MANDATORY_JOBS]
    print("  mandatory jobs (%d/3 present):" % len(mandatory))
    all_ok = len(mandatory) == 3
    for j in mandatory:
        ok = j.get("conclusion") == "success"
        all_ok = all_ok and ok
        print("    [%s] %s -> %s (%s)" % (
            "OK" if ok else "FAIL", j["name"], j.get("conclusion"),
            j.get("html_url")))
        for s in j.get("steps") or []:
            if s.get("conclusion") not in ("success", "skipped", None):
                print("        step [%s]: %s" % (s.get("conclusion"),
                                                 s.get("name")))
    if other:
        print("  other jobs (unexpected — inspect):")
        for j in other:
            print("    [?] %s -> %s" % (j["name"], j.get("conclusion")))
    # advisory scanner visibility (must be non-masking)
    for j in mandatory:
        if j["name"] == "verify":
            adv = [s for s in j.get("steps") or []
                   if "osv" in (s.get("name") or "").lower()]
            for s in adv:
                print("  advisory scanner step: %s -> %s (continue-on-error "
                      "scoped to this step only)" % (s.get("name"),
                                                     s.get("conclusion")))

    snap["mandatory_all_green"] = bool(all_ok and run["conclusion"] == "success")
    snap["checkedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(snap, f, indent=2)
    print()
    print("evidence: %s" % OUT_PATH)
    print("VERDICT: %s" % ("ALL THREE MANDATORY JOBS GREEN"
                           if snap["mandatory_all_green"]
                           else "NOT GREEN — do not deploy"))
    sys.exit(0 if snap["mandatory_all_green"] else 1)


if __name__ == "__main__":
    main()
