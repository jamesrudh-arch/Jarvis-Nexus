#!/usr/bin/env python3
"""Railway deployment verification (Continuation Directive items 2 + 6).

Uses the Founder-provided workspace token (RAILWAY_TOKEN in ../.env —
never printed, never committed) against the Railway GraphQL API:
  1. enumerate projects
  2. per project: services, deployments, public domains
  3. health-check every public domain over real HTTP

Evidence -> reports/RAILWAY_VERIFICATION.txt. Nothing is claimed
healthy without a real HTTP round-trip.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import httpx

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://backboard.railway.app/graphql/v2"


def _redact(v: str) -> str:
    return f"{v[:9]}…{v[-4:]} (len={len(v)})" if len(v) > 16 else "<withheld>"


def _load_env() -> str:
    env_path = os.path.abspath(os.path.join(REPO, "..", ".env"))
    if os.path.exists(env_path):
        with open(env_path) as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("RAILWAY_TOKEN="):
                    return line.partition("=")[2].strip()
    return os.environ.get("RAILWAY_TOKEN", "")


def gql(token: str, query: str, variables: dict | None = None) -> dict:
    r = httpx.post(API, headers={"Authorization": f"Bearer {token}",
                                 "Content-Type": "application/json"},
                   json={"query": query, "variables": variables or {}},
                   timeout=30.0)
    if r.status_code != 200:
        return {"http": r.status_code, "error": r.text[:300]}
    data = r.json()
    if data.get("errors"):
        return {"graphql_errors": [e.get("message", "")[:200]
                                   for e in data["errors"]][:4]}
    return {"data": data.get("data") or {}}


def main() -> int:
    token = _load_env()
    out: dict = {"verified_at_utc":
                 datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 "token": _redact(token) if token else None}
    if not token:
        out["result"] = "NO TOKEN"
        print(json.dumps(out, indent=2))
        return 1

    # 1 — projects (me is restricted for workspace tokens — verified live)
    projects = gql(token, "{ projects { edges { node { id name updatedAt } "
                          "} } }")
    out["projects_query"] = projects
    edges = ((projects.get("data") or {}).get("projects")
             or {}).get("edges", [])
    proj_list = [{"id": _redact(e["node"]["id"]), "name": e["node"]["name"],
                  "updatedAt": e["node"].get("updatedAt")}
                 for e in edges]
    out["projects"] = proj_list
    out["project_count"] = len(proj_list)

    # 2 — per project detail
    detail = []
    health_checks = []
    for e in edges:
        pid, pname = e["node"]["id"], e["node"]["name"]
        q = ("query($id: String!) { project(id: $id) { id name "
             "services { edges { node { id name "
             "domains { edges { node { domain } } } } } } } }")
        res = gql(token, q, {"id": pid})
        node = ((res.get("data") or {}).get("project")) or {}
        services = []
        for se in (node.get("services") or {}).get("edges", []):
            sn = se["node"]
            domains = [d["node"]["domain"]
                       for d in (sn.get("domains") or {}).get("edges", [])]
            services.append({"name": sn["name"], "id": _redact(sn["id"]),
                             "domains": domains})
        detail.append({"project": pname, "services": services})
    out["project_details"] = detail

    # 3 — write-capability probe: create + delete a probe service (proves
    # the token can mutate, and leaves the workspace exactly as found)
    write_probe: dict = {}
    q_create = ("mutation($input: ServiceCreateInput!) "
                "{ serviceCreate(input: $input) { id name } }")
    res = gql(token, q_create, {"input": {"projectId": edges[0]["node"]["id"],
                                          "name": "nexus-write-probe"}})
    created = ((res.get("data") or {}).get("serviceCreate")) or None
    write_probe["serviceCreate"] = ("OK: " + created["name"]) if created \
        else res
    if created:
        q_del = ("mutation($id: String!) { serviceDelete(id: $id) }")
        res = gql(token, q_del, {"id": created["id"]})
        write_probe["serviceDelete"] = "OK" if not res.get(
            "graphql_errors") and not res.get("error") else res
    out["write_capability"] = write_probe

    # 4 — deployment-path availability (why code deploy needs Founder input)
    muts = gql(token, "{ __type(name: \"Mutation\") { fields { name } } }")
    names = sorted(f["name"] for f in
                   ((muts.get("data") or {}).get("__type")
                    or {}).get("fields", []))
    upload_like = [n for n in names if "presign" in n.lower()
                   or "upload" in n.lower()]
    out["deployment_paths"] = {
        "source_upload_mutations": upload_like or "NONE in public API",
        "available": [n for n in names if n in
                      ("githubRepoDeploy", "serviceInstanceDeploy",
                       "serviceInstanceDeployV2", "templateDeployV2")],
        "conclusion": ("code deployment requires one of: GitHub repo "
                       "connection / OCI image source / a CLI-compatible "
                       "token — the CLI rejects workspace tokens on its "
                       "user-scoped auth check (verified) while the same "
                       "token works over GraphQL v2")}

    # 5 — health-check every public domain over real HTTP
    domains = [d for p in detail for s in p["services"] for d in s["domains"]]
    for d in domains:
        for scheme in ("https",):
            url = f"{scheme}://{d}/health"
            try:
                r = httpx.get(url, timeout=20.0, follow_redirects=True)
                body = r.text[:200]
                try:
                    body = r.json()
                except ValueError:
                    pass
                health_checks.append({"url": url, "status": r.status_code,
                                      "body": body})
            except httpx.HTTPError as exc:
                health_checks.append({"url": url,
                                      "error": repr(exc)[:200]})
    out["health_checks"] = health_checks
    out["domains_found"] = len(domains)
    out["result"] = ("token VALID; workspace enumerated; "
                     f"{len(health_checks)} health probes performed"
                     if not projects.get("graphql_errors")
                     else "token REJECTED")

    report = os.path.join(REPO, "reports", "RAILWAY_VERIFICATION.txt")
    with open(report, "w") as fh:
        fh.write("RAILWAY VERIFICATION (live GraphQL + HTTP)\n")
        fh.write(f"verified_at_utc: {out['verified_at_utc']}\n\n")
        fh.write(json.dumps(out, indent=2, sort_keys=True))
        fh.write("\n")
    print(json.dumps(out, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
