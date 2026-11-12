#!/usr/bin/env python3
"""
JARVIS NEXUS — Deep service probes (Stage 2).
Railway project deep-dive (reasonable-heart), schema introspection for exact
mutation inputs, real write-permission probes; Cloudflare account-level token
API probes; GitHub Jarvis repo supabase-config discovery.
Prints evidence only — never secret values.
"""
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


def req(method, url, headers=None, body=None, timeout=30, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("User-Agent", "jarvis-nexus-probe/2.0")
    r.add_header("Accept", "application/json")
    if body is not None:
        r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw_bytes = resp.read()
            if raw:
                return resp.status, raw_bytes
            try:
                return resp.status, json.loads(raw_bytes)
            except Exception:
                return resp.status, raw_bytes.decode("utf-8", "replace")[:500]
    except urllib.error.HTTPError as e:
        raw_bytes = e.read()
        try:
            return e.code, json.loads(raw_bytes)
        except Exception:
            return e.code, raw_bytes.decode("utf-8", "replace")[:500]
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


GQL = "https://backboard.railway.app/graphql/v2"


def gql(query, variables=None):
    return req("POST", GQL,
               {"Authorization": f"Bearer {ENV['RAILWAY_API_TOKEN']}"},
               {"query": query, "variables": variables or {}})


PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"

print("=" * 72)
print("  RAILWAY — project deep-dive")
print("=" * 72)

st, body = gql(f"""
{{
  project(id: "{PROJECT_ID}") {{
    id name createdAt updatedAt
    isPublic
    environments(first: 10) {{
      edges {{ node {{ id name isEphemeral createdAt }} }}
    }}
    services(first: 20) {{
      edges {{ node {{ id name serviceIcon }} }}
    }}
  }}
}}""")
print(f"[project] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:800]}")

if st == 200 and body.get("data", {}).get("project"):
    proj = body["data"]["project"]
    envs = [e["node"] for e in proj.get("environments", {}).get("edges", [])]
    for env in envs:
        st2, b2 = gql(f"""
        {{
          environment(id: "{env['id']}") {{
            id name
            variables(first: 50) {{ edges {{ node {{ id key value isSystem isShared }} }} }}
            deployments(first: 5) {{ edges {{ node {{ id status createdAt meta }} }} }}
          }}
        }}""")
        env_data = (b2.get("data") or {}).get("environment") if st2 == 200 else None
        if env_data:
            variables = env_data.get("variables", {}).get("edges", [])
            print(f"\n[env {env['name']!r} id={env['id']}]")
            for v in variables:
                node = v["node"]
                val = node.get("value") or ""
                # Only reveal variable KEYS and whether values exist; for
                # non-secret URL-like values show a safe hint (supabase ref!)
                if any(s in node["key"].upper() for s in
                       ("TOKEN", "SECRET", "PASSWORD", "KEY", "CREDENTIAL")):
                    shown = f"<set len={len(val)}>"
                elif val.startswith(("http://", "https://", "postgres")):
                    shown = val  # URLs/DSNs minus credentials are config, and
                    # we need the supabase ref from them
                    if "@" in shown:
                        shown = shown.split("@")[0].split("//")[0] + "//***@" + shown.split("@")[1]
                else:
                    shown = val[:80] if val else "<empty>"
                print(f"    var {node['key']!r} = {shown} "
                      f"(system={node.get('isSystem')}, shared={node.get('isShared')})")
            deployments = env_data.get("deployments", {}).get("edges", [])
            print(f"    deployments: {[(d['node']['status'], d['node']['createdAt']) for d in deployments]}")
        else:
            print(f"[env {env.get('name')}] query failed: {json.dumps(b2)[:200]}")

    services = [s["node"] for s in proj.get("services", {}).get("edges", [])]
    print(f"\nservices: {services}")

print("\n" + "=" * 72)
print("  RAILWAY — mutation introspection (exact input shapes)")
print("=" * 72)

st, body = gql("""
{
  __type(name: "Mutation") {
    fields {
      name
      args { name type { kind name ofType { kind name ofType { kind name } } } }
    }
  }
}""")
if st == 200 and (body.get("data") or {}).get("__type"):
    fields = body["data"]["__type"]["fields"]
    names = [f["name"] for f in fields]
    print(f"[mutations available in schema] {len(names)} total")
    interesting = [n for n in names if any(k in n.lower() for k in
                   ("project", "variable", "service", "deployment", "domain"))]
    print(f"[relevant] {interesting}")
    for f in fields:
        if f["name"] in ("projectCreate", "variableCreate", "variableUpdate",
                         "variableDelete", "serviceCreate"):
            args = [(a["name"], json.dumps(a["type"])) for a in f["args"]]
            print(f"  {f['name']}{args}")
else:
    print(f"introspection failed: {json.dumps(body)[:300]}")

# Exact input shape for variableCreate (for the write probe)
st, body = gql("""
{
  __type(name: "VariableCollectionUpdateInput") {
    inputFields { name type { kind name ofType { kind name } } }
  }
}""")
print(f"[VariableCollectionUpdateInput] HTTP {st} — {json.dumps(body)[:400]}")

print("\n" + "=" * 72)
print("  CLOUDFLARE — account-level token API probes")
print("=" * 72)
cf = ENV.get("CLOUDFLARE_API_TOKEN", "")
acct = ENV.get("CLOUDFLARE_ACCOUNT_ID", "")
if cf and acct:
    # Account API tokens surface
    st, body = req("GET", f"https://api.cloudflare.com/client/v4/accounts/{acct}/tokens",
                   {"Authorization": f"Bearer {cf}"})
    print(f"[acct-tokens:list] HTTP {st} — {json.dumps(body)[:300]}")

    st, body = req("GET",
                   f"https://api.cloudflare.com/client/v4/accounts/{acct}/tokens/permission_groups",
                   {"Authorization": f"Bearer {cf}"})
    if st == 200 and isinstance(body, dict) and body.get("success"):
        groups = body.get("result", [])
        r2g = [g for g in groups if "r2" in json.dumps(g).lower()]
        print(f"[acct-perm-groups] CAN list ({len(groups)} groups); "
              f"R2 groups: {[(g.get('name'), g.get('id')) for g in r2g]}")
    else:
        errs = body.get("errors") if isinstance(body, dict) else body
        print(f"[acct-perm-groups] HTTP {st} — {json.dumps(errs)[:300]}")

    # R2 bucket creation attempt (real write probe — fails 10042 if disabled)
    st, body = req("POST",
                   f"https://api.cloudflare.com/client/v4/accounts/{acct}/r2/buckets",
                   {"Authorization": f"Bearer {cf}"},
                   {"name": "jarvis-nexus-assets"})
    errs = body.get("errors") if isinstance(body, dict) else body
    print(f"[r2:bucket-create] HTTP {st} — {json.dumps(errs)[:300]}")

print("\nStage-2 probes complete.")
