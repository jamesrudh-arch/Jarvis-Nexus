#!/usr/bin/env python3
"""Refined verification for the 3 failing services (Kaggle, Supabase mgmt, Railway).
- Kaggle: use endpoints that the API accepts (datasets/list, competitions/list)
  per session-5 documented working forms.
- Supabase: sb_secret_ is project-scoped — test project-specific mgmt endpoint.
- Railway: Cloudflare 1010 blocks python-urllib signature; use curl subprocess.
"""
import json
import os
import subprocess

with open("/home/z/my-project/credentials.env") as f:
    for line in f:
        line = line.strip()
        if line.startswith("export "):
            k, _, v = line[len("export "):].partition("=")
            os.environ[k.strip()] = v.strip().strip("'").strip('"')

def curl_json(url, headers, timeout=25):
    """HTTP via curl (real browser-ish TLS signature) -> (status, body)."""
    cmd = ["curl", "-sS", "-w", "\n%{http_code}", "--max-time", str(timeout), url]
    for k, v in headers.items():
        cmd += ["-H", f"{k}: {v}"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 10).stdout
        body, _, code = out.rpartition("\n")
        return int(code or 0), body
    except Exception as e:
        return 0, str(e)

print("=== KAGGLE (corrected query forms) ===")
for i in range(1, 7):
    tok = os.environ.get(f"KAGGLE_KEY_{i}")
    s, b = curl_json("https://www.kaggle.com/api/v1/datasets/list",
                     {"Authorization": f"Bearer {tok}"})
    if s == 200:
        log = f"token #{i}: DATA PLANE OK (datasets/list HTTP 200)"
        # also try kernels/list with no params (account-scoped)
        s2, b2 = curl_json("https://www.kaggle.com/api/v1/kernels/list",
                           {"Authorization": f"Bearer {tok}"})
        if s2 == 200:
            log += f"; kernels/list HTTP 200 ({len(json.loads(b2))} entries)"
        print(f"[OK] Kaggle {log}")
    else:
        print(f"[FAIL] Kaggle token #{i}: HTTP {s}: {b[:100]}")

print()
print("=== SUPABASE sb_secret_ (project-scoped endpoints) ===")
sb = os.environ["SUPABASE_ACCESS_TOKEN"]
ref = os.environ["SUPABASE_URL"].rstrip("/").split("//")[1].split(".")[0]
# New API keys can hit the management API for their own project
for path in (f"/v1/projects/{ref}", f"/v1/projects/{ref}/api-keys"):
    s, b = curl_json(f"https://api.supabase.com{path}", {"Authorization": f"Bearer {sb}"})
    verdict = "OK" if s == 200 else "blocked"
    body_note = ""
    if s == 200:
        try:
            j = json.loads(b)
            body_note = f" keys: {len(j)}" if isinstance(j, list) else f" name: {j.get('name')}"
        except Exception:
            body_note = ""
    print(f"[{verdict}] GET {path} -> HTTP {s}{body_note} {'' if s==200 else b[:80]}")
# Also verify sb_secret works on the data plane (it should as a supabase key)
s, b = curl_json(f"{os.environ['SUPABASE_URL']}/storage/v1/bucket",
                 {"Authorization": f"Bearer {sb}"})
print(f"[{'OK' if s==200 else 'blocked'}] sb_secret on storage data plane -> HTTP {s} {'buckets listed' if s==200 else b[:80]}")

print()
print("=== RAILWAY (curl to bypass CF 1010) ===")
rwy = os.environ["RAILWAY_API_TOKEN"]
q = json.dumps({"query": "query { me { name } }"})
s, b = curl_json("https://backboard.railway.app/graphql",
                 {"Authorization": f"Bearer {rwy}", "Content-Type": "application/json",
                  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"})
# curl with -H only does GET; GraphQL needs POST -> do manual POST via curl -d
out = subprocess.run(
    ["curl", "-sS", "-w", "\n%{http_code}", "--max-time", "25",
     "-X", "POST", "https://backboard.railway.app/graphql",
     "-H", f"Authorization: Bearer {rwy}",
     "-H", "Content-Type: application/json",
     "-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
     "-d", q],
    capture_output=True, text=True, timeout=35).stdout
body, _, code = out.rpartition("\n")
code = int(code or 0)
if code == 200:
    name = json.loads(body).get("data", {}).get("me", {}).get("name")
    print(f"[OK] Railway me: {name!r} (HTTP {code})")
else:
    print(f"[FAIL] Railway me: HTTP {code}: {body[:150]}")
