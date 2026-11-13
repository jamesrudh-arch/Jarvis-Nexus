#!/usr/bin/env python3
"""JARVIS NEXUS — living-residents live-scene verification (directive s4).

Headless Chromium: loads the sanctuary, asserts the ResidentDirector state
via the dev debug hook (__NEXUS_DEBUG__.residents):
  * 4 residents present with finite positions inside the wander disc
  * at least one resident MOVED between two samples several seconds apart
    (autonomous behaviour actually running, not a static decoration)
  * camera stays finite (NaN armor intact alongside the new director)
"""

import json
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3111"


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until="domcontentloaded", timeout=60_000)
        # poll for the debug hook + residents (boot time varies with model load)
        sample1 = None
        for _ in range(30):
            page.wait_for_timeout(1_500)
            try:
                sample1 = page.evaluate("window.__NEXUS_DEBUG__ && window.__NEXUS_DEBUG__()")
            except Exception:
                sample1 = None
            if sample1 and sample1.get("residents"):
                break
        if not sample1 or not sample1.get("residents"):
            print("FAIL: no residents in the debug hook — director not wired?")
            print(json.dumps(sample1, indent=2)[:500] if sample1 else "no debug output")
            if errors:
                print("page errors:", errors[:5])
            browser.close()
            sys.exit(1)

        checks = []

        def check(name, ok, detail=""):
            checks.append(ok)
            print(f"  {'PASS' if ok else 'FAIL'} — {name} {detail}")

        res1 = sample1["residents"]
        check("4 residents present", len(res1) == 4, f"({len(res1)})")
        all_finite = all(
            isinstance(r.get("x"), (int, float)) and isinstance(r.get("z"), (int, float))
            and abs(r["x"]) < 13.5 and abs(r["z"]) < 13.5
            and r["x"] == r["x"] and r["z"] == r["z"]  # NaN check
            for r in res1
        )
        check("all positions finite + inside the disc", all_finite)

        page.wait_for_timeout(7_000)
        sample2 = page.evaluate("window.__NEXUS_DEBUG__()")
        res2 = {r["id"]: r for r in sample2["residents"]}
        moved = [r["id"] for r in res1
                 if abs(res2[r["id"]]["x"] - r["x"]) + abs(res2[r["id"]]["z"] - r["z"]) > 0.15]
        check("autonomous movement between samples", len(moved) >= 1,
              f"(moved: {', '.join(moved) or 'none'})")

        cam = sample2.get("rootPos")
        check("jarvis root finite (NaN armor intact)", bool(cam) and all(
            v == v for v in cam), f"({cam})")

        check("zero page errors", len(errors) == 0, f"({errors[:2]})")

        browser.close()
        passed = sum(checks)
        print(f"[residents-verify] {passed}/{len(checks)} checks passed")
        sys.exit(0 if passed == len(checks) else 1)


if __name__ == "__main__":
    main()
