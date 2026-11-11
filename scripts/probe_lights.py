#!/usr/bin/env python3
"""Definitive: is the white the background clear (RT default) or lit geometry?"""
import asyncio
from playwright.async_api import async_playwright

async def sample(page, label):
    r = await page.evaluate("""() => {
      const cv = document.getElementById('nexus-canvas');
      const c2 = document.createElement('canvas');
      c2.width = 90; c2.height = 56;
      const cx = c2.getContext('2d');
      cx.drawImage(cv, 0, 0, 90, 56);
      const d = cx.getImageData(0, 0, 90, 56).data;
      let white = 0, red = 0; const n = d.length / 4;
      const rows = [];
      for (let y = 0; y < 4; y++) {
        let wr = 0;
        for (let x = 0; x < 90; x++) {
          const i = (y * 14 * 90 + x) * 4;
          const R = d[i], G = d[i+1], B = d[i+2];
          if (R > 242 && G > 242 && B > 242) { white++; wr++; }
          if (R > 200 && G < 80 && B < 80) red++;
        }
        rows.push(wr);
      }
      return { white: white / n * 4, red: red / n * 4, rowWhite: rows };
    }""")
    print(f"{label}: white={r['white']:.3f} red={r['red']:.3f} rows(top->mid)={r['rowWhite']}", flush=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox",
        ])
        page = await browser.new_page(viewport={"width": 900, "height": 560}, device_scale_factor=1)
        page.on("pageerror", lambda e: print(f"[pageerror] {str(e)[:160]}", flush=True))
        page.set_default_timeout(150000)
        await page.goto("http://localhost:3000/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_selector("button.boot-enter", state="attached", timeout=140000)
        await page.wait_for_timeout(1000)
        await page.evaluate("document.querySelector('button.boot-enter')?.click()")
        await page.wait_for_timeout(15000)
        await sample(page, "baseline")

        # 1. Background swap test
        await page.evaluate("window.__nexusClient.sanctuary.scene.background.setRGB(1, 0, 0)")
        await page.wait_for_timeout(5000)
        await sample(page, "bg=RED")

        await page.evaluate("window.__nexusClient.sanctuary.scene.background.setRGB(1,0.25,0.1)")
        await page.wait_for_timeout(4000)
        await sample(page, "bg=ORANGE")

        # 2. Kill architecture lights one by one
        await page.evaluate("window.__nexusClient.sanctuary.scene.background.setRGB(0.008,0.027,0.043)")
        for lightSel, label in [
            ("[...g.children.filter(o => o.isLight)]", "ALL arch lights"),
        ]:
            await page.evaluate(f"""(() => {{
              const s = window.__nexusClient.sanctuary;
              const g = s.architectureGroup;
              s.__lights = g.children.filter(o => o.isLight);
              s.__lights.forEach(l => l.visible = false);
            }})()""")
            await page.wait_for_timeout(5000)
            await sample(page, f"hid {label}")

        # per-light bisection
        info = await page.evaluate("""() => {
          const s = window.__nexusClient.sanctuary;
          return s.__lights.map((l, i) => ({ i, type: l.type, color: '#' + l.color.getHexString(), intensity: l.intensity, dist: l.distance }));
        }""")
        import json
        print("arch lights:", json.dumps(info), flush=True)

        for i in range(len(info)):
            await page.evaluate(f"""(() => {{
              const s = window.__nexusClient.sanctuary;
              s.__lights.forEach(l => l.visible = true);
              s.__lights[{i}].visible = false;
            }})()""")
            await page.wait_for_timeout(4000)
            await sample(page, f"only light[{i}]={info[i]['type']} off")

        await browser.close()

asyncio.run(main())
