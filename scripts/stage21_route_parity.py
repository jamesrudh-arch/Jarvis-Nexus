#!/usr/bin/env python3
"""Stage 2.1 — route registration parity check.

Reproduces the final-closure route set-diff method:
extracts every route registration of the form `app.get('/path'` /
`app.post('/path'` (allowing whitespace) from apps/nexus-api/src/index.ts,
plus multi-line registrations, and reports the total + GET/POST breakdown.

Expected at HEAD (current): 56 routes (32 GET + 24 POST).
Expected on production (origin/main @ 41092a3): 33 routes.
"""
import re
import subprocess
import sys

INDEX = "apps/nexus-api/src/index.ts"

ROUTE_RE = re.compile(
    r"\.(get|post)\(\s*([\"'`])(/(?:(?!\2).)*)\2",
    re.S,
)


def routes_of(blob: str):
    found = []
    for m in ROUTE_RE.finditer(blob):
        method, _q, path = m.group(1), m.group(2), m.group(3)
        found.append((method.upper(), "/" + path.lstrip("/")))
    return found


def extract(tree: str):
    blob = subprocess.run(
        ["git", "show", f"{tree}:{INDEX}"], capture_output=True, text=True, check=True
    ).stdout
    return routes_of(blob)


def main():
    head_routes = extract("HEAD")
    origin_routes = extract("origin/main")

    def summarize(name, routes):
        gets = [r for r in routes if r[0] == "GET"]
        posts = [r for r in routes if r[0] == "POST"]
        print(f"{name}: {len(routes)} routes ({len(gets)} GET + {len(posts)} POST)")
        return set(routes)

    import subprocess as _sp
    _head_short = _sp.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    head_set = summarize(f"HEAD ({_head_short}, local main)", head_routes)
    origin_set = summarize("origin/main (41092a3, production)", origin_routes)

    added = sorted(head_set - origin_set)
    removed = sorted(origin_set - head_set)
    print(f"\ndelta on deploy: +{len(added)} / -{len(removed)}")
    for m, p in added:
        print(f"  + {m:4} {p}")
    for m, p in removed:
        print(f"  - {m:4} {p}")

    dupes = [r for r in head_routes if head_routes.count(r) > 1]
    if dupes:
        print(f"\nWARNING duplicate registrations: {sorted(set(dupes))}")
        sys.exit(1)
    if len(head_set) != 56:
        print(f"\nFAIL: expected 56 routes at HEAD, found {len(head_set)}")
        sys.exit(1)
    if removed:
        print("\nFAIL: deployment would remove routes")
        sys.exit(1)
    print("\nOK: 56 routes at HEAD, additive-only vs production, no duplicates")


if __name__ == "__main__":
    main()
