#!/usr/bin/env python3
"""
Railway workspace token verification + project enumeration (READ-ONLY).
- Loads RAILWAY_TOKEN from .env (never prints it)
- Step 1: /me query (auth validity)
- Step 2: project enumeration
Writes structured findings to stdout; exit code 0 on verified auth.
"""
import json
import sys
import urllib.request
import urllib.error

ENV_PATH = "/home/z/my-project/.env"
GQL = "https://backboard.railway.com/graphql/v2"
UA = "nexus-continuation/1.1"


def load_env(path=ENV_PATH):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


def gql(query, variables=None, token=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    headers = {"Content-Type": "application/json", "User-Agent": UA,
               "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(GQL, data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode()[:600]
        except Exception:
            detail = ""
        return None, f"HTTP {e.code}: {detail}"
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


def main():
    env = load_env()
    token = env.get("RAILWAY_TOKEN", "")
    if not token:
        print("FAIL: RAILWAY_TOKEN missing in .env")
        return 2
    print(f"[token] loaded from .env, prefix={token[:9]}****, len={len(token)}")

    # --- Step 1: whoami ---
    r, err = gql("query { me { id name email } }", token=token)
    if err:
        print(f"[auth] FAILED -> {err}")
        return 1
    if "errors" in r and r.get("errors"):
        print(f"[auth] GraphQL errors -> {json.dumps(r['errors'])[:500]}")
        return 1
    me = (r.get("data") or {}).get("me")
    if not me:
        print(f"[auth] No 'me' payload -> {json.dumps(r)[:500]}")
        return 1
    print(f"[auth] OK  user={me.get('name')}  email={me.get('email')}  id={me.get('id')}")

    # --- Step 2: projects ---
    q = """
    query {
      me {
        projects(first: 50) {
          edges { node { id name createdAt updatedAt } }
        }
      }
    }
    """
    r, err = gql(q, token=token)
    if err:
        print(f"[projects] query error -> {err}")
        return 1
    edges = (((r.get("data") or {}).get("me") or {}).get("projects") or {}).get("edges") or []
    if not edges:
        print("[projects] none returned (check token scope)")
        return 0
    print(f"[projects] {len(edges)} found:")
    target = None
    for e in edges:
        n = e.get("node") or {}
        print(f"  - {n.get('name')}  id={n.get('id')}  created={n.get('createdAt')}")
        if n.get("name") == "reasonable-heart":
            target = n
    if target:
        print(f"[target] reasonable-heart FOUND id={target['id']}")
    else:
        print("[target] reasonable-heart NOT in list — will inspect all names above")
    return 0


if __name__ == "__main__":
    sys.exit(main())
