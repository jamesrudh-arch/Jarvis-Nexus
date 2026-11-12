# PROJECT_STATE — JARVIS NEXUS

> Canonical continuation document (consolidates PROJECT_STATUS, CURRENT_PROGRESS,
> BLOCKERS, NEXT_ACTIONS per the Master Directive Section 7). Updated at the end
> of every working session. Documentation authority order (D8): user-approved
> decisions > engineering baseline > ENGINEERING_DECISIONS.md > ARCHITECTURE.md >
> IMPLEMENTATION_BACKLOG.md > PROJECT_STATE.md > CHANGELOG.md > RESEARCH_REGISTER.md.

**Last session:** 2026-11-13 (session 6) — credential integration COMPLETED per the final directive: every supplied credential mapped, configured and exercised with REAL operations. Supabase is now the storage backend (owner directive) with full CRUD live-verified (bucket create → upload → byte-identical readback → anonymous rejection → delete → gone); R2 retired and removed from production env. §6 tool execution made real (storage.put/get/list/delete + kaggle.datasets executed server-side, ACTUAL results spoken back — with a deterministic honesty guard after a live-observed false-deletion claim was caught and fixed). Kaggle `datasets/list` bug fixed (maxSize is a BYTE filter; pageSize is the count). EOS: all 4 IDs configured; Client Secret proven missing by 12 real OAuth permutations — the single outstanding credential in the project. `.env.local` rebuilt after sandbox recycle (GitHub token + DB password recovered FROM Railway production env).
**Overall state:** P0 complete and verified; integrations layer real-operations-verified; production deployment LIVE on Railway (`jarvis-nexus-production.up.railway.app`) with the full 37-variable env including all session-6 credentials. P1 render/asset work remains.

---

## What works (verified this session — session 6)

- **Credential recovery + mapping**: `.env.local` (lost to sandbox recycle) rebuilt from the owner's message + Railway production env (GITHUB_TOKEN, GITHUB_REPO, SUPABASE_DB_PASSWORD, CLOUDFLARE_ACCOUNT_ID, OWNER_EMAIL recovered WITHOUT printing values). 24 variables mapped to services; `.gitignore` coverage re-verified.
- **Supabase = storage backend (directive)**: real CRUD verified twice (probe `verify_credentials_v2.py` + honest verifier): private buckets `jarvis-nexus-verify`/`jarvis-nexus-assets`, upload → byte-identical readback → anonymous rejection (400) → delete → gone. Both key classes live-verified (sb_secret_ + service_role JWT work on rest/storage/auth). Free-tier guardrails: 10 MiB/file, 920 MiB quota guard, usage surfaced in the UI.
- **§6 REAL tool execution**: `tool_calls` in the directive contract → server-side execution → ACTUAL results spoken by a follow-up LLM turn. Live end-to-end: storage.put (60 bytes, readback verified, independent readback matched), storage.delete (after honesty-guard fix: really gone, HTTP 404), kaggle.datasets (16 real refs). Response carries `tool_results` for auditability.
- **Honesty guard (defect caught live)**: first delete test — LLM claimed deletion without executing; object still present. Fixed: MANDATORY tool rules + `detectImplicitStorageTool` (explicit verb + key → force-execute). Unit-tested (44/44 suite, +7 new tests: key sanitization, call coercion, guard intents).
- **Kaggle bug fix**: `datasets/list?maxSize=` is a BYTE-size filter (0 results); `pageSize` is the result count — fixed in `kaggle.ts`, verified live with real dataset refs.
- **`/api/v1/storage`**: owner-key-guarded HTTP storage surface (deny-by-default). E2E: wrong/no key → 403; traversal key → 400; upload → verified; download → byte-identical; delete → 404. Status surface (public metadata) shows buckets/usage/quota.
- **EOS**: Product/Client/Deployment/Sandbox IDs configured everywhere; 12/12 real OAuth permutations answered 400 invalid_client_credentials → Client Secret is the single genuinely missing credential (exact source documented: Dev Portal → product → Clients).
- **Cloudflare**: token account-verified; R2 RETIRED per directive (no R2 calls; R2 vars deleted from Railway — verified none remain).
- **Railway**: 16 vars upserted + 3 deleted (37 total, zero R2 leftovers); live deployment healthy.
- **Honest verifier updated**: `scripts/verify_integrations.py` → 17/18 OK (only EOS secret fails, honestly).

## What works (verified in session 5 — still true)

- **Credential integration completed with real operations** (the directive's core demand — audit register: docs/INTEGRATIONS.md):
  - **GitHub**: authenticated (jamesrudh-arch), push permission verified, session commits pushed to main.
  - **Kaggle ×6**: every account exercised on the data plane — `kernels/list` returned **77 real kernels** across the six accounts; `datasets/list` + `competitions/list` 200 each. Working query form recorded (`user=<name>`; `mine=true` is rejected 400 by the current API).
  - **Cloudflare**: token classified as ACCOUNT-scoped (explains the earlier `/user/tokens/verify` 401 — expected for this class, not a fault); account-tokens API readable; **a new R2-scoped account token was CREATED via the API** and its **S3 credentials derived per official docs** (AccessKeyID = token id, SecretAccessKey = SHA-256(token value)) and stored in `.env.local` + Railway. R2 itself returns `10042` “enable R2 through the dashboard” — a billing action the API explicitly reserves for the dashboard; everything else is ready for zero-change activation.
  - **Railway**: the earlier “read-only / 0 projects” reading was a verifier defect (`me` null-propagation) — **write access proven** (`variableUpsert`/`variableDelete`/`volumeCreate` all executed; probe variable cleaned up). Project `reasonable-heart` (owner-created) carries service **Jarvis-Nexus** deploying from GitHub main: **persistent volume created at `/data`**, **19 production env vars written** (DATABASE_URL + all service credentials), deployment verified live at **https://jarvis-nexus-production.up.railway.app** (`/api/v1/health` 200; pre-fix it answered `degraded: DATABASE_URL missing`).
  - **Supabase**: `sb_secret_` key + DB password configured everywhere; management API rejection verified across header/path variants; **SUPABASE_URL (project ref) is the single missing identifier** — not present in repo, git history, reference repos, or Railway variables; `sbp_` PAT would also unlock project listing.
  - **Epic EOS**: supplied credential classified as the CLIENT ID (xyza7891 format); **real client-credentials OAuth attempts** answered `invalid_client` — establishing by attempt that the client secret (plus ProductId/DeploymentId from the Developer Portal) is genuinely required and absent.
- **Honest verifier**: `scripts/verify_integrations.py` rewritten to encode the API realities above (11/15 OK; the 4 non-OK rows each cite the exact real response and the precise owner action).
- **Runtime status surface updated**: `railwayStatus()` now reports the live project + latest deployment + public URL; R2 status distinguishes “S3 credentials configured” from “R2 enablement pending dashboard action”.

## What works (verified in session 4 — still true)

- **Reference repos deep-studied + absorbed**: the three local copies (reference/Jarvis, ref_jarvis_repo, repo-ref) are clones of github.com/jamesrudh-arch/Jarvis. `reference/Jarvis` is now the canonical tracked copy in-repo (gitlinks removed; duplicates local-only). Character/scene/lighting parity confirmed already complete (live controller evolved beyond the reference: 5-light rig, skin sheen PBR); true parity gaps found and closed: mobile companion + PWA manifest (pyramid hologram + WebM recording were already ported).
- **GitHub is the source of truth**: repo `jamesrudh-arch/Jarvis-Nexus` (previously empty) now holds main @ 2656f3b with full session history; every push verified via API + ls-remote. Secrets audited clean before every push; `.env.local` gitignored and NEVER committed.
- **Credential verification (live)**: GitHub token → authenticated as jamesrudh-arch (push perms confirmed). Kaggle ×6 ALL individually valid (jimcreat, wikeyoung, deyoungsltd, bittrexminingltd, wikeyoung5, youngwilly). Cloudflare account access OK; R2 returns real 10042 “enable R2 in dashboard”. Railway workspace token authenticates (read scope; mutations 403). Supabase sb_secret_ is project-scoped (management wants sbp_ PAT) — live-verified.
- **Integrations layer** (`src/lib/nexus/integrations/`): Kaggle resource manager (per-account verify, round-robin routing, dataset discovery, private kernel compute submission), R2 client (SigV4 S3 data plane, zero deps, SHA-256+ETag integrity), Supabase clients (both surfaces), EOS config assembly (honest missing-credential list), GitHub status, Unreal bridge, Blender MCP client. Live API `GET/POST /api/v1/integrations`; InspectorDrawer “Connections” tab shows REAL live checks (decorative static panel removed).
- **Wake-word / intelligent standby / barge-in** (`src/nexus/wakeWord.ts` + client wiring + DialogueDock pill): standby = local VAD only (no network while silent); “Hey JARVIS” activates; sleep phrases + 180 s inactivity return to standby; voice energy mid-speech cancels speech + in-flight generation; MIC/MASTER switches tear down every audio track; permission requested once at MIC-switch-ON. Native iOS events (jarvis-utterance / jarvis-barge-in) share the same contract.
- **Runtime-environment implementations (code complete, awaiting external execution)**: `unreal/` (.uproject, whitelisted HTTP bridge in-editor Python, JarvisNexusEOS C++ plugin with EOS_Platform_Create + client-credentials login), `blender/` (bpy addon: scene/materials/rig-validation/export + MCP-style TCP server on main-thread queue + headless script), `ios/` (SwiftUI + AVAudioSession voiceChat + SFSpeechRecognizer wake engine + WKWebView bridge). Each has a README with the exact bring-up steps; docs/INTEGRATIONS.md is the audit register separating implemented / verified-live / blocked-by-account-state / awaiting-external-execution.
- **Deployment prepared**: production Dockerfile (standalone + /data persistent volume + seeded DB) + .dockerignore; Railway healthcheck path /api/v1/health; deployment blocked only by token write-scope (documented in INTEGRATIONS.md).
- **PWA**: manifest + icons (192/512/maskable/apple-touch) + appleWebApp metadata; 44 px touch targets + notch/home safe-area insets on ≤860 px.
- **Verification**: 37/37 unit tests, tsc --noEmit clean, production build clean, standalone server boots, health OK, integrations endpoint live-checked (see INTEGRATIONS.md for the actual responses).

## What works (verified in session 3 — still true)

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
