# IMPLEMENTATION_BACKLOG — JARVIS NEXUS

Status legend: [done] verified this session · [next] dependency-ready · [planned]

## Phase 0 — Stop the bleeding (2026-11-12)

- [done] B1/B2/B5 — composer device-pixel resolution at init/resize/adaptive + DPR recovery (cooldown + dead band)
- [done] B3 — boolean branch parser (`branchCondition.js`), single source of truth, Media Wall/banner agree
- [done] B9 — controlled sliders (timeline, rate, variables) + emit-on-update
- [done] B7 — vision board 30 fps cap + LOCKED-state restore on camera-off
- [done] B8 — spatial anchor innerHTML/className caching
- [done] B11 — pyramid mode through the composer
- [done] E1 first pass — light diet 21 → 16 (deeper diet with tiers)
- [done] H4 — fonts actually load (Geist vars on <html>, nexus.css consumes them)
- [done] H2 — strict TS + noImplicitAny + StrictMode; all hidden errors fixed
- [done] H1/H5 — dependency purge 77 → 19; dead code removed (dynamicbones.mjs, ui boilerplate, hooks, utils)
- [done] J1 — Avaturn licensing verified and recorded (prototype-only; see ENGINEERING_DECISIONS ED-L1)
- [done] D6 — provider-independent inference layer + fallback chains + honest degradation
- [done] D7 — all 7 uploaded images inspected + classified (see RESEARCH_REGISTER)
- [done] P0 directive deliverables 1–13 (build, runtime, e2e provider, error surfaces, tests, deployable; .env.example)

## Phase 1 — Sharp & Light (rendering + assets + mobile) — NEXT

1. [next] KTX2 (UASTC head / ETC1S body) + meshopt for jarvis_avaturn.glb — measured: 14 MB → ~4 MB, VRAM 1.5 GB → 335 MB
2. [next] Quality tiers (Ultra/High/Medium/Low) + auto-detect + user override; tier-gated: lights, shadows, reflector, bloom, DPR clamps
3. [next] SSAO; verify pyramid bloom on device (B11 residual)
4. [next] Reflector: stage subgraph only, half-res mobile, off on Low
5. [next] B4 webglcontextlost recovery; B6 dispose audit scene-wide (clearStage pattern is the reference)
6. [next] Mobile UX: single breakpoint system (768/860/1150–1560 → one), ≥44 px touch targets (now 22–26), camera presets on mobile (<1560 px currently hidden), rotation-aware isMobile, portrait input layout
7. [next] Bundle/asset inventory final pass (public/models sizes after compression)

## Phase 2 — Alive (voice, lips, animation, behavior)

1. [partial] Streaming TTS transport: sentence-chunked streaming LANDED (server pre-synthesizes chunk 0, client prefetches chunk i+1; 3.5 s round-trip, 1.6 s per-sentence hidden under playback). Remaining: true streaming engine A/B (Qwen3-TTS ~97 ms first chunk / Orpheus / CosyVoice 2 vs z-ai per D3), SSE/WS transport to also kill base64-in-JSON (+33%), target mouth-open < 400 ms
2. [partial] Viseme engine v2: CHINESE pinyin→viseme engine LANDED (initial/final/tone, tone-scaled durations, punctuation pauses, mixed zh/en runs, F1/F2 formant jaw drive, zh-CN browser-TTS fallback). Remaining: crossfade tuning 50–80 ms, coarticulation, timeline alignment with true streaming audio; already ARKit/viseme-standard so a model swap carries the work (D2 hedge)
3. [next] Barge-in: cancel audio + viseme timeline + brain turn cleanly; listening pose (sequencer abort infrastructure is in place — ED-14)
4. [next] Locomotion blendspace idle↔walk↔run; retarget config instead of ARM_CARRY constants
5. [next] Two-arm IK, foot planting, look-at chain (eyes→head→spine); turn-in-place
6. [done] Micro-motion layer: breath + weight shifts (session 1), PLUS speech-energy envelope → beat gestures/head accents, living elbows/wrists, eye saccades (session 2)
7. [done→extend] BehaviorDirector v2 seed: reflect/survey/notice/wander-gaze states + conversational facing (session 2); remaining: full four-layer architecture (micro-motion / idle / reactive / social) + brain-schema-driven behaviors
8. [done] Locomotion real-time clock (slow-motion bug fixed — ED-16)
9. [next] Wire BrainDirective end-to-end: emotion→face presets + posture, activity/zone→locomotion targets, urgent→camera
10. [next] Gesture/emote clip set via existing retarget pipeline
11. [next] Voice identity A/B per D3 (NEXUS_VOICE_IDENTITY already parameterized)

## Phase 3 — The Stage (holograms, world, memory)

1. Scenario engine v2: data-driven JSON scenarios, cue system incl. narration queue, light/camera cues (queue landed in P0)
2. Ingestion v1: GLTF scenario library + real point-cloud upload (.ply/.las → decimate)
3. Photo → depth → hologram (server job; VLM assist)
4. Memory: session summaries + long-term facts; memory replay holograms
5. Shared world WebSocket (scope per D4; examples/websocket is the seed; needs socket.io deps)
6. Initiative triggers via urgent/mode (schema already supports)

## Phase 4 — Cinema (optional, staged by D2)

1. MetaHuman primary character migration (investigate interop per D2 — do NOT assume GLB conversion preserves fidelity; verify Epic licensing at migration)
2. threejs-hair-shader; cloth decision (dynamicbones.mjs is in git history if ever revived)
3. SSS skin approximation; eye shading upgrade
4. WebGPU renderer path (iOS 26+ default-on; WebGL2 stays baseline)
5. Cinematic camera grammar + DOF; TAA
6. Quest / Vision Pro compatibility — only with real device testing (D5)
