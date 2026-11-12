# CHANGELOG — JARVIS NEXUS

Format: date — change — why. Newest first. Full diffs: git log.

## 2026-11-12 (session 2) — Character-quality pass: Chinese lip-sync, streamed speech, aliveness, locomotion fix

**Mandarin lip-sync engine (D-workflow)**
- New `src/nexus/vendor/lipsync-zh.mjs`: 汉字 → pinyin-pro (lazy chunk) → syllable parse (23 initials, 40 finals, tone digits) → Oculus viseme segments with tone-scaled durations (T3 longest, T4 clipped, T5 short), initial closures, and punctuation pauses. The owner speaks Chinese; the En-only rule engine was the "no lip-sync" root cause.
- `speak()` is now mixed-language: text splits into CJK runs (Zh engine), latin runs (En engine), and punctuation (breathing pauses) in one timeline
- Browser-TTS fallback picks a zh-CN voice for Chinese replies (was: /en/ voice → garbled/silent Chinese) and sets `utt.lang`
- Waveform Layer 2 upgraded: F1 (180–950 Hz) / F2 (950–2900 Hz) band energies → vowel-plane classification replaces the spectral-centroid bucket; text timeline is authoritative for mouth SHAPE, waveform drives jaw aperture + fills gaps

**Sentence-streamed TTS (D-workflow latency kill)**
- New `src/nexus/vendor/speechStream.mjs`: `splitSentences` (terminal + soft punctuation, 140-char cap, orphan merge, zh/en/mixed) and `SpeechSequencer` (chunk i plays while chunk i+1 synthesizes; preloaded first-chunk audio; AbortController-backed stop)
- `conversations/send` now pre-synthesizes ONLY the first sentence and returns `audio_text` (the exact covered chunk) — measured 3.5 s total round-trip; per-sentence TTS 1.6 s hidden under playback. Previously the route blocked on full-paragraph synthesis before she could open her mouth
- Client `NexusClient` routes conversation replies AND scenario narration through the sequencer; interrupts abort in-flight fetches; dispose stops everything

**Aliveness layer (C-workflow micro-motion)**
- Speech-energy envelope (fast attack/slow release) from the live voice waveform; stress onsets fire head-accent nods and alternate the beat-gesture side; energy-scaled forearm lifts while speaking (restrained, never windmill)
- Living arms: continuous shoulder/elbow/wrist micro-sway when standing (elbows never lock straight)
- Eye saccades: micro-darts every 0.7–2.6 s, amplitude reduced while speaking (holds your gaze)
- Formant estimate + text-timeline blend keeps articulation accurate for both languages

**BehaviorDirector v2 (G-workflow seed)**
- New states: reflect (hand-to-chin thinking pose + upward recall gaze — the strongest "alive" tell), survey (step back, pan the sanctuary), plus varied emotional states; controller gained the matching `reflect` posture
- Conversational presence: she turns to face the owner while replying (`conversational_focus` + `focusCamera`) instead of talking at a console

**Locomotion slow-motion BUG (found via headless verification, affects real low-fps devices)**
- `Math.min(dt, 0.05)` froze her at ~3.5% speed under low frame rates (weak iGPUs, throttled tabs, SwiftShader): waypoints never cleared → BehaviorDirector never ran → she stood "frozen mid-step" forever. Locomotion, mixer, blink, and gaze now integrate a real-time clock (performance.now delta, capped 0.5 s); facial morph lerps keep the tight clamp. Verified: waypoint arrival at 0.7 fps (previously stuck >3 min)

**Verification & tooling**
- Dev-only `window.__NEXUS_DEBUG__()`: live mouth morphs, speech energy, posture, root position vs waypoint target, audio-context state
- 15 new unit tests (splitter, lipsync-zh, sequencer incl. abort/prefetch/failure paths) — 24/24 pass; strict typecheck; production build clean
- Live instrumented evidence: jawOpen 0→0.273 with varying viseme_aa/O during Chinese playback, head accents firing, beat sides alternating; VLM-verified open-mouth frame (teeth/tongue visible) with direct camera gaze (download/screenshots/v2_sp2.png)
- Runtime dependency added: `pinyin-pro` (MIT, browser-compatible, lazy-loaded chunk only when CJK speech occurs)

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
