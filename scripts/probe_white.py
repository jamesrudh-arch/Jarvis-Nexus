#!/usr/bin/env python3
"""Probe: find which scene element causes the white frame, by toggling groups."""
import asyncio, time
from playwright.async_api import async_playwright

OUT = "/home/z/my-project/download/screenshots"

async def white_ratio(page):
    return await page.evaluate("""() => {
      const cv = document.getElementById('nexus-canvas');
      const c2 = document.createElement('canvas');
      c2.width = 90; c2.height = 56;
      const cx = c2.getContext('2d');
      cx.drawImage(cv, 0, 0, 90, 56);
      const d = cx.getImageData(0, 0, 90, 56).data;
      let white = 0; const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 242 && d[i+1] > 242 && d[i+2] > 242) white++;
      }
      return white / n;
    }""")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox",
        ])
        page = await browser.new_page(viewport={"width": 900, "height": 560}, device_scale_factor=1)
        page.on("pageerror", lambda e: print(f"[pageerror] {str(e)[:200]}", flush=True))
        page.set_default_timeout(150000)
        await page.goto("http://localhost:3000/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_selector("button.boot-enter", state="attached", timeout=140000)
        await page.wait_for_timeout(1000)
        await page.evaluate("document.querySelector('button.boot-enter')?.click()")
        print("entered", flush=True)

        await page.wait_for_timeout(20000)  # let SwiftShader warm up
        r = await white_ratio(page)
        print(f"baseline white ratio: {r:.3f}", flush=True)

        toggles = [
            ("bloom disabled", "s.bloomPass.enabled = false"),
            ("architecture hidden", "s.architectureGroup.visible = false"),
            ("jarvis hidden", "s.jarvis.root.visible = false"),
            ("reflector hidden", "s.floorReflector.visible = false"),
            ("media wall hidden", "s.mediaScreenMat && (s.mediaScreenMat.map = null, s.mediaScreenMat.needsUpdate = true)"),
            ("vignette disabled", "s.vignettePass.enabled = false"),
        ]
        for label, expr in toggles:
            await page.evaluate(f"(() => {{ const s = window.__nexusClient?.sanctuary; if (s) {{ {expr}; }} }})()")
            await page.wait_for_timeout(6000)
            r = await white_ratio(page)
            print(f"after [{label}]: white={r:.3f}", flush=True)
            # revert toggle
            revert = {
                "bloom disabled": "s.bloomPass.enabled = true",
                "architecture hidden": "s.architectureGroup.visible = true",
                "jarvis hidden": "s.jarvis.root.visible = true",
                "reflector hidden": "s.floorReflector.visible = true",
                "media wall hidden": "s.mediaScreenMat && (s.mediaScreenMat.map = s.schlierenFeed.texture, s.mediaScreenMat.needsUpdate = true)",
                "vignette disabled": "s.vignettePass.enabled = true",
            }[label]
            await page.evaluate(f"(() => {{ const s = window.__nexusClient?.sanctuary; if (s) {{ {revert}; }} }})()")

        # renderer info
        info = await page.evaluate("""() => {
          const s = window.__nexusClient?.sanctuary;
          const r = s?.renderer;
          return r ? { calls: r.info.render.calls, triangles: r.info.render.triangles, geoms: r.info.memory.geometries, tex: r.info.memory.textures, frame: r.info.render.frame } : null;
        }""")
        print("renderer info:", info, flush=True)

        await browser.close()

asyncio.run(main())
