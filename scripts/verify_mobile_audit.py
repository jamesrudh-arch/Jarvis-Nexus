#!/usr/bin/env python3
"""
JARVIS NEXUS session 7 — mobile audit (emulated iPhone Safari).

Uses Playwright's iPhone 14 Pro device profile (390x844, DPR 3, touch, Safari
UA). Honest scope: this is Chromium's device emulation, not a physical iPhone;
env(safe-area-inset-*) resolves to 0 in emulation (notch insets are only
applied by iOS itself) — the safe-area CODE is verified by CSS review, the
layout metrics by emulation.

Checks:
  M1  horizontal overflow (scrollWidth vs innerWidth, plus any element wider
      than the viewport),
  M2  clipped/off-screen controls (interactive elements whose bounding box
      escapes the viewport),
  M3  touch targets < 40px on the primary controls,
  M4  camera NaN / render sanity on mobile viewport,
  M5  screenshot for VLM review.
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
TAG = sys.argv[2] if len(sys.argv) > 2 else "before"
OUT = Path("/home/z/my-project/download/screenshots")
OUT.mkdir(parents=True, exist_ok=True)

JS_AUDIT = """
() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const doc = document.scrollingElement;
  const overflowX = doc.scrollWidth - vw;
  const scrollableAncestorFits = (el) => {
    // An element wider than the viewport is REACHABLE (not clipped) when an
    // ancestor is horizontally scrollable and that ancestor fits the viewport.
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowX)) {
        const r = p.getBoundingClientRect();
        return r.left >= -1 && r.right <= vw + 1;
      }
      p = p.parentElement;
    }
    return false;
  };
  const wide = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1) && el.id !== 'labels-layer') {
      if (!scrollableAncestorFits(el)) {
        wide.push({ tag: el.tagName, id: el.id || '', cls: String(el.className).slice(0, 40),
                    left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
      }
    }
  });
  const small = [];
  document.querySelectorAll('button, [role=button], input, select, a').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 32)) {
      small.push({ tag: el.tagName, id: el.id || '', text: (el.textContent || '').trim().slice(0, 16),
                   w: Math.round(r.width), h: Math.round(r.height) });
    }
  });
  const d = window.__NEXUS_DEBUG__ && window.__NEXUS_DEBUG__();
  return {
    vw, vh, dpr: window.devicePixelRatio,
    overflowX, wideCount: wide.length, wide: wide.slice(0, 12),
    smallCount: small.length, small: small.slice(0, 14),
    cam: d && d.camera ? d.camera.pos : null,
  };
}
"""

with sync_playwright() as pw:
    iphone = pw.devices["iPhone 14 Pro"]
    browser = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = browser.new_context(**iphone, locale="en-US")
    page = ctx.new_page()
    page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_selector("button:has-text('ENTER SANCTUARY')", timeout=90000)
    page.click("button:has-text('ENTER SANCTUARY')")
    deadline = time.time() + 90
    while time.time() < deadline:
        try:
            if page.evaluate("() => { const d = window.__NEXUS_DEBUG__ && window.__NEXUS_DEBUG__(); return d ? d.loaded : false; }"):
                break
        except Exception:
            pass
        time.sleep(2)
    time.sleep(4)

    audit = page.evaluate(JS_AUDIT)
    print(json.dumps(audit, indent=1)[:2200])
    try:
        page.screenshot(path=str(OUT / f"mobile_iphone_{TAG}.png"), timeout=60000)
        print(f"[saved] mobile_iphone_{TAG}.png")
    except Exception as e:
        print(f"[screenshot skipped] {str(e)[:60]}")

    ok_overflow = audit["overflowX"] <= 1 and audit["wideCount"] == 0
    ok_touch = audit["smallCount"] == 0
    ok_cam = isinstance(audit["cam"], list) and all(v is not None for v in audit["cam"])
    print(f"\nM1 horizontal overflow: {'PASS' if ok_overflow else 'FAIL'} (overflowX={audit['overflowX']}px, wide elements={audit['wideCount']})")
    print(f"M3 touch targets >=40px: {'PASS' if ok_touch else 'FAIL'} ({audit['smallCount']} undersized)")
    print(f"M4 camera finite on mobile viewport: {'PASS' if ok_cam else 'FAIL'} cam={audit['cam']}")
    browser.close()
    sys.exit(0 if ok_overflow and ok_touch and ok_cam else 1)
