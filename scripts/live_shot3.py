#!/usr/bin/env python3
"""Capture live screenshots of the JARVIS NEXUS sanctuary - smaller viewport for software GL."""
import asyncio, sys, os, json
from playwright.async_api import async_playwright

OUT = "/home/z/my-project/download/screenshots"
os.makedirs(OUT, exist_ok=True)

async def shot(page, name, settle=3000):
    await page.wait_for_timeout(settle)
    await page.screenshot(path=f"{OUT}/{name}.png", timeout=90000)
    print("saved", name, flush=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--disable-gpu-sandbox", "--no-sandbox",
        ])
        page = await browser.new_page(viewport={"width": 960, "height": 600}, device_scale_factor=1)
        page.on("console", lambda m: m.type == "error" and print(f"[console:err] {m.text[:250]}", flush=True))
        page.on("pageerror", lambda e: print(f"[pageerror] {str(e)[:300]}", flush=True))
        await page.goto("http://localhost:3000/", wait_until="domcontentloaded", timeout=60000)

        try:
            await page.wait_for_selector("button.boot-enter", state="attached", timeout=120000)
            print("boot ready", flush=True)
        except Exception:
            cnt = await page.locator(".boot-status").count()
            print("BOOT BUTTON NEVER APPEARED; status:", await page.locator(".boot-status").inner_text() if cnt else "?", flush=True)
        await page.wait_for_timeout(1500)
        btn = page.locator("button.boot-enter")
        if await btn.count():
            await btn.click(force=True, timeout=30000)
            print("entered sanctuary", flush=True)

        # Lower pixel ratio to make software rendering viable for screenshots
        await page.evaluate("window.__nexusClient?.sanctuary?.renderer?.setPixelRatio(0.8)")
        await page.wait_for_timeout(6000)

        scen = await page.evaluate("fetch('/api/v1/scenarios').then(r => r.json())")
        ids = [s.get('id') for s in scen.get('scenarios', [])]
        print("scenarios:", ids, flush=True)

        await shot(page, "live_living_presence", 2000)

        await page.evaluate("window.__nexusClient.setCameraPreset('conversation')")
        await shot(page, "live_conversation_closeup")

        await page.evaluate("window.__nexusClient.setCameraPreset('wide_sanctuary')")
        await shot(page, "live_wide_sanctuary")

        if ids:
            await page.evaluate(f"window.__nexusClient.activateScenario('{ids[0]}')")
            await shot(page, "live_scenario_stage", 7000)

        await browser.close()

asyncio.run(main())
