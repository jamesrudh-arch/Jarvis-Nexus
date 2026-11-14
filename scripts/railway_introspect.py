#!/usr/bin/env python3
"""Introspect the Railway GraphQL schema (queryType fields + args) using the
workspace token. Never prints the token."""
import json
import subprocess


def load_token():
    env = {}
    with open("/home/z/my-project/credentials.env") as f:
        for line in f:
            line = line.strip()
            if line.startswith("export "):
                k, _, v = line[len("export "):].partition("=")
                env[k.strip()] = v.strip().strip("'").strip('"')
    return env.get("RAILWAY_API_TOKEN", "")


TOKEN = load_token()

r = subprocess.run(
    ["curl", "-sS", "--max-time", "45", "-X", "POST",
     "https://backboard.railway.com/graphql/v2",
     "-H", f"Authorization: Bearer {TOKEN}",
     "-H", "Content-Type: application/json",
     "-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
     "-d", json.dumps({"query": """
query {
  __schema {
    queryType {
      fields {
        name
        args {
          name
          type { name kind ofType { name kind } }
        }
      }
    }
  }
}"""})],
    capture_output=True, text=True, timeout=60)

d = json.loads(r.stdout)
if d.get("errors"):
    print("ERRORS:", json.dumps(d["errors"])[:400])
qf = (((d.get("data") or {}).get("__schema") or {}).get("queryType") or {}).get("fields") or []
print(f"{len(qf)} root query fields:")
for f in qf:
    args = ", ".join(
        f"{a['name']}:{(a['type'].get('ofType') or a['type']).get('name') or a['type'].get('name')}"
        for a in f.get("args", []))
    print(f"  {f['name']}({args})")
