#!/usr/bin/env python3
"""
JARVIS NEXUS — Deep service probes (Stage 3).
1. Railway: fixed project deep-dive (envs/vars/services/deployments),
   exact upsert input shapes, REAL write probe (variableUpsert + variableDelete).
2. Cloudflare: REAL account-token creation with R2 scope; derive S3 credentials
   (access key = token id, secret = sha256(token value)) and write them to
   .env.local WITHOUT printing them.
"""
import hashlib
import json
import os
import re
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


def req(method, url, headers=None, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("User-Agent", "jarvis-nexus-probe/3.0")
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

print("=" * 72)
print("  RAILWAY — project deep-dive (fixed)")
print("=" * 72)
st, body = gql(f"""
{{
  project(id: "{PROJECT_ID}") {{
    id name createdAt updatedAt
    environments(first: 10) {{ edges {{ node {{ id name isEphemeral }} }} }}
    services(first: 20) {{ edges {{ node {{ id name }} }} }}
  }}
}}""")
print(f"[project] HTTP {st} — {json.dumps(body, ensure_ascii=False)[:600]}")

env_ids = []
if st == 200 and (body.get("data") or {}).get("project"):
    proj = body["data"]["project"]
    env_ids = [(e["node"]["id"], e["node"]["name"])
               for e in proj.get("environments", {}).get("edges", [])]
    for env_id, env_name in env_ids:
        st2, b2 = gql(f"""
        {{
          environment(id: "{env_id}") {{
            id name
            variables(first: 50) {{ edges {{ node {{ id key value isSystem isShared }} }} }}
            deployments(first: 5) {{ edges {{ node {{ id status createdAt }} }} }}
          }}
        }}""")
        env_data = (b2.get("data") or {}).get("environment") if st2 == 200 else None
        if env_data:
            print(f"\n[env {env_name!r} id={env_id}]")
            for v in env_data.get("variables", {}).get("edges", []):
                node = v["node"]
                key, val = node["key"], (node.get("value") or "")
                if any(s in key.upper() for s in ("TOKEN", "SECRET", "PASSWORD", "KEY", "CREDENTIAL", "DSN")):
                    shown = f"<set len={len(val)}>"
                else:
                    shown = val[:100] if val else "<empty>"
                print(f"    var {key!r} = {shown}")
            deps = env_data.get("deployments", {}).get("edges", [])
            print(f"    deployments: {[(d['node']['status'], d['node']['createdAt']) for d in deps]}")
        else:
            print(f"[env {env_name}] failed: {json.dumps(b2)[:200]}")
    services = [s["node"] for s in proj.get("services", {}).get("edges", [])]
    print(f"\n[services] {services}")

print("\n" + "=" * 72)
print("  RAILWAY — input shapes for write probe")
print("=" * 72)
st, body = gql("""
{ a: __type(name: "VariableUpsertInput") { inputFields { name type { kind name ofType { kind name } } } }
  b: __type(name: "VariableDeleteInput") { inputFields { name type { kind name ofType { kind name } } } }
  c: __type(name: "ProjectCreateInput") { inputFields { name type { kind name ofType { kind name } } } } }
""")
print(f"[inputs] HTTP {st} — {json.dumps(body)[:700]}")

print("\n" + "=" * 72)
print("  RAILWAY — REAL WRITE PROBE (upsert test var, then delete it)")
print("=" * 72)
# variableUpsert on the first (non-ephemeral) environment
probe_env = None
st, body = gql(f"""{{ project(id: "{PROJECT_ID}") {{
  environments(first: 10) {{ edges {{ node {{ id name isEphemeral }} }} }} }} }}""")
if st == 200:
    edges = ((body.get("data") or {}).get("project") or {}).get("environments", {}).get("edges", [])
    for e in edges:
        if not e["node"].get("isEphemeral"):
            probe_env = e["node"]["id"]
            print(f"[probe-env] {e['node']['name']} ({probe_env})")
            break

if probe_env:
    # Real mutation #1: upsert a clearly-labelled probe variable
    st, body = gql("""
      mutation($input: VariableUpsertInput!) {
        variableUpsert(input: $input) { id key }
      }""",
                  {"input": {
                      "environmentId": probe_env,
                      "key": "JARVIS_NEXUS_WRITE_PROBE",
                      "value": "probe-2026-11-12",
                  }})
    print(f"[variableUpsert] HTTP {st} — {json.dumps(body)[:300]}")
    var_id = None
    node = (body.get("data") or {}).get("variableUpsert") if isinstance(body, dict) else None
    if isinstance(node, dict):
        var_id = node.get("id")
    if var_id:
        # Real mutation #2: delete the probe variable (clean up)
        st, body = gql("""
          mutation($input: VariableDeleteInput!) {
            variableDelete(input: $input) { id }
          }""", {"input": {"id": var_id}})
        print(f"[variableDelete] HTTP {st} — {json.dumps(body)[:200]}")
    else:
        print("[variableDelete] skipped — upsert did not return an id")
else:
    print("[write-probe] no non-ephemeral environment found")

print("\n" + "=" * 72)
print("  CLOUDFLARE — REAL R2-scoped account-token creation")
print("=" * 72)
cf = ENV.get("CLOUDFLARE_API_TOKEN", "")
acct = ENV.get("CLOUDFLARE_ACCOUNT_ID", "")
if cf and acct:
    R2_WRITE = "2efd5506f9c8494dacb1fa10a3e7d5b6"   # Workers R2 Storage Bucket Item Write
    R2_READ = "6a018a9f2fc74eb6b293b0c548f38b39"    # Workers R2 Storage Bucket Item Read
    R2_META_READ = "dc1beb502339482da2515d6e146ca1ac"  # Storage Metadata Read
    token_body = {
        "name": "jarvis-nexus-r2-s3",
        "policies": [{
            "effect": "allow",
            "resources": {f"com.cloudflare.api.account.{acct}": "*"},
            "permission_groups": [
                {"id": R2_WRITE}, {"id": R2_READ}, {"id": R2_META_READ},
            ],
        }],
    }
    st, body = req("POST",
                   f"https://api.cloudflare.com/client/v4/accounts/{acct}/tokens",
                   {"Authorization": f"Bearer {cf}"},
                   token_body)
    if st == 200 and isinstance(body, dict) and body.get("success"):
        result = body.get("result") or {}
        tok_id = result.get("id")
        tok_value = result.get("value")  # shown exactly once — never print
        print(f"[token:create] SUCCESS id={tok_id} status={result.get('status')}")
        if tok_value:
            secret = hashlib.sha256(tok_value.encode()).hexdigest()
            print(f"[s3-creds] AccessKeyID={tok_id} SecretAccessKey=sha256(token) "
                  f"<len={len(secret)} computed, NOT printed>")
            # Verify the new token immediately (real verification)
            st2, vbody = req("GET",
                             "https://api.cloudflare.com/client/v4/user/tokens/verify",
                             {"Authorization": f"Bearer {tok_value}"})
            vstat = ((vbody or {}).get("result") or {}).get("status") if isinstance(vbody, dict) else None
            print(f"[token:verify-new] HTTP {st2} status={vstat}")
            # Persist to .env.local without printing
            env_path = os.path.join(ROOT, ".env.local")
            with open(env_path, "r", encoding="utf-8") as fh:
                content = fh.read()
            updates = {
                "R2_ACCESS_KEY_ID": tok_id,
                "R2_SECRET_ACCESS_KEY": secret,
            }
            for k, v in updates.items():
                if re.search(rf"^{k}=", content, re.M):
                    content = re.sub(rf"^{k}=.*$", f"{k}={v}", content, flags=re.M)
                else:
                    content += f"\n{k}={v}"
            with open(env_path, "w", encoding="utf-8") as fh:
                fh.write(content)
            print(f"[env] R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY written to .env.local (gitignored)")
            # Real R2 API test with the NEW token (expect 10042 until owner enables R2)
            st3, rbody = req("GET",
                             f"https://api.cloudflare.com/client/v4/accounts/{acct}/r2/buckets",
                             {"Authorization": f"Bearer {tok_value}"})
            errs = (rbody or {}).get("errors") if isinstance(rbody, dict) else rbody
            print(f"[r2:new-token-buckets] HTTP {st3} — {json.dumps(errs)[:200]}")
        else:
            print("[s3-creds] token created but value not returned — cannot derive secret")
    else:
        errs = body.get("errors") if isinstance(body, dict) else body
        print(f"[token:create] HTTP {st} — {json.dumps(errs)[:300]}")

print("\nStage-3 probes complete.")
