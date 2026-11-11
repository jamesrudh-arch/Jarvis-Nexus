#!/usr/bin/env python3
"""V3 audit: upgraded character, sanctuary, scenario narration pose."""
import asyncio, os, time
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
        page.on("console", lambda m: m.type == "error" and print(f"[err] {m.text[:220]}", flush=True))
        page.on("pageerror", lambda e: print(f"[pageerror] {str(e)[:260]}", flush=True))
        page.set_default_timeout(150000)
        await page.goto("http://localhost:3000/", wait_until="domcontentloaded", timeout=60000)

        try:
            await page.wait_for_selector("button.boot-enter", state="attached", timeout=140000)
        except Exception:
            print("boot button missing", flush=True)
        await page.wait_for_timeout(1200)
        cnt = await page.locator("button.boot-enter").count()
        if cnt:
            # JS-level click — Playwright's actionability pipeline stalls under SwiftShader
            await page.evaluate("document.querySelector('button.boot-enter')?.click()")
            print("entered", flush=True)

        await page.evaluate("window.__nexusClient?.sanctuary?.renderer?.setPixelRatio(0.7)")
        # Wait until the canvas shows REAL scene content (chromatic mid-tones).
        # A white frame (compile/HMR artifact) must NOT pass this gate.
        async def wait_painted(timeout_s=150, need=0.14):
            import time
            t0 = time.time()
            while time.time() - t0 < timeout_s:
                ratio = await page.evaluate("""() => {
                  const cv = document.getElementById('nexus-canvas');
                  if (!cv || !cv.width) return 0;
                  try {
                    const c2 = document.createElement('canvas');
                    c2.width = 72; c2.height = 45;
                    const cx = c2.getContext('2d');
                    cx.drawImage(cv, 0, 0, 72, 45);
                    const d = cx.getImageData(0, 0, 72, 45).data;
                    let good = 0;
                    const n = d.length / 4;
                    for (let i = 0; i < d.length; i += 4) {
                      const r = d[i], g = d[i+1], b = d[i+2];
                      const lum = 0.3*r + 0.59*g + 0.11*b;
                      const chroma = Math.max(r,g,b) - Math.min(r,g,b);
                      if ((chroma > 10 && lum > 14 && lum < 236) || (lum > 26 && lum < 220 && chroma > 4)) good++;
                    }
                    return good / n;
                  } catch { return 0; }
                }""")
                if ratio > need:
                    print(f"canvas REAL content (chroma={ratio:.2f})", flush=True)
                    return True
                await page.wait_for_timeout(2500)
            print("canvas paint wait TIMEOUT", flush=True)
            return False

        await wait_painted()
        await page.wait_for_timeout(4000)

        # 1. Living presence wide
        await page.screenshot(path=f"{OUT}/v3_living_presence.png", timeout=120000)
        print("saved v3_living_presence", flush=True)

        # 2. Conversation closeup — face beauty + eye catchlights
        await page.evaluate("window.__nexusClient.setCameraPreset('conversation')")
        await page.wait_for_timeout(5000)
        await page.screenshot(path=f"{OUT}/v3_conversation.png", timeout=120000)
        print("saved v3_conversation", flush=True)

        # 3. Activate a scenario — hologram + narration pose + presenter mark
        await page.evaluate("window.__nexusClient.activateScenario('cryo_manifold_forensic')")
        # Poll until she reaches the presenter's mark AND narration is speaking
        # (SwiftShader runs ~1fps: give wall-clock time for walk + TTS + visemes).
        t0 = time.time()
        reached = speaking_seen = False
        while time.time() - t0 < 150:
            st = await page.evaluate("""() => {
              const s = window.__nexusClient?.sanctuary;
              const j = s?.jarvis;
              return {
                x: j ? j.root.position.x : 99, z: j ? j.root.position.z : 99,
                speaking: !!j?.isSpeaking, segs: j?.speechTimeline?.length ?? 0,
                aimW: j?._armAimWeight ?? 0,
              };
            }""")
            if abs(st['x'] - 1.9) < 0.45 and abs(st['z'] - 2.9) < 0.45:
                reached = True
            if st['speaking'] or st['segs'] > 0:
                speaking_seen = True
            if reached and speaking_seen and st['aimW'] > 0.5:
                break
            await page.wait_for_timeout(3000)
        print(f"mark_reached={reached} narration_seen={speaking_seen}", flush=True)
        await page.wait_for_timeout(2500)
        scen_state = await page.evaluate("""() => {
          const s = window.__nexusClient?.sanctuary;
          const j = s?.jarvis;
          return {
            jarvisPos: j ? [j.root.position.x.toFixed(2), j.root.position.z.toFixed(2)] : null,
            posture: j?.postureMode, aimW: j?._armAimWeight?.toFixed(2),
            speaking: j?.isSpeaking,
            visemeSegs: j?.speechTimeline?.length ?? 0,
            gestureTarget: j?.gestureWorldTarget ? [j.gestureWorldTarget.x.toFixed(2), j.gestureWorldTarget.z.toFixed(2)] : null,
            camMode: s?.cameraDirector?.mode,
          };
        }""")
        print("scenario state:", scen_state, flush=True)
        await page.screenshot(path=f"{OUT}/v3_scenario.png", timeout=120000)
        print("saved v3_scenario", flush=True)

        # 4. Autonomous behavior sample (wait for wander / glance)
        await page.evaluate("window.__nexusClient.restoreScenario()")
        await page.evaluate("window.__nexusClient.setCameraPreset('living_presence')")
        await page.wait_for_timeout(16000)
        await page.screenshot(path=f"{OUT}/v3_autonomous.png", timeout=120000)
        print("saved v3_autonomous", flush=True)

        # Console diagnostics
        state = await page.evaluate("""() => {
          const c = window.__nexusClient; const s = c?.sanctuary;
          const j = s?.jarvis;
          return {
            jarvisLoaded: !!j?.loaded,
            pos: j ? [j.root.position.x.toFixed(2), j.root.position.z.toFixed(2)] : null,
            posture: j?.postureMode, aimW: j?._armAimWeight?.toFixed(2),
            speaking: j?.isSpeaking, dpr: s?._qualityDpr?.toFixed(2),
            behavior: s?.behaviorDirector?.serverPermitted,
            scenario: !!s?.scenarioDirector?.activeScenario,
          };
        }""")
        print("state:", state, flush=True)

        await browser.close()

asyncio.run(main())
