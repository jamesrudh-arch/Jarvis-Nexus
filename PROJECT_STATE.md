# PROJECT_STATE — JARVIS NEXUS

> Canonical continuation document (consolidates PROJECT_STATUS, CURRENT_PROGRESS,
> BLOCKERS, NEXT_ACTIONS per the Master Directive Section 7). Updated at the end
> of every working session. Documentation authority order (D8): user-approved
> decisions > engineering baseline > ENGINEERING_DECISIONS.md > ARCHITECTURE.md >
> IMPLEMENTATION_BACKLOG.md > PROJECT_STATE.md > CHANGELOG.md > RESEARCH_REGISTER.md.

**Last session:** 2026-11-12 (session 2) — C/D-workflow build: Chinese lip-sync engine, sentence-streamed TTS, aliveness layer, slow-motion locomotion fix
**Overall state:** P0 COMPLETE AND VERIFIED. Character-quality pass ("make her alive") LANDED AND VERIFIED. P1 render/asset work not started.

---

## What works (verified this session — session 2)

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

- P1 render/asset work: KTX2/meshopt pipeline, quality tiers, SSAO/DOF, mobile UX overhaul, reflector optimization (see IMPLEMENTATION_BACKLOG.md)
- P2 remainder: streaming TTS engine A/B (Qwen3-TTS / Orpheus / CosyVoice 2, per D3 — current sentence-chunked non-streaming already hides synthesis under playback), barge-in (user speech interrupts her mid-sentence at the audio layer), locomotion blendspace, foot IK
- Known cosmetic: Avaturn hair-card edges show faceting/clipping at close-up framing (model limitation; resolved by the P4 MetaHuman track per D2)
- Headless note: synthetic clicks (no user activation) leave the AudioContext suspended — real users always have activation; not a product bug, recorded for future automation work

## Blocked

- **Commercial deployment of the Avaturn character** — licensing gate (see ENGINEERING_DECISIONS.md, ED-L1). Prototype use only. No other blockers.

## Exact next actions (dependency-ordered)

1. P1 asset pipeline: KTX2 + meshopt for `jarvis_avaturn.glb` (14 MB raw → ~4 MB; VRAM 1.5 GB → 335 MB measured in Stage-1)
2. Quality tiers (Ultra/High/Medium/Low) + mobile auto-detect; deep light diet behind tiers
3. Post stack: SSAO, unified bloom (verify pyramid bloom on device)
4. B4 webglcontextlost recovery + B6 dispose audit
5. Mobile UX: one breakpoint system, 44 px touch targets, camera presets on mobile, rotation-aware
6. P2: barge-in interrupt from mic VAD; blendspace walk/turn; streaming-TTS engine A/B per D3

## Session log pointers

- CHANGELOG.md — what changed, why
- ENGINEERING_DECISIONS.md — decisions D1–D9 + session engineering decisions
- RESEARCH_REGISTER.md — verified vs tested vs recommended vs open
