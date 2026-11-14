#!/usr/bin/env python3
"""Railway GraphQL v2 probe — PRIORITY 1 diagnostics.

Never prints the token value. Queries:
  1. Token validity + workspace
  2. Project reasonable-heart: services, sources, domains, deployments
  3. githubRepoDeploy mutation schema (args, input fields)
  4. Any existing GitHub repo connections visible to this token
"""
import json
import os
import sys
import urllib.request

ENDPOINT = "https://backboard.railway.com/graphql/v2"


def gql(query: str, variables: dict | None = None):
    token = os.environ.get("RAILWAY_TOKEN", "")
    if not token:
        # load from .env without printing
        for line in open("/home/z/my-project/.env"):
            line = line.strip()
            if line.startswith("RAILWAY_TOKEN="):
                token = line.split("=", 1)[1].strip().strip('"').strip("'")
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "nexus-continuation/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")
    except Exception as e:  # noqa: BLE001
        return 0, {"error": str(e)}


def main():
    out = {}

    # 1. workspace + projects
    st, data = gql("""
    query { workspace { id name } projects { edges { node { id name updatedAt } } } }
    """)
    out["workspace_query"] = {"http": st, "data": data.get("data"), "errors": data.get("errors")}
    projects = (data.get("data") or {}).get("projects", {}).get("edges", [])
    target = None
    for edge in projects:
        if edge["node"]["name"] == "reasonable-heart":
            target = edge["node"]
    out["reasonable-heart"] = target

    if target:
        pid = target["id"]
        # 2. full project detail: services + sources + domains + deployments
        st, d2 = gql("""
        query($id: String!) {
          project(id: $id) {
            id name updatedAt
            services { edges { node {
              id name serviceType
              source { image imageRegistryHost imageTag repo branch }
              domains { serviceDomains { id domain status targetPort } }
              deployments { edges { node { id status createdAt } } }
            } } }
            domains { projectDomains { id domain status } }
          }
        }
        """, {"id": pid})
        out["project_detail"] = {"http": st, "data": d2.get("data"), "errors": d2.get("errors")}

    # 3. githubRepoDeploy schema — via introspection of mutation args
    st, d3 = gql("""
    {
      __type(name: "Mutation") {
        fields(includeDeprecated: true) {
          name
          args { name type { kind name ofType { kind name ofType { kind name } } } }
        }
      }
    }
    """)
    muts = ((d3.get("data") or {}).get("__type") or {}).get("fields", [])
    for m in muts:
        if m["name"] in ("githubRepoDeploy", "githubRepoConnectionCreate",
                         "githubRepoConnectionUpdate", "serviceCreate",
                         "serviceInstanceDeploy", "serviceUpdate"):
            out.setdefault("mutations", {})[m["name"]] = m["args"]

    # 4. GitHub repo connections visible to this workspace token
    st, d4 = gql("""
    { workspace { gitHubRepos { id name owner } } }
    """)
    out["github_repos"] = {"http": st, "data": d4.get("data"), "errors": d4.get("errors")}

    # 5. introspect GithubRepoDeployInput shape
    st, d5 = gql("""
    { __type(name: "GithubRepoDeployInput") {
        inputFields { name type { kind name ofType { kind name } } }
    } }
    """)
    out["github_repo_deploy_input"] = {"http": st, "data": d5.get("data"), "errors": d5.get("errors")}

    print(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()
