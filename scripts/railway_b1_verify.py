#!/usr/bin/env python3
"""B1 verification v3 — domains, deployment meta, service variables,
and full HTTP route probes on the REAL production domain."""
import json
import subprocess

PROD = "https://jarvis-nexus-production.up.railway.app"
API = "https://backboard.railway.com/graphql/v2"
PID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
EID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"


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


def gql(query, variables=None):
    payload = {"query": query, "variables": variables or {}}
    r = subprocess.run(
        ["curl", "-sS", "--max-time", "45", "-X", "POST", API,
         "-H", f"Authorization: Bearer {TOKEN}",
         "-H", "Content-Type: application/json",
         "-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
         "-d", json.dumps(payload)],
        capture_output=True, text=True, timeout=60)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"errors": [{"message": "non-JSON", "raw": (r.stdout or r.stderr)[:200]}]}


def type_fields(name):
    d = gql('query($n:String!){ __type(name:$n){ fields { name } } }', {"n": name})
    t = (d.get("data") or {}).get("__type") or {}
    return set((f or {}).get("name") for f in t.get("fields") or [])


def http_probe(url, headers=None):
    cmd = ["curl", "-sS", "--max-time", "25", "-w",
           "\n__META__%{http_code} %{content_type}", url]
    for h in (headers or []):
        cmd += ["-H", h]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
    out = r.stdout or ""
    body, _, meta = out.rpartition("__META__")
    return meta.strip(), " ".join(body.split())[:120]


def main():
    print("== AllDomains shape ==")
    ad = type_fields("AllDomains")
    print(f"  AllDomains fields: {sorted(ad)}")
    d = gql('query($p:String!){ domains(projectId:$p) { '
            + " ".join(sorted(ad)) + ' } }', {"p": PID})
    data = (d.get("data") or {}).get("domains") or {}
    if d.get("errors"):
        print("  domains query failed:", json.dumps(d)[:250])
    else:
        print("  " + json.dumps(data)[:800])

    print("\n== latest deployment meta ==")
    DEPF = type_fields("Deployment")
    sel = " ".join(f for f in ["id", "status", "createdAt", "updatedAt", "meta",
                               "staticUrl", "environmentId", "serviceId"] if f in DEPF)
    d = gql('query($e:String!,$s:String!){ deployments(environmentId:$e, serviceId:$s, '
            'first: 3) { edges { node { ' + sel + ' } } } }', {"e": EID, "s": SID})
    deps = (((d.get("data") or {}).get("deployments") or {}).get("edges")) or []
    if d.get("errors"):
        # root deployments may need input shape; fall back to environment-scoped
        print("  root deployments failed:", json.dumps(d)[:200])
    for x in deps[:3]:
        n = x["node"]
        meta = n.get("meta") or {}
        print(f"  deployment {n.get('createdAt')} status={n.get('status')}")
        if isinstance(meta, dict):
            print(f"    meta: {json.dumps(meta)[:500]}")

    print("\n== variables with serviceId ==")
    d = gql('query($e:String!,$s:String!){ variables(environmentId:$e, serviceId:$s) '
            '{ edges { node { id name } } } }', {"e": EID, "s": SID})
    var_edges = (((d.get("data") or {}).get("variables") or {}).get("edges")) or []
    names = sorted(n["node"]["name"] for n in var_edges)
    print(f"  {len(names)} variables (names only): {', '.join(names)}")
    print(f"  OWNER_KEY present: {'OWNER_KEY' in names}")

    print("\n== HTTP route probes on the real domain ==")
    routes = ["/", "/api/v1/health", "/api/v1/world", "/api/v1/switches",
              "/api/v1/scenarios", "/api/v1/telemetry",
              "/api/v1/auth/verify", "/api/v1/admin/backup"]
    for path in routes:
        meta, snip = http_probe(PROD + path)
        print(f"  GET {path} -> {meta}")
        print(f"    {snip!r}")

    print("\n== bare domain control probe ==")
    meta, snip = http_probe("https://jarvis-nexus.up.railway.app/")
    print(f"  GET / -> {meta} | {snip!r}")


if __name__ == "__main__":
    main()
