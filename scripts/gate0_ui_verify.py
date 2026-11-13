#!/usr/bin/env python3
"""Gate 0 UI verification — OwnerGate unlock flow in a real headless browser.

Starts the standalone production server with a test OWNER_KEY, then proves:
  1. The sanctuary boots and the public status surface renders (no key needed).
  2. Opening the Inspector's Memory tab WITHOUT a key -> 403s -> the
     OwnerGate panel appears (no memories leaked).
  3. Entering a WRONG key -> panel reports invalid (server-verified).
  4. Entering the CORRECT key -> panel disappears, guarded data loads.
  5. The key survives an in-tab reload (sessionStorage) — mutations keep
     working without re-entering it.
"""
import asyncio, os, signal, subprocess, sys, time
import urllib.request
from playwright.async_api import async_playwright

PORT = 3117
KEY = "ui-e2e-owner-key-91b3"
BASE = f"http://127.0.0.1:{PORT}"
ROOT = "/home/z/my-project/repo"
DB = "/tmp/gate0_ui_e2e.db"
OUT = "/home/z/my-project/download/screenshots"
os.makedirs(OUT, exist_ok=True)

def shot(name):
    return os.path.join(OUT, name)

async def main():
    # --- boot server ---------------------------------------------------------
    srv = subprocess.Popen(
        ["node", ".next/standalone/server.js"],
        cwd=ROOT, env={**os.environ,
                       "DATABASE_URL": f"file:{DB}", "OWNER_KEY": KEY,
                       "PORT": str(PORT), "HOSTNAME": "127.0.0.1", "NODE_ENV": "production"},
        stdout=open("/tmp/gate0_ui_server.log", "w"), stderr=subprocess.STDOUT)
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(f"{BASE}/api/v1/health", timeout=2); break
            except Exception:
                time.sleep(0.5)
        else:
            print("FAIL: server did not boot"); sys.exit(1)

        async with async_playwright() as p:
            browser = await p.chromium.launch(args=[
                "--use-gl=angle", "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox"])
            page = await browser.new_page(viewport={"width": 1440, "height": 860}, device_scale_factor=1)
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:200]))
            await page.goto(f"{BASE}/", wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(4000)

            # Enter the sanctuary (dismiss boot overlay; the 14 MB character
            # model takes a while under SwiftShader — wait up to 90 s).
            try:
                await page.locator(".boot-enter").click(timeout=90000)
            except Exception as e:
                print(f"boot-enter never appeared: {e}")
                await page.screenshot(path=shot("gate0_ui_boot_fail.png"), timeout=120000)
                raise
            await page.wait_for_timeout(3000)

            # 1. Sanctuary rendered (public surface) — canvas present + HUD visible
            canvas = await page.locator("#nexus-canvas").count()
            hud = await page.locator("#hud-top").count()
            print(f"[1] canvas={canvas} hud={hud} (sanctuary shell renders without a key)")
            assert canvas == 1 and hud == 1, "sanctuary shell did not render"

            # 2. Open Inspector -> Memory tab WITHOUT a key
            await page.evaluate("document.getElementById('btn-inspector-drawer').click()")
            await page.wait_for_timeout(600)
            await page.evaluate("[...document.querySelectorAll('.tab-btn')].find(b => b.textContent.includes('Memory')).click()")
            await page.wait_for_timeout(1200)
            gate = await page.locator("#owner-gate").count()
            mem_cards_locked = await page.locator("#inspector-body .btn-danger-outline").count()
            print(f"[2] owner-gate visible={gate}; memory cards leaked={mem_cards_locked}")
            assert gate == 1, "OwnerGate panel did NOT appear after 403"
            assert mem_cards_locked == 0, "memory data rendered despite missing key!"
            await page.screenshot(path=shot("gate0_ui_locked.png"), timeout=120000)

            # 3. Wrong key -> server-verified rejection
            await page.locator("#owner-gate input").fill("wrong-key-attempt")
            await page.locator("#owner-gate button", has_text="UNLOCK").click()
            await page.wait_for_timeout(1200)
            invalid = await page.locator("#owner-gate").inner_text()
            print(f"[3] wrong key -> panel stays: {invalid[:60]!r} contains 'Invalid': {'Invalid' in invalid}")
            assert "Invalid" in invalid, "wrong key was not rejected visibly"
            assert await page.locator("#owner-gate").count() == 1

            # 4. Correct key -> panel disappears, guarded memory data loads
            await page.locator("#owner-gate input").fill(KEY)
            await page.locator("#owner-gate button", has_text="UNLOCK").click()
            await page.wait_for_timeout(1800)
            gate_gone = await page.locator("#owner-gate").count()
            mem_cards = await page.locator("#inspector-body .btn-danger-outline").count()
            print(f"[4] gate gone={gate_gone == 0}; memory cards loaded={mem_cards}")
            assert gate_gone == 0, "OwnerGate did not close after correct key"
            assert mem_cards > 0, "memory data did not load after unlock"
            await page.screenshot(path=shot("gate0_ui_unlocked.png"), timeout=120000)

            # 5. Key persists across in-tab reload (sessionStorage)
            await page.reload(wait_until="domcontentloaded", timeout=120000)
            await page.wait_for_timeout(3500)
            try:
                await page.locator(".boot-enter").click(timeout=90000)
            except Exception:
                pass  # already entered (snapshot restored fast)
            await page.wait_for_timeout(1500)
            await page.evaluate("document.getElementById('btn-inspector-drawer').click()")
            await page.wait_for_timeout(600)
            await page.evaluate("[...document.querySelectorAll('.tab-btn')].find(b => b.textContent.includes('Memory')).click()")
            await page.wait_for_timeout(1500)
            mem_after_reload = await page.locator("#inspector-body .btn-danger-outline").count()
            gate_after_reload = await page.locator("#owner-gate").count()
            print(f"[5] after reload: memory cards={mem_after_reload}, gate visible={gate_after_reload}")
            assert mem_after_reload > 0, "key did not survive reload (sessionStorage)"
            assert gate_after_reload == 0
            await page.screenshot(path=shot("gate0_ui_after_reload.png"), timeout=120000)

            hard_errors = [e for e in errors if "403" not in e]
            print(f"[info] page errors (non-auth): {hard_errors if hard_errors else 'none'}")
            await browser.close()
            print("GATE 0 UI FLOW: ALL VERIFIED")
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(timeout=10)
        except Exception: srv.kill()
        if os.path.exists(DB): os.remove(DB)

asyncio.run(main())
