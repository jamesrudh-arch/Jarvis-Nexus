#!/usr/bin/env python3
"""Railway final verification — scrubbed (names only, never values)."""
import json
import time
import urllib.error
import urllib.request

ENDPOINT = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.0"
SVC = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
ENV = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
PROJ = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
DEP = "8128960e-edf7-4a0f-88f2-dfde6964d168"


def gql(query, variables=None):
    token = ""
    for line in open("/home/z/my-project/.env"):
        line = line.strip()
        if line.startswith("RAILWAY_TOKEN="):
            token = line.split("=", 1)[1].strip().strip('"').strip("'")
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json",
                 "User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:  # noqa: BLE001
            return e.code, {}
    except Exception as e:  # noqa: BLE001
        return 0, {"error": str(e)}


out = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
       "note": "variable VALUES deliberately not recorded — names only"}

st, d2 = gql("query($p: String!, $e: String!) { variables(projectId: $p, "
             "environmentId: $e) }", {"p": PROJ, "e": ENV})
variables = ((d2.get("data") or {}).get("variables")) or {}
out["variables"] = {"http": st, "count": len(variables),
                    "names": sorted(variables.keys())}

st, d = gql('query($s: String!) { domains(serviceId: $s) { '
            'serviceDomains { domain syncStatus targetPort suffix } '
            'customDomains { domain } } }', {"s": SVC})
out["domains"] = {"http": st, "data": d.get("data"),
                  "errors": [e.get("message")
                             for e in (d.get("errors") or [])][:2]}

st, d5 = gql('{ __type(name: "Log") { fields { name } } }')
node = (d5.get("data") or {}).get("__type") or {}
lf = [f["name"] for f in (node.get("fields") or [])]
out["log_fields"] = lf
if lf:
    sel = " ".join(f for f in ("timestamp", "message", "severity")
                   if f in lf)
    st, d6 = gql("query($id: String!) { deploymentLogs(deploymentId: $id)"
                 " { %s } }" % sel, {"id": DEP})
    logs = ((d6.get("data") or {}).get("deploymentLogs")) or []
    out["deployment_logs"] = {
        "http": st, "count": len(logs),
        "tail": [str(l.get("message"))[:110] for l in logs[-12:]],
        "errors": [e.get("message") for e in (d6.get("errors") or [])][:2]}

print(json.dumps(out, indent=1, default=str)[:3500])
with open("/home/z/my-project/NEXUS_WORLD/reports/RAILWAY_PRIORITY1_VERIFY.json",
          "w") as f:
    json.dump(out, f, indent=1, default=str)
