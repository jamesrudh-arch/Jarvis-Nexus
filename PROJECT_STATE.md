# PROJECT_STATE — JARVIS NEXUS

> Canonical continuation document (consolidates PROJECT_STATUS, CURRENT_PROGRESS,
> BLOCKERS, NEXT_ACTIONS per the Master Directive Section 7). Updated at the end
> of every working session. Documentation authority order (D8): user-approved
> decisions > engineering baseline > ENGINEERING_DECISIONS.md > ARCHITECTURE.md >
> IMPLEMENTATION_BACKLOG.md > PROJECT_STATE.md > CHANGELOG.md > RESEARCH_REGISTER.md.

**Last session:** 2026-11-12 (session 3) — repository walkthrough + researched-tool integration: Audio2Face-3D facial-animation chain, MetaHuman drop-in path
**Overall state:** P0 COMPLETE AND VERIFIED (sessions 1–2). Session 3: the repos named in the Master Directive researched with sources (F8–F14) and their integrations IMPLEMENTED + unit-verified; A2F live-verification BLOCKED on external wheel/GPU (see blockers). P1 render/asset work not started.

---

## What works (verified this session — session 3)

- **Research register filled with primary sources (F8–F14)**: NVIDIA open-sourced Audio2Face Sep 2025; hosted A2F NIM DEPRECATED (gRPC-only, function-ids recorded); A2F wire protocol extracted from the cloned official samples; metahuman-to-glb pipeline facts; MetaHuman any-engine licensing; PixelStreamingInfrastructure as the P4 transport; UE single-shape mouthFunnel/mouthPucker convention.
- **Audio2Face-3D facial-animation chain implemented and VERIFIED end-to-end with a test-substitute gateway (T10)**: `FacialAnimationProvider` contract → `audio2face_local` provider → `scripts/a2f_gateway.py` (NVIDIA's own gRPC protocol, self-hostable; the NVIDIA gRPC hop itself is the only externally-blocked part) → JSON `{fps, durationMs, curves}` → `faceCurve.mjs` validation/sampling → `_updateLipSync` Layer 0 (neural track authoritative for mouth/jaw/brow/cheek; blink+gaze stay local). Live morph proof: cheekPuff fingerprint sustained, jawOpen full-range articulation. No-gateway degradation also verified live (faces:null → local engines, 98 viseme segments). Reproduce: `scripts/mock_a2f_gateway.py` + `A2F_SERVICE_URL=http://localhost:8090` + `scripts/verify_a2f_stub.py`.
- **MetaHuman drop-in path**: skeleton-convention auto-detection + UE5→Mixamo bone aliasing + ARKit-51 shape set + viseme→ARKit fallback. A metahuman-to-glb export can now replace `/models/jarvis_avaturn.glb` with zero controller changes. Avaturn path regression-verified via headless audit (character loads, speaks, points, wanders).
- **Verification**: 37/37 unit tests (13 new), `tsc --noEmit` clean, production build clean, headless audit v3 end-to-end pass.

## What works (verified in session 2 — still true)

- Mandarin lip-sync engine, sentence-streamed TTS, aliveness layer, BehaviorDirector v2, conversational presence, slow-motion locomotion fix, `window.__NEXUS_DEBUG__()` instrumentation. See CHANGELOG session 2.

- **Mandarin lip-sync engine** (`src/nexus/vendor/lipsync-zh.mjs`): 汉字 → pinyin-pro syllables → initial/final/tone → Oculus visemes with tone-scaled durations and punctuation pauses. Mixed zh/en utterances route per-run to the Zh and En engines. Browser-TTS fallback now picks a zh-CN voice for Chinese. Lazy chunk; warmed during model load.
- **Sentence-streamed TTS** (`speechStream.mjs` + `SpeechSequencer` in client): replies are split into sentence chunks; the server pre-synthesizes ONLY chunk 0 (`audio` + `audio_text`), the client speaks it immediately and prefetches chunk i+1 while chunk i plays. Send-route latency measured 3.5 s total (was LLM + full-paragraph synthesis); per-sentence TTS 1.6 s, fully hidden under playback. Fully abortable (owner interrupt kills in-flight fetches via AbortController). Scenario narration uses the same sequencer.
- **Aliveness layer** (JarvisCharacterController): speech-energy envelope from the live waveform → alternating beat gestures on stress onsets (head accent + forearm lift, sides alternate), never-dead elbows/wrists micro-motion, and eye saccades (reduced while speaking). Formant-based vowel estimate (F1 180–950 Hz vs F2 950–2900 Hz bands) replaces the spectral-centroid guess; the text timeline is authoritative for mouth SHAPE, the waveform drives jaw aperture.
- **BehaviorDirector v2**: new reflect state (hand-to-chin thinking pose + recall gaze), survey state (steps back, pans the room), varied emotional states. Controller gained the matching `reflect` posture.
- **Conversational presence**: she now turns to face the owner for her reply (`conversational_focus` + `focusCamera`) instead of talking at a console.
- **Slow-motion locomotion BUG FIXED (root cause of "statue" impressions at low fps)**: `Math.min(dt, 0.05)` made her move at 3.5% speed when the frame rate dropped (weak GPUs, throttled tabs, software rendering) — waypoints never cleared, so BehaviorDirector never ran and she froze mid-step forever. Locomotion/mixer/blink/gaze now integrate a real-time clock (capped 0.5 s); only facial morph lerps keep the tight clamp. Verified: waypoint arrival confirmed live in headless Chromium at 0.7 fps (previously stuck >3 min).
- **Verification instrumentation**: `window.__NEXUS_DEBUG__()` (dev-only) exposes live mouth morphs, speech energy, posture, position vs waypoint target. Evidence: jawOpen 0→0.273 with varying viseme_aa/O during Chinese playback; VLM-verified open-mouth frame with teeth/tongue visible + direct camera gaze (download/screenshots/v2_sp2.png).
- 24/24 unit tests pass (`npm test`: 15 new for splitter/lipsync-zh/sequencer); strict typecheck passes; production build clean.

## What worked (verified in session 1 — still true)

- Strict TypeScript build, standalone production server, provider chain (z-ai cloud LLM/TTS/ASR), branch evaluator with full boolean logic, composer DPR fixes with adaptive recovery — see CHANGELOG.md for details.

## Incomplete (known, next phases)

- A2F gateway LIVE verification (needs the `nvidia_ace` wheel + a reachable A2F endpoint — self-hosted open-source release on the owner's GPU machine, or the legacy NVCF endpoint with an API key)
- MetaHuman GLB production (needs Windows + UE 5.6/5.7 + Blender 5.x to run metahuman-to-glb; in-app drop-in support is DONE)
- P1 render/asset work: KTX2/meshopt pipeline, quality tiers, SSAO/DOF, mobile UX overhaul, reflector optimization (see IMPLEMENTATION_BACKLOG.md)
- P2 remainder: streaming TTS engine A/B (Qwen3-TTS / Orpheus / CosyVoice 2, per D3), barge-in, locomotion blendspace, foot IK
- Parity gaps vs the reference repo not yet ported: Pepper's-Ghost 4-face pyramid projection mode, WebM scenario recording, mobile companion view (recorded in backlog)
- Known cosmetic: Avaturn hair-card edges show faceting/clipping at close-up framing (model limitation; resolved by the P4 MetaHuman track per D2)
- Headless note: synthetic clicks (no user activation) leave the AudioContext suspended — real users always have activation; not a product bug, recorded for future automation work

## Blocked

- **A2F NVIDIA-model hop** — external dependency: the `nvidia_ace` gRPC wheel ships in NVIDIA/Audio2Face-3D-Samples (not installable here: no GPU, no model runtime). Everything in-app is verified with the test substitute (T10); run `scripts/a2f_gateway.py` on the A2F host, then set `A2F_SERVICE_URL`.
- **MetaHuman GLB production** — external dependency: Windows + UnrealEditor-Cmd + Blender 5.x (metahuman-to-glb, F11). In-app loader support complete (ED-21); asset drop-in is a file copy once the pipeline runs.
- **Commercial deployment of the Avaturn character** — licensing gate (ED-L1). Prototype use only.

## Exact next actions (dependency-ordered)

1. Owner-side A2F bring-up: clone Audio2Face-3D-Samples, `pip install` the wheel + gateway deps, run `scripts/a2f_gateway.py` next to A2F, set `A2F_SERVICE_URL` → neural facial animation goes live (in-app chain already verified per T10; only the NVIDIA hop needs the real service)
2. Owner-side MetaHuman bring-up: run metahuman-to-glb on a Windows+UE machine, drop the GLB into `/models/`, verify load + speech + locomotion on the UE5 skeleton
3. P1 asset pipeline: KTX2 + meshopt for `jarvis_avaturn.glb` (14 MB → ~4 MB; VRAM 1.5 GB → 335 MB measured in Stage-1)
4. Quality tiers (Ultra/High/Medium/Low) + mobile auto-detect; deep light diet behind tiers
5. Post stack: SSAO, unified bloom (verify pyramid bloom on device)
6. B4 webglcontextlost recovery + B6 dispose audit
7. Mobile UX: one breakpoint system, 44 px touch targets, camera presets on mobile, rotation-aware
8. P2: barge-in interrupt from mic VAD; blendspace walk/turn; streaming-TTS engine A/B per D3
9. Port remaining reference-repo parity features: Pepper's-Ghost pyramid mode, WebM recording, mobile companion view

## Session log pointers

- CHANGELOG.md — what changed, why
- ENGINEERING_DECISIONS.md — decisions D1–D9 + session engineering decisions
- RESEARCH_REGISTER.md — verified vs tested vs recommended vs open
