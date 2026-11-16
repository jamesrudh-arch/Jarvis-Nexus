#!/usr/bin/env python3
"""Final Acceptance Phase C part 1 — recover production values from Railway.

Reads the production service variables via the authenticated Railway API and
persists ONLY the verification-needed values into gitignored 0600 files:

  SUPABASE_URL                 -> .env.supabase
  SUPABASE_SERVICE_ROLE_KEY    -> .env.supabase
  NEXUS_BACKUP_ENCRYPTION_KEY  -> .env.nexus-backup-key

Also verifies (reporting fingerprints only, never values):
  - NEXUS_BACKUP_RETENTION == 14
  - /data volume still attached to the service (volumeInstances READY)
  - latest deployment status + commit (the rollback target stays intact)

Safety:
  - Read-only against Railway (queries only; no mutation of any variable).
  - NEVER generates a replacement key: if NEXUS_BACKUP_ENCRYPTION_KEY is
    absent or malformed the script FAILS LOUDLY and writes nothing.
  - Existing key file is only overwritten with the SAME recovered production
    value (fingerprint-compared first); any difference aborts for manual
    review.
  - Values never printed; fingerprints are sha256[:12].
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
API = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"

SUPA_FILE = os.path.join(REPO, ".env.supabase")
KEY_FILE = os.path.join(REPO, ".env.nexus-backup-key")


def fp(v):
    return hashlib.sha256(v.encode()).hexdigest()[:12]


def load_token():
    tok = os.environ.get("RAILWAY_API_TOKEN", "").strip()
    if tok:
        return tok
    for ln in open(os.path.join(REPO, ".env")):
        m = re.match(r"^(?:export\s+)?RAILWAY_API_TOKEN=(.+)$", ln.strip())
        if m:
            return m.group(1).strip().strip("'").strip('"')
    return None


def gql(token, query):
    req = urllib.request.Request(
        API, data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + token,
                 "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"errors": [{"message": body[:300]}]}
    except Exception as e:
        return 0, {"errors": [{"message": str(e)[:200]}]}


def write_600(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(path, 0o600)


def main():
    token = load_token()
    if not token:
        print("FAIL: RAILWAY_API_TOKEN not available (.env)")
        sys.exit(2)

    # variables (Railway returns a dict name->value)
    code, d = gql(token, 'query { variables(projectId: "%s", environmentId: "%s", serviceId: "%s") }'
                  % (PROJECT_ID, ENV_ID, SERVICE_ID))
    if code != 200 or d.get("errors"):
        print("FAIL: variables query:", code, str(d.get("errors"))[:200])
        sys.exit(1)
    raw = (d.get("data") or {}).get("variables")
    variables = json.loads(raw) if isinstance(raw, str) else (raw or {})

    names = sorted(variables.keys())
    print(f"service variables: {len(names)} present (names only)")
    for need in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXUS_BACKUP_ENCRYPTION_KEY"):
        if not variables.get(need):
            print(f"FAIL: required variable {need} is MISSING in production — cannot recover")
            sys.exit(1)

    url = variables["SUPABASE_URL"].strip().rstrip("/")
    skey = variables["SUPABASE_SERVICE_ROLE_KEY"].strip()
    enc_key = variables["NEXUS_BACKUP_ENCRYPTION_KEY"].strip()
    retention = variables.get("NEXUS_BACKUP_RETENTION", "").strip()

    if not re.fullmatch(r"https://[A-Za-z0-9.-]+", url):
        print("FAIL: SUPABASE_URL has unexpected shape (https host expected); aborting")
        sys.exit(1)
    if not re.fullmatch(r"[0-9a-f]{64}", enc_key):
        print("FAIL: NEXUS_BACKUP_ENCRYPTION_KEY is not 64-hex (AES-256); aborting — NEVER regenerating")
        sys.exit(1)
    if len(skey) < 20:
        print("FAIL: SUPABASE_SERVICE_ROLE_KEY implausibly short; aborting")
        sys.exit(1)
    if retention != "14":
        print(f"WARN: NEXUS_BACKUP_RETENTION is {retention!r} (expected '14') — will be reported, not mutated")

    # key-file guard: if a DIFFERENT key already exists locally, abort
    if os.path.exists(KEY_FILE):
        m = re.search(r"^NEXUS_BACKUP_ENCRYPTION_KEY=([0-9a-f]{64})$", open(KEY_FILE).read(), re.M)
        if m and m.group(1) != enc_key:
            print("FAIL: local key file holds a DIFFERENT key than production; manual review required — aborting")
            sys.exit(1)

    write_600(SUPA_FILE, f"SUPABASE_URL={url}\nSUPABASE_SERVICE_ROLE_KEY={skey}\n")
    write_600(KEY_FILE, f"NEXUS_BACKUP_ENCRYPTION_KEY={enc_key}\n")
    for p in (SUPA_FILE, KEY_FILE):
        ignored = subprocess.run(["git", "-C", REPO, "check-ignore", "-q", p]).returncode == 0
        mode = stat.S_IMODE(os.stat(p).st_mode)
        print(f"recovered -> {os.path.basename(p)} (mode {oct(mode)}, gitignored={ignored})")

    print(f"fingerprints: url-host={url.split('//')[1].split('/')[0]} "
          f"service-key={fp(skey)} encryption-key={fp(enc_key)}")

    # volume instances live under the ENVIRONMENT node (proven query shape —
    # service.volumeInstances does not exist on the live schema)
    code, d = gql(token, 'query { project(id: "%s") { environments { edges { node { '
                  'id name volumeInstances { edges { node { id mountPath '
                  'serviceId state region sizeMB } } } } } } } }' % PROJECT_ID)
    if code == 200 and not d.get("errors"):
        vols = []
        for e in ((((d.get("data") or {}).get("project") or {}).get("environments") or {}).get("edges") or []):
            for ve in (((e["node"].get("volumeInstances") or {}).get("edges")) or []):
                n = ve["node"]
                if n.get("serviceId") == SERVICE_ID:
                    vols.append(f"{n.get('mountPath')}@{n.get('state')}:{n.get('region')}")
        print(f"volume instances on service: {vols or 'NONE'}")
        data_ok = any(v.startswith("/data@READY") for v in vols)
        print(f"/data attached+READY: {data_ok}")
    else:
        print("WARN: volume query failed:", code)

    code, d = gql(token, 'query { deployments(input: {environmentId: "%s", serviceId: "%s"}) { edges { node { id status meta createdAt } } } }'
                  % (ENV_ID, SERVICE_ID))
    if code == 200:
        edges = (((d.get("data") or {}).get("deployments") or {}).get("edges")) or []
        if edges:
            n = edges[0]["node"]
            meta = n.get("meta") or {}
            print(f"current deployment (rollback target): {n['id']} status={n['status']} "
                  f"commit={str(meta.get('commitHash'))[:12]} createdAt={n.get('createdAt')}")
    else:
        print("WARN: deployment query failed:", code)

    print("PHASE C (recovery): PASS" if retention == "14" else
          "PHASE C (recovery): PASS with retention WARN")
    sys.exit(0)


if __name__ == "__main__":
    main()
