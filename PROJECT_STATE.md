# PROJECT_STATE — JARVIS NEXUS

> Canonical continuation document (consolidates PROJECT_STATUS, CURRENT_PROGRESS,
> BLOCKERS, NEXT_ACTIONS per the Master Directive Section 7). Updated at the end
> of every working session. Documentation authority order (D8): user-approved
> decisions > engineering baseline > ENGINEERING_DECISIONS.md > ARCHITECTURE.md >
> IMPLEMENTATION_BACKLOG.md > PROJECT_STATE.md > CHANGELOG.md > RESEARCH_REGISTER.md.

**Last session:** 2026-11-12 — P0 build session (audit B-bugs fixed, strict build, D6 provider layer)
**Overall state:** P0 COMPLETE AND VERIFIED. P1 not started.

---

## What works (verified this session)

- Application builds clean under **strict TypeScript** (`ignoreBuildErrors: false`, `noImplicitAny: true`) and `reactStrictMode: true`
- Production standalone server boots; `/`, `/api/v1/health`, `/api/v1/world`, `/api/v1/telemetry` respond correctly (smoke-tested)
- **End-to-end AI provider chain**: `conversations/send` → provider registry → z-ai cloud → directive (reply + emotion + zone + scenario + memory_writes) + WAV voice audio. `inference_source: zai_cloud_route`
- TTS route returns WAV; ASR route wired through the registry
- Scenario system: branch evaluation with full boolean logic (`and`/`or`/`not`, parentheses) — Media Wall feed, stage math, and UI banner all use ONE evaluator (unit + integration tested)
- Rendering: composer runs at device-pixel resolution on all paths incl. pyramid mode (zoom-blur root cause eliminated); adaptive DPR steps down AND recovers with cooldown + dead band; resize re-baselines to native DPR (ratchet removed) + matchMedia watcher catches eventless DPR changes. **Verified in headless Chromium**: desktop DPR1 (1600×900 buffer), fresh mobile DPR3 load (780×1688 buffer = clamp 2.0), mid-session DPR switch (watcher fires; adaptive loop correctly steps down under SwiftShader software rendering — on real GPUs it holds 2.0). Evidence: download/screenshots/p0_verification_*.png
- 9/9 unit tests pass (`npm test`); `npm run typecheck` passes

## Incomplete (known, next phases)

- Everything in P1–P4 of the roadmap (see IMPLEMENTATION_BACKLOG.md): KTX2/meshopt asset pipeline, LOD/quality tiers, SSAO/DOF, mobile UX overhaul, streaming TTS, viseme engine v2 (Chinese map), locomotion blendspace, micro-motion/BehaviorDirector v2, hologram ingestion pipeline, memory replays, shared world (examples/websocket exists as the seed, needs `socket.io` deps when activated), MetaHuman primary character (D2), hair/cloth

## Blocked

- **Commercial deployment of the Avaturn character** — licensing gate (see ENGINEERING_DECISIONS.md, ED-L1). Prototype use only. No other blockers.

## Exact next actions (P1, dependency-ordered)

1. KTX2 + meshopt asset pipeline for `public/models/jarvis_avaturn.glb` (14 MB raw → ~4 MB; measured VRAM 1.5 GB → 335 MB in Stage-1 research)
2. Quality tiers (Ultra/High/Medium/Low) + mobile auto-detect; deep light diet behind tiers
3. Post stack: SSAO, unified bloom (B11 residual: verify pyramid bloom visually on device)
4. Reflector subgraph/half-res/off-by-tier
5. B4 webglcontextlost recovery + B6 dispose audit (scene-wide pattern)
6. Mobile UX: one breakpoint system, 44 px touch targets, camera presets on mobile, rotation-aware, portrait input
7. (P2 preview) evaluate streaming TTS engines — Qwen3-TTS / Orpheus / CosyVoice 2 — same reference scripts + audio tests per D3

## Session log pointers

- CHANGELOG.md — what changed, why
- ENGINEERING_DECISIONS.md — decisions D1–D9 + session engineering decisions
- RESEARCH_REGISTER.md — verified vs tested vs recommended vs open
