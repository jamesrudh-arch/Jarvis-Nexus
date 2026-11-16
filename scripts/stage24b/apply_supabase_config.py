#!/usr/bin/env python3
"""Apply the Supabase backup credentials to Railway production (owner step).

The owner supplies exactly two missing variables:
  SUPABASE_URL               e.g. https://<project-ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  the service_role secret (sb_secret_... or JWT)

Sources (checked in order, values NEVER printed/logged):
  1. environment variables of this process
  2. /home/z/my-project/.env.supabase  (gitignored, chmod 600, KEY=VALUE lines)

What it does (project reasonable-heart / environment production / service
Jarvis-Nexus — same identifiers as apply_production_backup_config.py):
  1. Verify RAILWAY_API_TOKEN (read-only project query).
  2. Validate inputs WITHOUT printing them (URL shape; key length class only).
  3. variableUpsert SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (skipDeploys=true
     — no deploy is triggered; values activate at the next restart/deploy).
  4. Read-back verify BOTH variables (fingerprint comparison only).
  5. Optionally (--redeploy) trigger a redeploy of the CURRENT commit so the
     backup scheduler picks the variables up immediately.

Safety:
  - Default DRY-RUN. --apply executes the mutations.
  - Only the two named variables are touched. Existing variables (including
    NEXUS_BACKUP_ENCRYPTION_KEY — NEVER replaced without explicit authorization)
    are preserved untouched.
  - Transcript (secrets redacted) written to
    docs/stage2.4b/evidence/production-acceptance/apply-supabase-config.json
"""
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.request
import urllib.error

API = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
SUPA_ENV_FILE = "/home/z/my-project/.env.supabase"
OUT_PATH = "/home/z/my-project/docs/stage2.4b/evidence/production-acceptance/apply-supabase-config.json"

TRANSCRIPT = []


def log(step, status, detail):
    TRANSCRIPT.append({"step": step, "status": status, "detail": detail})
    print(f"[{status}] {step}: {detail}")


def load_token():
    tok = os.environ.get("RAILWAY_API_TOKEN", "").strip()
    if tok:
        return tok
    for ln in open("/home/z/my-project/.env"):
        m = re.match(r"^(?:export\s+)?RAILWAY_API_TOKEN=(.+)$", ln.strip())
        if m:
            return m.group(1).strip().strip("'").strip('"')
    return None


def load_supabase_inputs():
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if (not url or not key) and os.path.exists(SUPA_ENV_FILE):
        for ln in open(SUPA_ENV_FILE):
            m = re.match(r"^(?:export\s+)?(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=(.+)$", ln.strip())
            if m:
                if m.group(1) == "SUPABASE_URL" and not url:
                    url = m.group(2).strip().strip("'").strip('"')
                if m.group(1) == "SUPABASE_SERVICE_ROLE_KEY" and not key:
                    key = m.group(2).strip().strip("'").strip('"')
    return url, key


def gql(token, query, variables=None):
    payload = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        API, data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)",
        },
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="execute mutations (default: dry-run)")
    ap.add_argument("--redeploy", action="store_true",
                    help="after applying, trigger a redeploy of the CURRENT production commit "
                         "so the variables activate immediately (rollback-safe: same commit)")
    args = ap.parse_args()

    token = load_token()
    if not token:
        log("token", "FAIL", "RAILWAY_API_TOKEN not present (env or .env)")
        sys.exit(2)

    code, d = gql(token, 'query { project(id: "%s") { name } }' % PROJECT_ID)
    name = (((d or {}).get("data") or {}).get("project") or {}).get("name")
    if code == 200 and name:
        log("token", "OK", f"project readable: {name}")
    else:
        log("token", "FAIL", f"HTTP {code}: {json.dumps(d)[:300]}")
        sys.exit(2)

    url, key = load_supabase_inputs()
    if not url:
        log("input.SUPABASE_URL", "FAIL",
            "missing. Owner action: supply SUPABASE_URL (e.g. https://<ref>.supabase.co) "
            f"via environment or {SUPA_ENV_FILE} (chmod 600, gitignored)")
        save_transcript("missing-credentials")
        sys.exit(2)
    if not key:
        log("input.SUPABASE_SERVICE_ROLE_KEY", "FAIL",
            "missing. Owner action: supply SUPABASE_SERVICE_ROLE_KEY (the service_role secret) "
            f"via environment or {SUPA_ENV_FILE} (chmod 600, gitignored)")
        save_transcript("missing-credentials")
        sys.exit(2)
    if not re.match(r"^https://[a-z0-9-]+\.supabase\.co/?$", url):
        log("input.SUPABASE_URL", "FAIL",
            f"unexpected URL shape (expected https://<ref>.supabase.co); length={len(url)} — value not printed")
        save_transcript("invalid-input")
        sys.exit(2)
    if len(key) < 32:
        log("input.SUPABASE_SERVICE_ROLE_KEY", "FAIL",
            f"key too short ({len(key)} chars; service_role secrets are >= 32) — value not printed")
        save_transcript("invalid-input")
        sys.exit(2)

    url_fp = hashlib.sha256(url.encode()).hexdigest()[:16]
    key_fp = hashlib.sha256(key.encode()).hexdigest()[:16]
    log("input.SUPABASE_URL", "OK", f"valid shape; sha256[:16] fingerprint {url_fp} (value never printed)")
    log("input.SUPABASE_SERVICE_ROLE_KEY", "OK",
        f"{len(key)} chars; sha256[:16] fingerprint {key_fp} (value never printed)")

    mutations = [
        ("variableUpsert.SUPABASE_URL", """
        mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }""",
         {"input": {"projectId": PROJECT_ID, "environmentId": ENV_ID, "serviceId": SERVICE_ID,
                    "name": "SUPABASE_URL", "value": url.rstrip("/"), "skipDeploys": True}}),
        ("variableUpsert.SUPABASE_SERVICE_ROLE_KEY", """
        mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }""",
         {"input": {"projectId": PROJECT_ID, "environmentId": ENV_ID, "serviceId": SERVICE_ID,
                    "name": "SUPABASE_SERVICE_ROLE_KEY", "value": key, "skipDeploys": True}}),
    ]

    if not args.apply:
        for name_, _, _ in mutations:
            log(f"dryrun.{name_}", "DRY", "would execute (value redacted)")
        log("mode", "INFO", "dry-run complete; re-run with --apply to execute")
        save_transcript("dry-run")
        return

    for name_, q, _vars in mutations:
        code, d = gql(token, q, _vars)
        errs = (d or {}).get("errors")
        if code == 200 and not errs:
            log(f"apply.{name_}", "OK", "applied (skipDeploys=true — activates at next restart/deploy)")
        else:
            log(f"apply.{name_}", "FAIL", f"HTTP {code}: {json.dumps(errs or d)[:300]}")
            save_transcript("apply-failed")
            sys.exit(1)

    # read-back verification (fingerprints only)
    q_vars = ('query { variables(projectId: "%s", environmentId: "%s", serviceId: "%s") }'
              % (PROJECT_ID, ENV_ID, SERVICE_ID))
    code, d = gql(token, q_vars)
    raw = (((d or {}).get("data") or {}).get("variables"))
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception:
        parsed = {}
    ok_url = hashlib.sha256((parsed.get("SUPABASE_URL") or "").encode()).hexdigest()[:16] == url_fp
    ok_key = hashlib.sha256((parsed.get("SUPABASE_SERVICE_ROLE_KEY") or "").encode()).hexdigest()[:16] == key_fp
    log("verify.SUPABASE_URL", "OK" if ok_url else "FAIL", f"fingerprint match: {ok_url}")
    log("verify.SUPABASE_SERVICE_ROLE_KEY", "OK" if ok_key else "FAIL", f"fingerprint match: {ok_key}")

    # confirm the encryption key + retention are UNTOUCHED (must already exist)
    ok_enc = bool(re.fullmatch(r"[0-9a-f]{64}", parsed.get("NEXUS_BACKUP_ENCRYPTION_KEY") or ""))
    log("preserve.NEXUS_BACKUP_ENCRYPTION_KEY", "OK" if ok_enc else "FAIL",
        "existing 64-hex key still present and untouched" if ok_enc else "existing key MISSING — investigate before proceeding")
    log("preserve.NEXUS_BACKUP_RETENTION", "OK" if parsed.get("NEXUS_BACKUP_RETENTION") == "14" else "FAIL",
        f"value == 14: {parsed.get('NEXUS_BACKUP_RETENTION') == '14'}")

    if args.redeploy:
        q_deploy = """
        mutation($input: DeploymentCreateInput!) { deploymentCreate(input: $input) { id status } }"""
        code, d = gql(token, q_deploy, {"input": {"environmentId": ENV_ID, "serviceId": SERVICE_ID,
                                                  "commit": None}})
        dep = (((d or {}).get("data") or {}).get("deploymentCreate") or {})
        if code == 200 and dep.get("id"):
            log("redeploy", "OK", f"deployment {dep.get('id')} triggered for the current commit")
        else:
            log("redeploy", "FAIL", f"HTTP {code}: {json.dumps((d or {}).get('errors') or d)[:300]}")

    save_transcript("applied")
    if not (ok_url and ok_key and ok_enc):
        sys.exit(1)
    print("\nSupabase credentials applied and verified (fingerprints only). "
          "The backup scheduler activates them at the next restart/deploy; "
          "run verify_supabase_live.py afterwards for full independent verification.")


def save_transcript(mode):
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump({"mode": mode, "recordedAt": __import__("time").strftime(
            "%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
            "transcript": TRANSCRIPT}, f, indent=2)
    print(f"transcript: {OUT_PATH}")


if __name__ == "__main__":
    main()
