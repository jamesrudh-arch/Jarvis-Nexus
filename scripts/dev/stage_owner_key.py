#!/usr/bin/env python3
"""Stage the production OWNER_KEY into /tmp/.ok (0600, never printed).
Read-only Railway query — same pattern as recover_production_secrets.py."""
import json
import re
import os
import urllib.request

API = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"

tok = re.search(r"^RAILWAY_API_TOKEN=(.+)$", open("/home/z/my-project/.env").read(), re.M).group(1).strip()
q = 'query { variables(projectId: "%s", environmentId: "%s", serviceId: "%s") }' % (PROJECT_ID, ENV_ID, SERVICE_ID)
req = urllib.request.Request(API, data=json.dumps({"query": q}).encode(), headers={
    "Content-Type": "application/json", "Authorization": "Bearer " + tok,
    "User-Agent": "Mozilla/5.0"}, method="POST")
d = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
raw = d["data"]["variables"]
v = json.loads(raw) if isinstance(raw, str) else raw
with open("/tmp/.ok", "w") as f:
    f.write(v["OWNER_KEY"])
os.chmod("/tmp/.ok", 0o600)
print("owner key staged: /tmp/.ok (mode 0600)")
