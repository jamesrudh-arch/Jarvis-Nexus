#!/usr/bin/env python3
"""Quick audit screenshots of the current NEXUS sanctuary state."""
import asyncio, os, sys
from playwright.async_api import async_playwright

OUT = "/home/z/my-project/download/screenshots"
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--disable-gpu-sandbox", "--no-sandbox",
        ])
        page = await browser.new_page(viewport={"width": 900, "height": 560}, device_scale_factor=1)
        page.on("console", lambda m: m.type == "error" and print(f"[err] {m.text[:200]}", flush=True))
        page.on("pageerror", lambda e: print(f"[pageerror] {str(e)[:250]}", flush=True))
        page.set_default_timeout(120000)
        await page.goto("http://localhost:3000/", wait_until="domcontentloaded", timeout=60000)

        try:
            await page.wait_for_selector("button.boot-enter", state="attached", timeout=120000)
        except Exception:
            print("boot button missing", flush=True)
        await page.wait_for_timeout(1200)
        btn = page.locator("button.boot-enter")
        if await btn.count():
            await btn.click(force=True, timeout=30000)
            print("entered", flush=True)

        await page.evaluate("window.__nexusClient?.sanctuary?.renderer?.setPixelRatio(0.7)")
        await page.wait_for_timeout(12000)  # let the model + animations settle

        await page.screenshot(path=f"{OUT}/audit_wide.png", timeout=90000)
        print("saved audit_wide", flush=True)

        await page.evaluate("window.__nexusClient.setCameraPreset('conversation')")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=f"{OUT}/audit_closeup.png", timeout=90000)
        print("saved audit_closeup", flush=True)

        await browser.close()

asyncio.run(main())
