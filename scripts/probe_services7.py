#!/usr/bin/env python3
"""Stage 7: Railway service public URL + variables map; GitHub remote state."""
import json
import os
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env(path=os.path.join(ROOT, ".env.local")):
    env = {}
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


ENV = load_env()


def req(method, url, headers=None, body=None, timeout=40):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("User-Agent", "jarvis-nexus-probe/7.0")
    r.add_header("Accept", "application/json")
    if body is not None:
        r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, raw.decode("utf-8", "replace")[:500]
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, ""
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


GQL = "https://backboard.railway.app/graphql/v2"


def gql(query, variables=None):
    return req("POST", GQL,
               {"Authorization": f"Bearer {ENV['RAILWAY_API_TOKEN']}"},
               {"query": query, "variables": variables or {}})


PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"

print("== Service domains ==")
st, body = gql(f"""
{{
  serviceInstance(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") {{
    domains {{ ... on AllDomains {{ custom {{ edges {{ node {{ domain status }} }} }} service {{ edges {{ node {{ domain }} }} }} }} }}
  }}
}}""")
print(f"[domains] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:600]}")

st, body = gql(f"""
{{
  serviceInstance(environmentId: "{ENV_ID}", serviceId: "{SERVICE_ID}") {{
    latestDeployment {{ id status url staticUrl }}
  }}
}}""")
print(f"[latestDeployment url] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:400]}")

print("\n== Variables (map) ==")
st, body = gql(f'{{ variables(projectId: "{PROJECT_ID}", environmentId: "{ENV_ID}") }}')
print(f"[variables] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:1500]}")
if st == 200 and isinstance((body.get("data") or {}).get("variables"), dict):
    for name, val in body["data"]["variables"].items():
        if any(s in name.upper() for s in ("TOKEN", "SECRET", "PASSWORD", "KEY", "CREDENTIAL")):
            shown = f"<set len={len(str(val))}>"
        else:
            shown = str(val)[:140] if val else "<empty>"
        print(f"    {name!r} = {shown}")

print("\n== Deployment URL check ==")
st, body = gql('query($id: String!) { deployment(id: $id) { id status url staticUrl } }',
               {"id": "b320d328-ba8f-43a1-8eff-783b08dd5218"})
print(f"[deployment url] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:400]}")
url = ((body.get("data") or {}).get("deployment") or {}).get("staticUrl") or \
      ((body.get("data") or {}).get("deployment") or {}).get("url")
if url:
    st, body = req("GET", f"https://{url}/api/v1/health" if not url.startswith("http") else f"{url}/api/v1/health")
    print(f"[healthcheck {url}] HTTP {st} — {str(body)[:300]}")

print("\nStage-7 probes complete.")
