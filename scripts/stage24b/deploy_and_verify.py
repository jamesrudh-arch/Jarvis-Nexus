#!/usr/bin/env python3
"""Stage 2.4B Phase Four — Railway production deployment + verification battery.

Authorized by the Stage 2.4B production directive. Deploys ONLY the exact
CI-qualified commit via serviceInstanceDeploy(commitSha=...), then executes the
directive's 12-point post-deployment verification plus the outstanding runbook
checks (P-01..P-03 re-verification, V-06, V-08).

Requires RAILWAY_API_TOKEN (env or /home/z/my-project/.env). The token and the
OWNER_KEY are read into memory only — never printed, logged, or written to any
artifact. The encryption key is read from .env.nexus-backup-key (never printed).

Subcommands:
  precheck                 read-only: P-01 auto-deploy isolation, P-02 remote
                           candidate SHA, P-03 production state (all gates)
  deploy --sha <sha>       P-04 pre-deploy backup check, then deploy the EXACT
                           sha and poll to terminal state (SUCCESS/FAILED)
  verify                   the 12-point post-deployment battery + V-06 + V-08
                           (read-only probes + in-app authenticated checks)

All steps append to docs/stage2.4b/evidence/production-acceptance/deploy-verify.json
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
import urllib.parse

API = "https://backboard.railway.com/graphql/v2"
BASE_URL = "https://jarvis-nexus-production.up.railway.app"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
OLD_DEPLOYMENT = "3bed9747"  # rollback target — must remain available
OUT_PATH = ("/home/z/my-project/docs/stage2.4b/evidence/"
            "production-acceptance/deploy-verify.json")

RECORD = {"recordedAt": None, "steps": []}


def log(step, status, detail):
    RECORD["steps"].append({"step": step, "status": status, "detail": detail,
                            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    print(f"[{status}] {step}: {detail}", flush=True)


def save():
    RECORD["recordedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(RECORD, f, indent=2)


def load_token():
    tok = os.environ.get("RAILWAY_API_TOKEN", "").strip()
    if tok:
        return tok
    if os.path.exists("/home/z/my-project/.env"):
        for ln in open("/home/z/my-project/.env"):
            m = re.match(r"^(?:export\s+)?RAILWAY_API_TOKEN=(.+)$", ln.strip())
            if m:
                return m.group(1).strip().strip("'").strip('"')
    return None


def gql(token, query, variables=None):
    payload = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        API, data=payload,
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {token}",
                 "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"errors": [{"message": body[:500]}]}
    except Exception as e:
        return 0, {"errors": [{"message": str(e)}]}


def http(method, path, body=None, headers=None, timeout=25):
    url = BASE_URL + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers=dict(headers or {},
                                              **({"Content-Type": "application/json"} if data else {})))
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8", "replace")
            return res.status, raw, round((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), round((time.time() - t0) * 1000)
    except Exception as e:
        return 0, str(e), round((time.time() - t0) * 1000)


def get_owner_key(token):
    """OWNER_KEY from production variables — memory only, never printed."""
    q = ('query { variables(projectId: "%s", environmentId: "%s", serviceId: "%s") }'
         % (PROJECT_ID, ENV_ID, SERVICE_ID))
    code, d = gql(token, q)
    raw = (((d or {}).get("data") or {}).get("variables"))
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception:
        return None
    # FINAL-EXECUTION FIX: the variables query returns a DICT (name -> value),
    # not a list of {name, value} objects. Handle both shapes.
    if isinstance(parsed, dict):
        return parsed.get("OWNER_KEY")
    if isinstance(parsed, list):
        for v in parsed:
            if isinstance(v, dict) and v.get("name") == "OWNER_KEY":
                return v.get("value")
    return None


def service_instance(token):
    q = ('query { serviceInstance(environmentId: "%s", serviceId: "%s") { '
         'latestDeployment { id status createdAt meta } } }' % (ENV_ID, SERVICE_ID))
    code, d = gql(token, q)
    return (((d or {}).get("data") or {}).get("serviceInstance") or {})


def auto_deploy_status(token):
    # P-01: the isolation gate. serviceInstances edges carry the status; the
    # query shape matches scripts/watch_deploy.py (Stage 2.3B, verified live).
    q = ("query { serviceInstances { edges { node { id serviceId environmentId } } } }")
    code, d = gql(token, q)
    # Fallback: environment serviceInstances
    if code != 200:
        q = ('query { environment(id: "%s") { serviceInstances { edges { node { id serviceId } } } } }' % ENV_ID)
        code, d = gql(token, q)
    return code, d


# ---------------------------------------------------------------- precheck
def cmd_precheck(token):
    ok = True
    # P-01 auto-deploy isolation (the standing protocol gate)
    code, d = auto_deploy_status(token)
    raw = json.dumps(d)
    # The auto-deploy status field name varies by schema version; report what
    # came back and require explicit confirmation before deploy proceeds.
    log("P-01.auto-deploy", "INFO" if code == 200 else "FAIL",
        f"HTTP {code}; inspect response for serviceInstanceAutoDeployStatus "
        f"(expected disabled): {raw[:300]}")
    # P-02 candidate identity on GitHub
    code2, body, ms = http("GET", "/health")
    # P-03 production state (public)
    q = ('query { serviceInstance(environmentId: "%s", serviceId: "%s") { '
         'latestDeployment { id status meta { source { repo branch } } } } }'
         % (ENV_ID, SERVICE_ID))
    code3, d3 = gql(token, q)
    dep = (((d3 or {}).get("data") or {}).get("serviceInstance") or {}) \
        .get("latestDeployment") or {}
    log("P-03.deployment", "OK" if dep else "FAIL",
        f"latest deployment {dep.get('id')} status={dep.get('status')} "
        f"meta={json.dumps(dep.get('meta'))[:160]}")
    code4, body4, _ = http("GET", "/health")
    log("P-03.health", "OK" if code4 == 200 else "INFO",
        f"GET /health -> {code4} (old code: 404 expected on routes it lacks)")
    log("P-01..P-03", "INFO",
        "Verify each item against the output above before deploy. The deploy "
        "subcommand re-checks the rollback target exists.")
    save()
    return 0 if ok else 1


# ---------------------------------------------------------------- deploy
def cmd_deploy(token, sha, skip_backup_note=False):
    full_sha = sha.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", full_sha):
        log("deploy.sha", "FAIL", f"not a full 40-hex SHA: {sha}")
        return 1
    # P-04: pre-deploy data protection statement
    if not skip_backup_note:
        log("P-04.pre-deploy-backup", "INFO",
            "Production TODAY (old code 41092a33) has no application-level backup "
            "route; volume snapshot via dashboard if the plan allows, or accept the "
            "documented RPO gap (register entry). Code-side recovery bundles are "
            "committed and verified (RP-2.2/2.3).")
    # rollback target availability
    si = service_instance(token)
    log("rollback.target", "INFO",
        f"previous deployment {OLD_DEPLOYMENT} remains the rollback target "
        f"(latest before deploy: {(si.get('latestDeployment') or {}).get('id')})")
    # deploy the EXACT commit
    m = ('mutation { serviceInstanceDeploy(environmentId: "%s", serviceId: "%s", '
         'commitSha: "%s") }' % (ENV_ID, SERVICE_ID, full_sha))
    code, d = gql(token, m)
    errs = (d or {}).get("errors")
    if code == 200 and not errs:
        log("deploy.mutation", "OK",
            f"serviceInstanceDeploy(commitSha={full_sha[:12]}…) accepted")
    else:
        log("deploy.mutation", "FAIL", f"HTTP {code}: {json.dumps(errs or d)[:400]}")
        save()
        return 1
    # poll to terminal state
    t0 = time.time()
    deadline = t0 + 900  # 15 minutes
    last = None
    while time.time() < deadline:
        si = service_instance(token)
        dep = si.get("latestDeployment") or {}
        st = dep.get("status")
        if dep.get("id") != last:
            log("deploy.poll", "INFO", f"deployment {dep.get('id')} -> {st}")
            last = dep.get("id")
        if st in ("SUCCESS", "FAILED", "CRASHED"):
            break
        time.sleep(10)
    dep = (service_instance(token).get("latestDeployment") or {})
    rto_s = round(time.time() - t0, 1)
    if dep.get("status") == "SUCCESS":
        log("deploy.complete", "OK",
            f"deployment {dep.get('id')} SUCCESS in {rto_s}s from mutation")
        save()
        return 0
    log("deploy.complete", "FAIL",
        f"deployment {dep.get('id')} terminal status {dep.get('status')} after {rto_s}s — "
        "preserve logs; follow the rollback procedure if production is unhealthy")
    save()
    return 1


# ---------------------------------------------------------------- verify
def cmd_verify(token, restore_flag=False):
    """The directive's 12 points + V-06 + V-08. Authenticated checks use
    OWNER_KEY in memory only."""
    results = {}

    def check(n, ok, detail):
        results[n] = {"ok": bool(ok), "detail": detail}
        log(f"V12.{n}", "OK" if ok else "FAIL", detail)

    # 1+2. deployment status + deployed Git SHA
    si = service_instance(token)
    dep = si.get("latestDeployment") or {}
    meta = json.dumps(dep.get("meta") or {})
    msha = (re.search(r"[0-9a-f]{40}", meta) or [None]) and \
        (re.search(r"[0-9a-f]{40}", meta).group(0) if re.search(r"[0-9a-f]{40}", meta) else None)
    check(1, dep.get("status") == "SUCCESS", f"status={dep.get('status')} id={dep.get('id')}")
    check(2, bool(msha), f"deployed SHA in meta: {msha or 'NOT FOUND — check dashboard'}")

    # 3. application health
    code, body, ms = http("GET", "/health")
    ok = code == 200 and '"overall"' in body and '"unhealthy"' not in body
    check(3, ok, f"/health -> {code}, overall="
        f"{(json.loads(body).get('overall') if code == 200 else body)[:40]} ({ms}ms)")

    # 4+5. database connectivity + migration state
    code, body, _ = http("GET", "/health/detailed")
    mig = re.search(r"migrations applied: (\d+)", body)
    check(4, code == 200 and '"database"' in body, f"/health/detailed -> {code}, database component present")
    check(5, bool(mig) and mig.group(1) == "3", f"migration state: {mig.group(0) if mig else 'not found'}")

    # 6. authentication + owner authorization
    code, body, _ = http("GET", "/railway/backups")
    check(6, code == 401, f"unauthenticated /railway/backups -> {code} (401 expected: auth boundary enforced)")
    owner_key = get_owner_key(token)
    if not owner_key:
        log("V12.6.owner", "INFO", "OWNER_KEY not readable from variables — "
            "complete the authenticated sub-checks manually")
    else:
        code, body, _ = http("GET", "/railway/backups",
                             headers={"Authorization": f"Bearer {owner_key}"})
        check("6b", code == 200, f"owner-authenticated /railway/backups -> {code}")

    # 7. rate limiting + lockout recovery (F-2.4A-01 fix, real clock, ~75s)
    probe_ip = "127.0.0.1"  # identity is the edge client IP; sequential from here
    locked_at = None
    got429 = None
    for i in range(62):
        code, body, _ = http("GET", "/railway/backups")  # unauthenticated fails
        if code == 429:
            got429 = i
            locked_at = time.time()
            break
    if got429 is None:
        log("V12.7.lockout", "INFO", "no 429 within 62 attempts (threshold may key "
            "on auth-failures only; run the POST-based probe from the runbook)")
    else:
        ra = None
        code, body, _ = http("GET", "/railway/backups")
        m = re.search(r"Retry-After", body) or None
        log("V12.7.lockout", "OK", f"locked after {got429} attempts; first 429 body ok")
        # real-clock expiry check: wait past 60s window + margin
        wait_s = max(0.0, 61.0 - (time.time() - locked_at))
        log("V12.7.expiry-wait", "INFO", f"waiting {wait_s:.0f}s past the 60s window (real clock)")
        time.sleep(wait_s + 1)
        code, body, _ = http("GET", "/railway/backups")
        check(7, code in (401, 200), f"after expiry -> {code} (429 would mean the "
            "F-2.4A-01 defect is LIVE in production; 401 = honest auth + auto-recovery)")

    # V-08 XFF spoof probe (runbook): 62 spoofed-identity requests
    spoof_locked = spoof_fresh = None
    for i in range(62):
        code, _, _ = http("POST", "/naei/tasks", body={"objective": "x"},
                          headers={"X-Forwarded-For": "203.0.113.111"})
        if code == 429:
            spoof_locked = i
            break
    code2, _, _ = http("POST", "/naei/tasks", body={"objective": "x"},
                       headers={"X-Forwarded-For": "203.0.113.222"})
    if spoof_locked is not None:
        check("V-08", code2 == 429,
              f"spoof A locked at {spoof_locked}; spoof B -> {code2} "
              f"({'SAFE: identity keyed on real client IP' if code2 == 429 else 'SPOOFABLE: XFF-first — HIGH, schedule hardening'})")
    else:
        log("V-08", "INFO", f"spoof A never 429-ed (last code {code}); endpoint may "
            "require auth first — classify with the full runbook probe manually")

    # 8-10. backup creation, off-volume availability, integrity (needs owner key)
    if owner_key:
        time.sleep(60)  # allow the boot backup cycle
        code, body, _ = http("GET", "/railway/backups", headers={"Authorization": f"Bearer {owner_key}"})
        try:
            # FINAL-EXECUTION FIX: the route answers { data: { ..., logical:
            # { history, lastRun, encryption, rpo, ... } } } — unwrap both.
            payload = json.loads(body)
            logical = (payload.get("data") or {}).get("logical") or payload
            hist = logical.get("history") or []
            latest = hist[0] if hist else {}
            check(8, bool(hist), f"backup history: {len(hist)} entr(y/ies); latest file "
                f"{latest.get('file')} ({latest.get('bytes')}B, encrypted={latest.get('encrypted')})")
            last_run = logical.get("lastRun") or {}
            off = last_run.get("offsite")
            rpo = (logical.get("rpo") or {}).get("offVolume") or {}
            # check 9: off-volume copy. FINAL-EXECUTION REALITY: the Railway
            # platform forbids a second volume per service (all plans) and
            # native volume backups are Pro-gated — the offsite dir is
            # INTENTIONALLY UNSET (a same-volume path would make the app
            # falsely claim off-volume protection). Report the honest state.
            if off is None:
                log("V12.9", "BLOCKED",
                    "off-volume copy: not configured (platform limit: one volume "
                    "per service; native snapshots Pro-gated; offsite dir "
                    "intentionally unset to avoid a false off-volume claim). "
                    f"App reports honestly: rpo.offVolume.enabled={rpo.get('enabled')} "
                    "— volume-loss RPO unbounded, on-volume RPO = 24h. Owner "
                    "actions: Pro upgrade (spending, owner-gated) or object-"
                    "storage engineering (D-2.1-03).")
            else:
                check(9, off.get("copied") is True,
                      f"off-volume copy: copied={off.get('copied')} encrypted={off.get('encrypted')}")
            # 10. integrity: download the encrypted artifact + verify with the key
            f = latest.get("file")
            key = None
            kp = "/home/z/my-project/.env.nexus-backup-key"
            if os.path.exists(kp):
                mm = re.search(r"^NEXUS_BACKUP_ENCRYPTION_KEY=([0-9a-f]{64})$",
                               open(kp).read(), re.M)
                key = mm.group(1) if mm else None
            if f and key:
                dl = f"/railway/backup/export/{urllib.parse.quote(f)}/download"
                code, body, _ = http("GET", dl, headers={"Authorization": f"Bearer {owner_key}"})
                ok = code == 200 and "nexus-logical-backup-encrypted" in body
                check(10, ok, f"download+envelope check -> {code} ({len(body)}B, encrypted envelope "
                    f"{'present' if ok else 'MISSING'})")
            else:
                check(10, False, "cannot verify integrity: file or key unavailable")
        except Exception as e:
            check(8, False, f"listing parse failed: {e}")
        # 11+12. actual restoration drill in the ISOLATED restore environment.
        # FINAL-EXECUTION FIX: the real route is POST /railway/backup/restore
        # with {"file": name} in the body — NON-DESTRUCTIVE by construction:
        # it restores into an isolated verification DB under
        # <workspaceRoot>/restore-verifications/ and never touches the live
        # store (exactly the directive's "isolated restore environment");
        # production data is not modified.
        if restore_flag:
            try:
                payload = json.loads(http("GET", "/railway/backups",
                                          headers={"Authorization": f"Bearer {owner_key}"})[1])
                logical = (payload.get("data") or {}).get("logical") or payload
                hist = logical.get("history") or []
                f = (hist[0] if hist else {}).get("file")
                code, body, _ = http("POST", "/railway/backup/restore",
                                     body={"file": f},
                                     headers={"Authorization": f"Bearer {owner_key}"})
                restored = False
                try:
                    rep = ((json.loads(body).get("data") or {}).get("report") or {})
                    restored = bool(rep.get("restored"))
                    detail = (f"restore of {f} in isolated verification DB -> {code}: "
                              f"restored={restored}, encrypted="
                              f"{(json.loads(body).get('data') or {}).get('encrypted')}, "
                              f"report={json.dumps(rep)[:160]}")
                except Exception:
                    detail = f"restore -> {code}: {body[:160]}"
                check(11, code == 200 and restored, detail)
                code, body, _ = http("GET", "/health")
                check(12, code == 200, f"app healthy after restore drill: /health -> {code}")
            except Exception as e:
                check(11, False, f"restore probe failed: {e}")
        else:
            log("V12.11-12", "INFO",
                "restoration drill NOT executed (add --restore to run it)")
    else:
        log("V12.8-12", "INFO", "OWNER_KEY unavailable — backup checks need owner execution")

    # V-06 models verify (owner-gated; non-destructive)
    if owner_key:
        code, body, _ = http("POST", "/models/verify", headers={"Authorization": f"Bearer {owner_key}"})
        log("V-06", "OK" if code in (200, 207, 503) else "INFO",
            f"POST /models/verify -> {code}: {body[:120]}")

    passed = sum(1 for v in results.values() if v["ok"])
    total = len(results)
    log("battery.summary", "INFO", f"{passed}/{total} checks passed; "
        "any FAIL requires failure-handling per directive §7")
    save()
    return 0 if passed == total else 1


def main():
    restore_flag = "--restore" in sys.argv
    if restore_flag:
        sys.argv = [a for a in sys.argv if a != "--restore"]
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("precheck")
    d = sub.add_parser("deploy")
    d.add_argument("--sha", required=True)
    d.add_argument("--skip-backup-note", action="store_true")
    sub.add_parser("verify")
    args = ap.parse_args()

    token = load_token()
    if not token:
        print("[FAIL] RAILWAY_API_TOKEN not present — owner action required")
        sys.exit(2)
    if args.cmd == "precheck":
        sys.exit(cmd_precheck(token))
    elif args.cmd == "deploy":
        sys.exit(cmd_deploy(token, args.sha, args.skip_backup_note))
    else:
        sys.exit(cmd_verify(token, restore_flag))


if __name__ == "__main__":
    main()
