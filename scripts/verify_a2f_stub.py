#!/usr/bin/env python3
"""Verify the A2F face-track chain against the stub gateway (Directive gates 7-10).

Requires:
  - scripts/mock_a2f_gateway.py running on :8090
  - dev server running with A2F_SERVICE_URL=http://localhost:8090

Sends a real conversation turn, then samples the LIVE face morphs while she
speaks. PASS criteria (all three):
  1. cheekPuff > 0.2 sustained  — only the neural track drives it (fingerprint)
  2. jawOpen varies over time   — curve sampling is live, not a static morph
  3. jawOpen reaches > 0.6      — full-range articulation, distinct from the
                                  local engine's 0.12-0.3 timeline jaw
"""
import asyncio
import json
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox",
        ])
        page = await browser.new_page(viewport={"width": 420, "height": 260})
        # SwiftShader on this sandbox renders ~1 frame / seconds — shrink the
        # pixel workload so more frames land inside the speech window.
        page.on("pageerror", lambda e: print(f"[pageerror] {str(e)[:200]}", flush=True))
        page.set_default_timeout(150000)
        await page.goto("http://localhost:3000/", wait_until="domcontentloaded", timeout=60000)

        await page.wait_for_selector("button.boot-enter", state="attached", timeout=140000)
        await page.wait_for_timeout(1000)
        if await page.locator("button.boot-enter").count():
            await page.evaluate("document.querySelector('button.boot-enter')?.click()")
        # cut the pixel workload like audit_v3 does
        await page.evaluate("window.__nexusClient?.sanctuary?.renderer?.setPixelRatio(0.5)")

        # wait for character
        for _ in range(120):
            loaded = await page.evaluate("window.__nexusClient?.sanctuary?.jarvis?.loaded")
            if loaded:
                break
            await page.wait_for_timeout(1000)
        print("character loaded:", loaded, flush=True)

        # send a conversation turn THROUGH THE CLIENT so the sequencer speaks it
        await page.evaluate("window.__nexusClient.sendConversation('Run the facial animation calibration please.', 'text')")
        # wait for the route round-trip + first chunk playback
        speaking_seen = False
        for _ in range(60):
            s = await page.evaluate("window.__nexusClient?.sanctuary?.jarvis?.isSpeaking")
            if s:
                speaking_seen = True
                break
            await page.wait_for_timeout(500)
        print("client pipeline speaking:", speaking_seen, flush=True)
        if not speaking_seen:
            print("FAIL: client never started speaking (embodiment switch off? sequencer error?)", flush=True)
            await browser.close()
            raise SystemExit(1)

        # sample live morphs while she speaks. SwiftShader frames are seconds
        # apart here, so the sampler must outlast several frames DURING speech:
        # each rendered frame applies the curve at the CURRENT elapsed ms.
        samples = []
        for _ in range(150):
            snap = await page.evaluate("""() => {
              const j = window.__nexusClient?.sanctuary?.jarvis;
              if (!j || !j.morphMeshes) return null;
              const read = (name) => {
                const mesh = j.morphMeshes.find(m => m.morphTargetDictionary && m.morphTargetDictionary[name] !== undefined);
                if (!mesh) return -1;
                const d = mesh.morphTargetDictionary;
                return mesh.morphTargetInfluences[d[name]] ?? -1;
              };
              return {
                speaking: j.isSpeaking,
                cheekPuff: read('cheekPuff'),
                jawOpen: read('jawOpen'),
                mouthSmileLeft: read('mouthSmileLeft'),
              };
            }""")
            if snap:
                if len(samples) < 3:
                    print(f"snap: {snap}", flush=True)
                samples.append(snap)
            await page.wait_for_timeout(300)
            still = await page.evaluate("window.__nexusClient?.sanctuary?.jarvis?.isSpeaking")
            if not still and samples and len([s for s in samples if s.get('speaking')]) > 4 and len(samples) > 12:
                break

        await browser.close()

        puff = [s["cheekPuff"] for s in samples if isinstance(s.get("cheekPuff"), (int, float))]
        jaws = [s["jawOpen"] for s in samples if isinstance(s.get("jawOpen"), (int, float))]
        if not puff:
            print("FAIL: no usable cheekPuff samples (mesh missing or never sampled)", flush=True)
            raise SystemExit(1)
        checks = {
            "cheekPuff sustained >0.2 (fingerprint of the neural track)": any(v > 0.2 for v in puff) and len([v for v in puff if v > 0.2]) >= 3,
            "jawOpen varies over time (curve sampling live)": (max(jaws) - min(jaws)) > 0.25 if jaws else False,
            "jawOpen reaches >0.6 (full-range articulation)": any(v > 0.6 for v in jaws),
        }
        print(json.dumps(checks, indent=2))
        ok = all(checks.values())
        print("A2F CHAIN VERIFICATION:", "PASS" if ok else "FAIL", flush=True)
        raise SystemExit(0 if ok else 1)


asyncio.run(main())
