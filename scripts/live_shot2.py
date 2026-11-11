#!/usr/bin/env python3
"""Capture live screenshots of the JARVIS NEXUS sanctuary - full flow with boot + presets + scenario."""
import asyncio, sys, os, json
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
        page = await browser.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
        page.on("console", lambda m: m.type == "error" and print(f"[console:err] {m.text[:250]}"))
        page.on("pageerror", lambda e: print(f"[pageerror] {str(e)[:300]}"))
        await page.goto("http://localhost:3000/", wait_until="domcontentloaded", timeout=60000)

        # Wait for the Enter Sanctuary button (character 14MB load may take a while)
        try:
            await page.wait_for_selector("button.boot-enter", state="visible", timeout=90000)
            print("boot ready")
        except Exception:
            html = await page.content()
            print("BOOT BUTTON NEVER APPEARED; status text:", page.locator(".boot-status").inner_text() if await page.locator(".boot-status").count() else "?")
        await page.wait_for_timeout(1200)
        btn = page.locator("button.boot-enter")
        if await btn.count():
            await btn.click()
            print("entered sanctuary")
        await page.wait_for_timeout(6500)

        # Enumerate client
        info = await page.evaluate("""() => {
          const c = window.__nexusClient;
          if (!c) return { exists: false };
          return { exists: true, methods: Object.getOwnPropertyNames(Object.getPrototypeOf(c)).concat(Object.keys(c)) };
        }""")
        print("client methods:", json.dumps(info)[:800])

        # Get scenario list from the API
        scen = await page.evaluate("fetch('/api/v1/scenarios').then(r => r.json())")
        ids = [s.get('id') for s in scen.get('scenarios', [])]
        print("scenarios:", ids)

        # Shot 1: living presence (default)
        await page.screenshot(path=f"{OUT}/live_living_presence.png"); print("saved live_living_presence")

        # Shot 2: conversation closeup
        await page.evaluate("window.__nexusClient.setCameraPreset('conversation')")
        await page.wait_for_timeout(3500)
        await page.screenshot(path=f"{OUT}/live_conversation_closeup.png"); print("saved live_conversation_closeup")

        # Shot 3: wide sanctuary
        await page.evaluate("window.__nexusClient.setCameraPreset('wide_sanctuary')")
        await page.wait_for_timeout(3500)
        await page.screenshot(path=f"{OUT}/live_wide_sanctuary.png"); print("saved live_wide_sanctuary")

        # Shot 4: activate first scenario and frame the stage
        if ids:
            await page.evaluate(f"window.__nexusClient.activateScenario('{ids[0]}')")
            await page.wait_for_timeout(6500)
            await page.screenshot(path=f"{OUT}/live_scenario_stage.png"); print("saved live_scenario_stage")

        await browser.close()

asyncio.run(main())
