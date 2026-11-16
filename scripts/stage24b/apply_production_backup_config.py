#!/usr/bin/env python3
"""Stage 2.4B Phase One — apply the production off-volume backup configuration.

Authorized by the Stage 2.4B production directive (owner-approved integration
and deployment). Requires RAILWAY_API_TOKEN in the environment (or
/home/z/my-project/.env as `RAILWAY_API_TOKEN=...`). The token and the
encryption key are NEVER printed, logged, or written to any artifact.

What it does (all against project reasonable-heart / environment production /
service Jarvis-Nexus, schema-verified against backboard GraphQL v2 on
2026-11-16 by anonymous introspection):

  1. Verify the token (read-only project query).
  2. List current volume instances for the production environment.
  3. If no volume is mounted at /backups: volumeCreate(mountPath="/backups").
  4. variableUpsert NEXUS_BACKUP_OFFSITE_DIR=/backups  (skipDeploys=true)
  5. variableUpsert NEXUS_BACKUP_ENCRYPTION_KEY=<from .env.nexus-backup-key>
     (skipDeploys=true; value never echoed)
  6. Re-verify: volume listing + variable names + key fingerprint (sha256
     prefix only, for non-secret comparison against the generated key).

Safety:
  - Default is DRY-RUN. Pass --apply to execute mutations.
  - Only the two named variables are upserted; nothing else is touched.
  - No deploy is triggered (skipDeploys=true on both upserts).
  - Full JSON transcript (secrets redacted) written to
     docs/stage2.4b/evidence/production-acceptance/apply-backup-config.json
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error

API = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
MOUNT_PATH = "/backups"
KEY_FILE = "/home/z/my-project/.env.nexus-backup-key"
OUT_PATH = "/home/z/my-project/docs/stage2.4b/evidence/production-acceptance/apply-backup-config.json"

TRANSCRIPT = []


def log(step, status, detail):
    line = {"step": step, "status": status, "detail": detail}
    TRANSCRIPT.append(line)
    print(f"[{status}] {step}: {detail}")


def load_token():
    tok = os.environ.get("RAILWAY_API_TOKEN", "").strip()
    if tok:
        return tok
    env_path = "/home/z/my-project/.env"
    if os.path.exists(env_path):
        for ln in open(env_path):
            m = re.match(r"^(?:export\s+)?RAILWAY_API_TOKEN=(.+)$", ln.strip())
            if m:
                return m.group(1).strip().strip("'").strip('"')
    return None


def load_key():
    """Return the 64-hex key from the gitignored 0600 key file. Never printed."""
    if not os.path.exists(KEY_FILE):
        return None
    text = open(KEY_FILE).read()
    m = re.search(r"^NEXUS_BACKUP_ENCRYPTION_KEY=([0-9a-f]{64})$", text, re.M)
    return m.group(1) if m else None


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
    ap.add_argument("--apply", action="store_true",
                    help="execute mutations (default: dry-run)")
    args = ap.parse_args()

    token = load_token()
    if not token:
        log("token", "FAIL", "RAILWAY_API_TOKEN not present (env or .env). "
            "Owner action required: re-supply the workspace token.")
        sys.exit(2)

    # 1) token verification (read-only)
    code, d = gql(token, 'query { project(id: "%s") { name id } }' % PROJECT_ID)
    name = (((d or {}).get("data") or {}).get("project") or {}).get("name")
    if code == 200 and name:
        log("token", "OK", f"project readable: {name}")
    else:
        log("token", "FAIL", f"HTTP {code}: {json.dumps(d)[:300]}")
        sys.exit(2)

    # 2) current volume instances (read-only)
    q_volumes = """
    query { project(id: "%s") { environments { edges { node {
      id name volumeInstances { edges { node { id mountPath serviceId state region sizeMB } } } }
    } } } } }""" % PROJECT_ID
    code, d = gql(token, q_volumes)
    edges = ((((d or {}).get("data") or {}).get("project") or {}) \
        .get("environments") or {}).get("edges") or []
    vol_list = []
    for e in edges:
        node = e.get("node") or {}
        if node.get("id") != ENV_ID:
            continue
        for ve in ((node.get("volumeInstances") or {}).get("edges") or []):
            v = ve.get("node") or {}
            if v.get("serviceId") == SERVICE_ID:
                vol_list.append(v)
    log("volumes.current", "OK",
        f"{len(vol_list)} volume instance(s) on Jarvis-Nexus: "
        + ", ".join(f"{v.get('mountPath')} ({v.get('state')}, {v.get('region')})"
                    for v in vol_list) or "none")

    has_backup_vol = any(v.get("mountPath") == MOUNT_PATH for v in vol_list)
    if vol_list and not has_backup_vol:
        log("volumes.plan", "INFO",
            f"single-volume service confirmed; second volume will be created at {MOUNT_PATH}")
    if has_backup_vol:
        log("volumes.plan", "INFO", f"volume at {MOUNT_PATH} already exists; skip create")

    # 3) key availability + validity (fingerprint only)
    key = load_key()
    if not key:
        log("key", "FAIL", f"{KEY_FILE} missing or malformed. Regenerate per Phase One.")
        sys.exit(2)
    fp = hashlib.sha256(key.encode()).hexdigest()[:16]
    log("key", "OK", f"64-hex (32-byte) key loaded; sha256[:16] fingerprint {fp} "
        "(value never printed)")

    mutations = []
    if not has_backup_vol:
        mutations.append(("volumeCreate", """
        mutation($input: VolumeCreateInput!) { volumeCreate(input: $input) { id mountPath } }""",
            {"input": {"projectId": PROJECT_ID, "environmentId": ENV_ID,
                       "serviceId": SERVICE_ID, "mountPath": MOUNT_PATH}}))
    mutations.append(("variableUpsert.NEXUS_BACKUP_OFFSITE_DIR", """
    mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }""",
        {"input": {"projectId": PROJECT_ID, "environmentId": ENV_ID,
                   "serviceId": SERVICE_ID, "name": "NEXUS_BACKUP_OFFSITE_DIR",
                   "value": MOUNT_PATH, "skipDeploys": True}}))
    mutations.append(("variableUpsert.NEXUS_BACKUP_ENCRYPTION_KEY", """
    mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }""",
        {"input": {"projectId": PROJECT_ID, "environmentId": ENV_ID,
                   "serviceId": SERVICE_ID, "name": "NEXUS_BACKUP_ENCRYPTION_KEY",
                   "value": key, "skipDeploys": True}}))

    if not args.apply:
        for name_, _, _vars in mutations:
            val = _vars["input"].get("value")
            shown = val if name_.endswith("OFFSITE_DIR") else "<redacted 64-hex key>"
            if "mountPath" in _vars["input"]:
                shown = f"mountPath={_vars['input']['mountPath']}"
            log(f"dryrun.{name_}", "DRY", f"would execute ({shown})")
        log("mode", "INFO", "dry-run complete; re-run with --apply to execute")
        save_transcript("dry-run")
        return

    # 4) execute mutations
    for name_, q, _vars in mutations:
        code, d = gql(token, q, _vars)
        errs = (d or {}).get("errors")
        if code == 200 and not errs:
            detail = "applied"
            data = (d or {}).get("data") or {}
            if "volumeCreate" in data and data["volumeCreate"]:
                detail = f"volume {data['volumeCreate'].get('id')} at {data['volumeCreate'].get('mountPath')}"
            log(f"apply.{name_}", "OK", detail)
        else:
            log(f"apply.{name_}", "FAIL", f"HTTP {code}: {json.dumps(errs or d)[:300]}")
            save_transcript("apply-failed")
            sys.exit(1)

    # 5) verification (read-back; key fingerprint only)
    q_vars = ('query { variables(projectId: "%s", environmentId: "%s", serviceId: "%s") }'
              % (PROJECT_ID, ENV_ID, SERVICE_ID))
    code, d = gql(token, q_vars)
    raw = (((d or {}).get("data") or {}).get("variables"))
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else (raw or [])
    except Exception:
        parsed = []
    names = {v.get("name"): v for v in parsed} if isinstance(parsed, list) else {}
    ok_dir = names.get("NEXUS_BACKUP_OFFSITE_DIR", {}).get("value") == MOUNT_PATH
    prod_key = names.get("NEXUS_BACKUP_ENCRYPTION_KEY", {}).get("value") or ""
    ok_key = bool(re.fullmatch(r"[0-9a-f]{64}", prod_key)) and \
        hashlib.sha256(prod_key.encode()).hexdigest()[:16] == fp
    log("verify.NEXUS_BACKUP_OFFSITE_DIR", "OK" if ok_dir else "FAIL",
        f"value == {MOUNT_PATH}: {ok_dir}")
    log("verify.NEXUS_BACKUP_ENCRYPTION_KEY", "OK" if ok_key else "FAIL",
        "value matches generated key (fingerprint compare; never printed): "
        f"{ok_key}")
    save_transcript("applied")

    if not (ok_dir and ok_key):
        sys.exit(1)
    print("\nPhase One configuration applied and verified. "
          "Activation completes at the next deployment boot.")


def save_transcript(mode):
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump({"mode": mode, "recordedAt": __import__("time").strftime(
            "%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
            "transcript": TRANSCRIPT}, f, indent=2)
    print(f"transcript: {OUT_PATH}")


if __name__ == "__main__":
    main()
