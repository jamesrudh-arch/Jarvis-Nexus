#!/usr/bin/env python3
"""Capture live screenshots of the JARVIS NEXUS sanctuary at multiple camera framings."""
import asyncio, sys, os
from playwright.async_api import async_playwright

OUT = "/home/z/my-project/download/screenshots"
os.makedirs(OUT, exist_ok=True)

SHOTS = [
    ("current_wide",      "window.__nexus?.setCameraPreset && window.__nexus.setCameraPreset('wide');", 9000),
    ("current_closeup",   "window.__nexus?.setCameraPreset && window.__nexus.setCameraPreset('closeup');", 9000),
    ("current_zone_walk", "window.__nexus?.debugWalk && window.__nexus.debugWalk();", 9000),
]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--disable-gpu-sandbox", "--no-sandbox",
        ])
        page = await browser.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
        page.on("console", lambda m: m.type in ("error", "warning") and print(f"[console:{m.type}] {m.text[:220]}"))
        page.on("pageerror", lambda e: print(f"[pageerror] {str(e)[:300]}"))
        await page.goto("http://localhost:3000/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)
        # Dismiss boot overlay if present (click begin button)
        for sel in ["text=/BEGIN|ENTER|START|INITIATE/i", "button:has-text('Wake')", "button:has-text('Begin')"]:
            try:
                btn = page.locator(sel).first
                if await btn.is_visible(timeout=1500):
                    await btn.click()
                    print(f"clicked {sel}")
                    break
            except Exception:
                pass
        await page.wait_for_timeout(5000)

        # Enumerate what's on window
        info = await page.evaluate("() => ({ nexus: !!window.__nexus, keys: window.__nexus ? Object.keys(window.__nexus) : [] })")
        print("window.__nexus:", info)

        for name, js, settle in SHOTS:
            try:
                await page.evaluate(js)
            except Exception as e:
                print(f"{name}: js eval skipped ({str(e)[:100]})")
            await page.wait_for_timeout(settle)
            await page.screenshot(path=f"{OUT}/{name}.png")
            print(f"saved {name}")

        await browser.close()

asyncio.run(main())
