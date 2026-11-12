# CHANGELOG — JARVIS NEXUS

Format: date — change — why. Newest first. Full diffs: git log.

## 2026-11-12 — P0 build session (audit → fixes → verification)

**Rendering (NexusSanctuaryScene.js, JarvisCharacterController.js)**
- Composer render targets now run at device-pixel resolution at init, on resize, and in the adaptive DPR loop (B1/B2/B5) — the zoom-blur root cause
- Adaptive DPR: steps down AND recovers; 22–38 ms dead band; 1.5 s cooldown; composer follows the renderer
- Resize re-baselines to the NATIVE device DPR — removed the `min(dpr, previous)` ratchet that permanently trapped a window at its boot-time DPR (the B5 real-world core, caught live by the headless DPR-switch test)
- matchMedia `(resolution: Xdppx)` watcher catches DPR changes that fire no resize event (emulation, some zoom/monitor transitions); re-arms after each change
- Pyramid hologram mode renders through the composer (bloom/vignette/tonemap parity, B11)
- Vision board: 30 fps upload cap + LOCKED-state restore when the camera turns off (B7); previously froze on the last video frame
- Spatial anchors: innerHTML/className written only on change (B8)
- Light diet first pass: 21 → 16 realtime lights (removed 3 ceiling washes, +X dead-zone fill, character cyan bounce; hemisphere 0.48→0.56; Security Vault cove →2.8; character fill 0.3→0.5)

**Scenario system**
- New shared boolean branch parser `src/nexus/world/branchCondition.js` (and/or/not keywords, && || !, parentheses, 6 comparisons, fail-safe) — B3: `and` conditions used to silently fail, so the Media Wall showed the safe branch while the stage ruptured
- ScenarioBar.tsx: hardcoded duplicate branch logic replaced by the shared evaluator (single source of truth)
- Sliders (timeline, rate, variables) are controlled inputs; scenarioUpdateVariable/scenarioSetRate now emit (B9)
- Narration cues queue (max 2) and drain on speech end instead of being silently dropped; cleared on interrupt

**Fonts & UI hygiene**
- Geist/Geist Mono variables moved to <html>; nexus.css --font-sans/--font-mono consume the loaded fonts (H4 — "Inter"/"JetBrains Mono" were never loaded)
- Unused Toaster removed from layout

**Dead code & dependencies (H1/H5)**
- Deleted: src/components/ui/ (45 shadcn boilerplate files), src/hooks/, src/lib/utils.ts, src/nexus/vendor/dynamicbones.mjs (1,053 lines, never imported)
- package.json: 77 → 19 packages (evidence: scripts/dep_audit.py; only boilerplate imported the removed libs)
- Kept: xbot_locomotion.glb + walking.fbx (runtime retarget assets), examples/websocket/ (D4 seed)

**Quality gates (H2)**
- next.config.ts: ignoreBuildErrors false, reactStrictMode true; tsconfig: noImplicitAny true; excludes for non-app dirs
- Fixed real hidden type errors: telemetry typing (unknown→ReactNode), api() HeadersInit union, closure narrowing (active_scenario), minimal Web Speech API typings

**Architecture (D6/D3)**
- New src/lib/nexus/providers/: types.ts (Llm/Tts/Asr provider contracts), zaiCloud.ts (SDK behind contracts, dynamic import), registry.ts (env-configurable fallback chains NEXUS_LLM/TTS/ASR_PROVIDERS, per-provider failure isolation, describeInferenceRoute)
- brain.ts think/synthesizeVoice/transcribeAudio + agents dispatch route now go through the registry; telemetry reports the live chain
- Voice identity: NEXUS_VOICE_IDENTITY env (default tongtong) per D3
- .env.example added

**Tests & docs**
- tests/unit/: branchCondition (6 tests), scenarioDirector integration incl. B3 regression + clearStage dispose (2), registry chain (1) — 9/9 pass; npm test / npm run typecheck scripts
- Documentation set created: PROJECT_STATE.md, ENGINEERING_DECISIONS.md, ARCHITECTURE.md, IMPLEMENTATION_BACKLOG.md, RESEARCH_REGISTER.md, CHANGELOG.md (this file)
- Avaturn licensing position verified and recorded (prototype-only; personal-use ToS, commercial requires negotiated license)
- All 7 uploaded images classified (D7)

**Verification performed**
- tsc --noEmit (strict): 0 errors; next build: 0 errors (23 routes); node --test: 9/9
- Standalone server boot: /, /api/v1/health, /api/v1/world, /api/v1/telemetry OK
- Live end-to-end: conversations/send → reply + emotion + WAV audio via zai_cloud_route; voice/tts OK
