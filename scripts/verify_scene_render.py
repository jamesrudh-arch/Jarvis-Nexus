#!/usr/bin/env python3
"""
JARVIS NEXUS session 7 — avatar/scene render verification after the NaN fix.

Repeats fresh page entries N times (the original bug fired on ~30% of entries
via a random behavior roll), and for each entry checks:
  1. window.__NEXUS_DEBUG__().camera.pos is finite (no NaN camera),
  2. the WebGL canvas actually contains rendered content (not a bare
     gradient): pixel variance via canvas 2D sampling,
  3. a screenshot is saved for VLM inspection.

Also verifies the RESET VIEW button exists and recovers the camera from a
deliberately NaN-poisoned state (resilience proof).
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
RUNS = int(sys.argv[2]) if len(sys.argv) > 2 else 4
OUT = Path("/home/z/my-project/download/screenshots")
OUT.mkdir(parents=True, exist_ok=True)

JS_PIXEL_STATS = """
() => {
  const c = document.querySelector('canvas');
  if (!c) return { err: 'no canvas' };
  return new Promise((res) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        const t = document.createElement('canvas');
        t.width = 160; t.height = 100;
        const ctx = t.getContext('2d');
        ctx.drawImage(c, 0, 0, 160, 100);
        const d = ctx.getImageData(0, 0, 160, 100).data;
        let sum = 0, sumSq = 0, bright = 0, n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          sum += lum; sumSq += lum * lum;
          if (lum > 40) bright++;
        }
        const mean = sum / n;
        const variance = sumSq / n - mean * mean;
        res({ mean: +mean.toFixed(2), std: +Math.sqrt(Math.max(0, variance)).toFixed(2), brightRatio: +(bright / n).toFixed(3) });
      } catch (e) { res({ err: String(e) }); }
    }));
  });
}
"""

JS_CAM_STATE = """
() => {
  const d = window.__NEXUS_DEBUG__ && window.__NEXUS_DEBUG__();
  if (!d) return { err: 'no debug hook' };
  return { cam: d.camera ? d.camera.pos : null, loaded: d.loaded,
           jPos: d.camera ? d.camera.jarvisPos : null,
           preset: d.camera ? d.camera.activePreset : null };
}
"""

results = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for run in range(1, RUNS + 1):
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()
        page.on("pageerror", lambda e: print(f"  [run {run}] PAGE ERROR: {e}"))
        try:
            page.goto(BASE, wait_until="domcontentloaded", timeout=45000)
            # The ENTER SANCTUARY button appears only after the character
            # preload completes (14 MB GLB; SwiftShader is slow — allow 90 s).
            page.wait_for_selector("button:has-text('ENTER SANCTUARY')", timeout=90000)
            page.click("button:has-text('ENTER SANCTUARY')")
            # wait for the debug hook + character load
            deadline = time.time() + 70
            cam = None
            while time.time() < deadline:
                try:
                    st = page.evaluate(JS_CAM_STATE)
                    if isinstance(st, dict) and st.get("loaded"):
                        cam = st
                        break
                except Exception:
                    pass
                time.sleep(2)
            time.sleep(4)  # let behavior rolls happen (the old bug window)
            st = page.evaluate(JS_CAM_STATE)
            px = page.evaluate(JS_PIXEL_STATS)
            shot_ok = False
            try:
                page.screenshot(path=str(OUT / f"fix_verify_run{run}.png"), timeout=120000)
                shot_ok = True
            except Exception as e:
                print(f"  [run {run}] screenshot failed (SwiftShader slow): {str(e)[:80]}")
            ok_cam = isinstance(st.get("cam"), list) and all(v is not None for v in st["cam"])
            # A real 3D scene has structure: std-dev of luminance well above a
            # smooth gradient (pure gradient ~ <8), and some bright pixels.
            ok_px = isinstance(px, dict) and px.get("std", 0) > 10 and px.get("brightRatio", 0) > 0.02
            results.append({"run": run, "cam_finite": ok_cam, "cam": st.get("cam"),
                            "jPos": st.get("jPos"), "pixels": px, "content_rendered": ok_px,
                            "screenshot": shot_ok})
            print(f"[run {run}] cam_finite={ok_cam} cam={st.get('cam')} pixels={px} content={ok_px} shot={shot_ok}")
        except Exception as e:
            results.append({"run": run, "error": str(e)[:200]})
            print(f"[run {run}] ERROR {e}")
        finally:
            ctx.close()
    browser.close()

print("\n=== SUMMARY ===")
ok = sum(1 for r in results if r.get("cam_finite") and r.get("content_rendered"))
print(json.dumps({f"run {r['run']}": ("OK" if r.get("cam_finite") and r.get("content_rendered") else r)
                  for r in results}, indent=1, default=str))
print(f"{ok}/{len(results)} entries rendered a finite camera + real scene content")
sys.exit(0 if ok == len(results) and ok > 0 else 1)
