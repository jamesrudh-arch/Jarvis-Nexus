#!/usr/bin/env python3
"""Is the white the WebGL canvas or a DOM element on top of it?"""
import asyncio
from playwright.async_api import async_playwright

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
        await page.wait_for_timeout(15000)

        probe = await page.evaluate("""() => {
          const W = innerWidth, H = innerHeight;
          const pts = [[W/2,H/2],[W/2,H*0.3],[W/2,H*0.75],[W*0.25,H/2],[W*0.8,H/2]];
          const out = [];
          for (const [x,y] of pts) {
            const el = document.elementFromPoint(x, y);
            out.push({
              at: [x|0, y|0],
              tag: el?.tagName,
              id: el?.id,
              cls: String(el?.className).slice(0, 60),
              zIndex: el ? getComputedStyle(el).zIndex : null,
              bg: el ? getComputedStyle(el).backgroundColor : null,
            });
          }
          // Also list all elements with large area + light background
          const big = [];
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width > innerWidth*0.8 && r.height > innerHeight*0.8) {
              const cs = getComputedStyle(el);
              big.push({tag: el.tagName, id: el.id, cls: String(el.className).slice(0,50), bg: cs.backgroundColor, zi: cs.zIndex, opacity: cs.opacity, display: cs.display});
            }
          }
          return {pts: out, big};
        }""")
        import json
        print(json.dumps(probe, indent=1)[:3000], flush=True)

        # Direct canvas pixel sample
        cvcheck = await page.evaluate("""() => {
          const cv = document.getElementById('nexus-canvas');
          const c2 = document.createElement('canvas');
          c2.width = 8; c2.height = 5;
          const cx = c2.getContext('2d');
          cx.drawImage(cv, 0, 0, 8, 5);
          return Array.from(cx.getImageData(0,0,8,5).data).filter((_,i)=>i%4!==3);
        }""")
        print("canvas pixels (8x5 rgb):", cvcheck, flush=True)

        await browser.close()

asyncio.run(main())
