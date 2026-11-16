#!/usr/bin/env python3
"""Probe the REAL Supabase Storage API to find the correct object-stat shape.

Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from Railway variables into
memory ONLY (never printed). The production upload pipeline reported:
upload HTTP 200 -> stat /storage/v1/object/stat/{bucket}/{key} -> 404.
This probe lists what actually IS in the bucket and tries the candidate
stat/head/info endpoint shapes to find the working one.
"""
import json
import re
import urllib.request
import urllib.error

API = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
BUCKET = "jarvis-nexus-backups"


def load_creds():
    token = None
    for ln in open("/home/z/my-project/.env"):
        m = re.match(r"^(?:export\s+)?RAILWAY_API_TOKEN=(.+)$", ln.strip())
        if m:
            token = m.group(1).strip().strip("'").strip('"')
    q = ('query { variables(projectId: "%s", environmentId: "%s", serviceId: "%s") }'
         % (PROJECT_ID, ENV_ID, SERVICE_ID))
    req = urllib.request.Request(API, data=json.dumps({"query": q}).encode(), headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"}, method="POST")
    d = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    raw = (((d.get("data") or {}).get("variables")))
    parsed = json.loads(raw) if isinstance(raw, str) else (raw or {})
    return parsed.get("SUPABASE_URL"), parsed.get("SUPABASE_SERVICE_ROLE_KEY")


def sb(url, key, path, method="GET", body=None, auth=True):
    req = urllib.request.Request(url.rstrip("/") + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    if auth:
        req.add_header("authorization", f"Bearer {key}")
        req.add_header("apikey", key)
    if body is not None:
        req.add_header("content-type", "application/json")
    req.add_header("user-agent", "Mozilla/5.0 (X11; Linux x86_64)")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            data = res.read()
            return res.status, data[:400].decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200].decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)[:200]


url, key = load_creds()
print("SUPABASE_URL shape:", "https://" + url.split("//")[1][:8] + "…(rest hidden)" if url else None)
print("key present:", bool(key), "len:", len(key or ""))

# 1) bucket privacy
code, body = sb(url, key, f"/storage/v1/bucket/{BUCKET}")
print(f"\nbucket GET -> {code}: {body[:200]}")

# 2) what is actually IN the bucket?
code, body = sb(url, key, f"/storage/v1/object/list/{BUCKET}", "POST",
                {"prefix": "production/database/", "limit": 50, "offset": 0,
                 "sortBy": {"column": "name", "order": "asc"}})
print(f"\nlist -> {code}: {body[:400]}")
objects = json.loads(body) if code == 200 else []
enc_keys = [o["name"] for o in objects if o.get("name", "").endswith(".enc")]

# 3) candidate existence endpoints on the first .enc (if any)
if enc_keys:
    k = enc_keys[0]
    print(f"\nprobing existence endpoints for {k}:")
    for shape in [
        f"/storage/v1/object/stat/{BUCKET}/{k}",
        f"/storage/v1/object/info/{BUCKET}/{k}",
        f"/storage/v1/object/{BUCKET}/{k}",
        f"/storage/v1/object/authenticated/{BUCKET}/{k}",
        f"/storage/v1/object/public/{BUCKET}/{k}",
    ]:
        for method in ("GET", "HEAD"):
            code, body = sb(url, key, shape, method)
            print(f"  {method:4} {shape.replace(BUCKET, '<bucket>')} -> {code} {body[:80]}")
            if code == 200 and method == "GET":
                break
else:
    print("\nno .enc objects in the bucket — the upload itself may be failing silently")

# 4) anonymous public URL must refuse
if enc_keys:
    code, body = sb(url, key, f"/storage/v1/object/public/{BUCKET}/{enc_keys[0]}", auth=False)
    print(f"\npublic URL (anonymous) -> {code} (refusal expected)")
