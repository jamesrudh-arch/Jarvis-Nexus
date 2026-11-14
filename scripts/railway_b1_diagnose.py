#!/usr/bin/env python3
"""B1 diagnosis v2 — self-introspecting Railway GraphQL client.

Discovers the exact type fields, then queries:
projects -> environments -> domains -> services -> deployments -> variables.

SECURITY: token never printed. Variable VALUES never printed — display is
names-only; if the API exposes values, they are written silently into
repo/.env.local (gitignored) to restore the app's local env after the wipe.
"""
import json
import os
import subprocess
import sys

PROD = "https://jarvis-nexus.up.railway.app"
PROD_ALT = "https://jarvis-nexus-production.up.railway.app"
API = "https://backboard.railway.com/graphql/v2"


def load_token():
    env = {}
    with open("/home/z/my-project/credentials.env") as f:
        for line in f:
            line = line.strip()
            if line.startswith("export "):
                k, _, v = line[len("export "):].partition("=")
                env[k.strip()] = v.strip().strip("'").strip('"')
    tok = env.get("RAILWAY_API_TOKEN", "")
    if not tok:
        print("FATAL: RAILWAY_API_TOKEN missing")
        sys.exit(1)
    return tok


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


def sel(base, candidates):
    """Build a selection string using only fields that exist on the type."""
    return " ".join(f for f in candidates if f in base)


def http_probe(url):
    r = subprocess.run(
        ["curl", "-sS", "--max-time", "25", "-w",
         "\n__META__%{http_code} %{content_type}", url],
        capture_output=True, text=True, timeout=40)
    out = r.stdout or ""
    body, _, meta = out.rpartition("__META__")
    return meta.strip(), " ".join(body.split())[:160]


def main():
    print("== type introspection ==")
    DOM = type_fields("Domain")
    DEP = type_fields("Deployment")
    VAR = type_fields("Variable")
    SVC = type_fields("Service")
    print(f"Domain fields usable: {len(DOM)} | Variable: {len(VAR)} | Deployment: {len(DEP)}")
    var_has_value = "value" in VAR
    print(f"Variable.value exposed by API: {var_has_value}")

    print("\n== projects ==")
    d = gql("query { projects(first: 25, includeDeleted: true) { edges { node "
            "{ id name updatedAt } } } }")
    edges = (((d.get("data") or {}).get("projects") or {}).get("edges")) or []
    if d.get("errors") or not edges:
        print("  projects query failed:", json.dumps(d)[:300])
    target = None
    for e in edges:
        n = e["node"]
        print(f"  project {n['name']!r} id={n['id']} updatedAt={n.get('updatedAt')}")
        if "jarvis" in n["name"].lower():
            target = n
    if not target and len(edges) == 1:
        target = edges[0]["node"]
        print(f"  (no jarvis-named project; single project {target['name']!r} assumed to be the app)")

    pid = target["id"]
    print(f"\n== project detail {target['name']!r} ==")
    d = gql('query($id:String!){ project(id:$id) { id name updatedAt '
            'environments { edges { node { id name isEphemeral } } } } }', {"id": pid})
    proj = (d.get("data") or {}).get("project") or {}
    print(f"  name={proj.get('name')!r} updatedAt={proj.get('updatedAt')}")
    envs = []
    for e in (proj.get("environments") or {}).get("edges", []):
        n = e["node"]
        print(f"  env {n.get('name')!r} id={n['id']}")
        envs.append((n["id"], n.get("name")))

    for eid, ename in envs:
        print(f"\n== environment {ename!r} ==")
        # domains
        dom_sel = sel(DOM, ["id", "domain", "status", "port", "suffix",
                            "serviceId", "createdAt", "deletedAt"])
        d = gql('query($e:String!){ domains(environmentId:$e) { edges { node { '
                + dom_sel + ' } } } }', {"e": eid})
        dom_edges = (((d.get("data") or {}).get("domains") or {}).get("edges")) or []
        if d.get("errors"):
            print("  domains failed:", json.dumps(d)[:200])
        for de in dom_edges:
            n = de["node"]
            print(f"  domain {n.get('domain')} status={n.get('status')} port={n.get('port')}")
        # services via environment
        d = gql('query($id:String!){ environment(id:$id) { id name '
                'serviceInstances { edges { node { id service { id name '
                'deployments(first:5) { edges { node { '
                + sel(DEP, ["id", "status", "createdAt", "updatedAt"]) +
                ' } } } } } } } } }', {"id": eid})
        env = (d.get("data") or {}).get("environment") or {}
        for se in (env.get("serviceInstances") or {}).get("edges", []):
            n = se["node"]
            svc = n.get("service") or {}
            print(f"  service {svc.get('name')!r} serviceId={svc.get('id')}")
            for dd in ((svc.get("deployments") or {}).get("edges", [])):
                dn = dd["node"]
                print(f"    deployment {dn.get('createdAt')} status={dn.get('status')}")
        # variables — names for display; values only if API exposes them
        var_sel = "id name" + (" value" if var_has_value else "")
        d = gql('query($e:String!,$p:String!){ variables(environmentId:$e, projectId:$p) '
                '{ edges { node { ' + var_sel + ' } } } }', {"e": eid, "p": pid})
        var_edges = (((d.get("data") or {}).get("variables") or {}).get("edges")) or []
        names = []
        values = {}
        for ve in var_edges:
            n = ve["node"]
            names.append(n["name"])
            if var_has_value and n.get("value") is not None:
                values[n["name"]] = n["value"]
        print(f"  variables ({len(names)}, names only): {', '.join(sorted(names))}")
        print(f"  OWNER_KEY present: {'OWNER_KEY' in names}")
        if values:
            out = "/home/z/my-project/repo/.env.local"
            with open(out) as f:
                keep = [l for l in f.read().splitlines()
                        if l.startswith("GITHUB_TOKEN=")]
            lines = list(keep) + [
                "# Synced from Railway environment (restoration after sandbox wipe)."]
            for k in sorted(values):
                v = str(values[k])
                if "\n" in v:
                    print(f"  skipped multi-line var {k}")
                    continue
                q = '"' if (" " in v or "'" in v) else ""
                lines.append(f"{k}={q}{v}{q}")
            with open(out, "w") as f:
                f.write("\n".join(lines) + "\n")
            os.chmod(out, 0o600)
            print(f"  WROTE {len(values)} values into repo/.env.local (not printed)")
        if var_has_value and not values:
            print("  (API exposes .value but none returned — token scope may forbid reads)")

    print("\n== HTTP re-probe ==")
    for label, url in [("primary", PROD), ("production-env", PROD_ALT)]:
        meta, snip = http_probe(url + "/")
        print(f"  {label}: {url}/ -> {meta} | {snip!r}")


if __name__ == "__main__":
    main()
