#!/usr/bin/env python3
"""Bisect WHICH architecture mesh whites out the frame."""
import asyncio, json
from playwright.async_api import async_playwright

async def white_ratio(page):
    return await page.evaluate("""() => {
      const cv = document.getElementById('nexus-canvas');
      const c2 = document.createElement('canvas');
      c2.width = 90; c2.height = 56;
      const cx = c2.getContext('2d');
      cx.drawImage(cv, 0, 0, 90, 56);
      const d = cx.getImageData(0, 0, 90, 56).data;
      let white = 0; const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 242 && d[i+1] > 242 && d[i+2] > 242) white++;
      return white / n;
    }""")

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
        print(f"baseline: {await white_ratio(page):.3f}", flush=True)

        # Classify architecture children into families (no THREE global — raw params)
        await page.evaluate("""() => {
          const s = window.__nexusClient.sanctuary;
          const g = s.architectureGroup;
          s.__fam = { floor: [], walls: [], ceiling: [], cones: [], rings: [], dais: [], table: [], screens: [], other: [] };
          const fam = s.__fam;
          const rad = (m) => (m.geometry?.parameters?.radius ?? m.geometry?.parameters?.radiusTop ?? 0);
          for (const o of g.children) {
            o.traverse?.((m) => {
              if (!m.isMesh && !m.isPoints) return;
              const t = m.geometry?.type || '';
              const P = m.geometry?.parameters || {};
              const y = m.position?.y ?? 0;
              if (m === s.floorReflector || (t === 'CircleGeometry' && P.radius > 10)) fam.floor.push(m);
              else if (t === 'ConeGeometry') fam.cones.push(m);
              else if (t === 'BoxGeometry' && P.height > 5 && P.width > 4) fam.walls.push(m);
              else if (y > 5.0) fam.ceiling.push(m);
              else if (t === 'CylinderGeometry' && P.height < 0.2 && P.radiusTop > 3) fam.dais.push(m);
              else if (t === 'TorusGeometry' || t === 'TorusKnotGeometry') fam.rings.push(m);
              else if (t === 'PlaneGeometry' && P.width > 2) fam.screens.push(m);
              else if (t === 'CylinderGeometry' && y < 1.0 && y > 0.4) fam.table.push(m);
              else fam.other.push(m);
            });
          }
        }""")

        fams = await page.evaluate("() => { const f = window.__nexusClient.sanctuary.__fam; const o = {}; for (const k in f) o[k] = f[k].length; return o; }")
        print("families:", fams, flush=True)

        for fam in fams:
            await page.evaluate(f"""() => {{
              const s = window.__nexusClient.sanctuary;
              for (const m of s.__fam['{fam}']) m.visible = false;
            }}""")
            await page.wait_for_timeout(5000)
            r = await white_ratio(page)
            print(f"hidden [{fam}]: white={r:.3f}", flush=True)
            await page.evaluate(f"""() => {{
              const s = window.__nexusClient.sanctuary;
              for (const m of s.__fam['{fam}']) m.visible = true;
            }}""")

        await browser.close()

asyncio.run(main())
