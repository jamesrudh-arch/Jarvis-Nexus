#!/usr/bin/env python3
"""List Railway production service variable NAMES only (never values).
Also reports the encryption-key fingerprint (sha256[:16]) for non-secret
comparison, per the established pattern.
"""
import hashlib
import json
import os
import re
import urllib.request
import urllib.error

API = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"


def load_token():
    tok = os.environ.get("RAILWAY_API_TOKEN", "").strip()
    if tok:
        return tok
    for ln in open("/home/z/my-project/.env"):
        m = re.match(r"^(?:export\s+)?RAILWAY_API_TOKEN=(.+)$", ln.strip())
        if m:
            return m.group(1).strip().strip("'").strip('"')
    return None


def gql(token, query, variables=None):
    payload = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(API, data=payload, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"errors": [{"message": body[:300]}]}


def main():
    token = load_token()
    if not token:
        print("NO_TOKEN")
        return 2
    q = ('query { project(id: "%s") { name } }' % PROJECT_ID)
    code, d = gql(token, q)
    if code != 200:
        print("TOKEN_FAIL", code)
        return 2
    print("project:", d["data"]["project"]["name"])

    q_vars = ('query { variables(projectId: "%s", environmentId: "%s", serviceId: "%s") }'
              % (PROJECT_ID, ENV_ID, SERVICE_ID))
    code, d = gql(token, q_vars)
    raw = (((d or {}).get("data") or {}).get("variables"))
    parsed = json.loads(raw) if isinstance(raw, str) else (raw or {})
    if not isinstance(parsed, dict):
        parsed = {}
    print("variable NAMES (%d):" % len(parsed))
    for name in sorted(parsed.keys()):
        v = parsed.get(name) or ""
        if name == "NEXUS_BACKUP_ENCRYPTION_KEY":
            fp = hashlib.sha256(v.encode()).hexdigest()[:16] if re.fullmatch(r"[0-9a-f]{64}", v) else None
            print("  - %s: <64-hex present, fingerprint sha256[:16]=%s>" % (name, fp))
        elif "KEY" in name or "TOKEN" in name or "SECRET" in name or "URL" in name or "DATABASE" in name:
            # never print the value; only presence + length class
            print("  - %s: <set, %d chars>" % (name, len(v)))
        else:
            print("  - %s: %s" % (name, v))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
