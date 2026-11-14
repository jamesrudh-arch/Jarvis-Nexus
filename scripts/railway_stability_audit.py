#!/usr/bin/env python3
"""Railway production stability investigation v2 (Directive 4).

Working route (per previous session evidence RAILWAY_TOKEN_RESTORED_VERIFICATION.md):
  - endpoint: https://backboard.railway.com/graphql/v2  (backboard.railway.app
    default-python-UA is blocked by Cloudflare error 1010)
  - custom User-Agent required
  - workspace tokens: `me` returns Not Authorized (expected) — use project(id)
Read-only. No mutations. Token never printed.
"""
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

API = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.1"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"  # reasonable-heart (previous verified evidence)

def load_token():
    for line in open(".env", encoding="utf-8"):
        line = line.strip()
        if line.startswith("RAILWAY_TOKEN="):
            return line.split("=", 1)[1]
    return None

def gql(query, variables=None, token=None):
    payload = {"query": query, "variables": variables or {}}
    req = urllib.request.Request(
        API,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": UA,
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode())

def redact(obj):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if any(s in k.lower() for s in ("token", "secret", "password", "apikey", "api_key")) and isinstance(v, str) and v:
                out[k] = "[REDACTED]"
            else:
                out[k] = redact(v)
        return out
    if isinstance(obj, list):
        return [redact(x) for x in obj]
    return obj

def safe(name, fn, results):
    try:
        results["queries"][name] = fn()
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:400]
        results["queries"][name] = {"HTTP_ERROR": e.code, "body": body}
    except Exception as e:
        results["queries"][name] = {"ERROR": str(e)[:400]}

def main():
    token = load_token()
    if not token:
        print("FATAL: RAILWAY_TOKEN missing from .env"); sys.exit(1)

    R = {"generated_utc": datetime.now(timezone.utc).isoformat(),
         "endpoint": API, "queries": {}}

    # Q1: me (expect Not Authorized for workspace tokens — confirms token type)
    safe("me", lambda: redact(gql("query { me { id name } }", token=token)), R)

    # Q2: project detail — services, volumes, environments, deployments, usage
    q2 = """query($id: String!) { project(id: $id) {
      id name createdAt updatedAt isPublic
      services { edges { node { id name serviceType createdAt updatedAt } } }
      volumes { edges { node { id name mountPath createdAt } } }
      environments { edges { node { id name isEphemeral createdAt } } }
      usage { cpu memory disk egress limit cpuLimit memoryLimit diskLimit egressLimit }
    } }"""
    safe("project", lambda: redact(gql(q2, {"id": PROJECT_ID}, token=token)), R)

    # Q3: latest deployments with meta (plan info, commit, status)
    q3 = """query($id: String!) { project(id: $id) {
      deployments(first: 12) { edges { node {
        id status createdAt updatedAt
        meta { source commit branch commitMsg railwayApiKeyRequesterId }
        creator { name }
      } } }
    } }"""
    safe("deployments", lambda: redact(gql(q3, {"id": PROJECT_ID}, token=token)), R)

    # Q4: service detail for the main service (previous evidence: Jarvis-Nexus 8f8a9401-5e27-4449-a1cb-01271906b8f7)
    #     discovered dynamically from Q2 result instead of hardcoded
    svc_id = None
    try:
        for e in R["queries"]["project"]["project"]["services"]["edges"]:
            if e["node"]["name"] == "Jarvis-Nexus":
                svc_id = e["node"]["id"]
    except Exception:
        pass
    if svc_id:
        q4 = """query($id: String!) { service(id: $id) {
          id name serviceType createdAt updatedAt
          instances { edges { node { id status } } }
          variables(first: 100) { edges { node { name } } }
          volumeMounts { id mountPath }
        } }"""
        safe("service", lambda: redact(gql(q4, {"id": svc_id}, token=token)), R)
        # Q5: current build/deploy status via service builds
        q5 = """query($id: String!) { service(id: $id) { builds(first: 5) { edges { node { id status startedAt endedAt } } } } }"""
        safe("service_builds", lambda: redact(gql(q5, {"id": svc_id}, token=token)), R)

    # Q6: volume detail (persistence + backup strategy need volume facts)
    vol_ids = []
    try:
        for e in R["queries"]["project"]["project"]["volumes"]["edges"]:
            vol_ids.append((e["node"]["id"], e["node"]["name"]))
    except Exception:
        pass
    if vol_ids:
        for vid, vname in vol_ids[:3]:
            q6 = """query($id: String!) { volume(id: $id) { id name mountPath createdAt instance { id } } }"""
            safe(f"volume_{vname}", lambda vid=vid: redact(gql(q6, {"id": vid}, token=token)), R)

    # Q7: database backup facts — environment variables of the postgres service (names only)
    # (look for any postgres service in Q2)
    db_svc = None
    try:
        for e in R["queries"]["project"]["project"]["services"]["edges"]:
            n = e["node"]
            if n["serviceType"] == "postgres" or "postgres" in (n["name"] or "").lower() or "db" in (n["name"] or "").lower():
                db_svc = n
    except Exception:
        pass
    if db_svc:
        R["database_service"] = redact(db_svc)

    out = "NEXUS_WORLD/reports/RAILWAY_STABILITY_AUDIT.json"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(R, f, indent=2, default=str)
    print(f"EVIDENCE WRITTEN: {out}")
    print(json.dumps(R, indent=2, default=str)[:6000])

if __name__ == "__main__":
    main()
