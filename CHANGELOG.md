# CHANGELOG — JARVIS NEXUS

Format: date — change — why. Newest first. Full diffs: git log.

## 2026-11-13 (session 6) — Storage backend live (Supabase), §6 real tool execution, honesty guard, EOS IDs complete

**Credential integration finished with REAL operations** (final master directive: use them, verify them, demonstrate — audit register rewritten: docs/INTEGRATIONS.md)

**Storage = Supabase (owner directive; R2 retired)**
- `.env.local` had been lost to a sandbox recycle — rebuilt it from the owner's message and RECOVERED the missing credentials (GITHUB_TOKEN, GITHUB_REPO, SUPABASE_DB_PASSWORD, CLOUDFLARE_ACCOUNT_ID, OWNER_EMAIL) directly from the live Railway production variables (values never printed)
- Supabase full storage CRUD live-verified TWICE (probe + honest verifier): created PRIVATE buckets (`jarvis-nexus-assets` app bucket, 10 MiB/file) → upload → **byte-identical readback** → anonymous access rejected (400) → delete → readback gone. Both key classes verified working on rest+storage+auth: the new-format `sb_secret_` key (preferred) and the owner-supplied service_role JWT (stored as SUPABASE_SERVICE_ROLE_KEY, server-side only — its payload says role=service_role despite being labelled "anon key")
- `src/lib/nexus/integrations/supabase.ts` rewritten as the full storage client (buckets/objects/usage, mirroring the retired R2 surface) with free-tier guardrails: 10 MiB per file, 920 MiB quota guard, usage estimate surfaced in `/api/v1/integrations`
- R2 RETIRED per directive: no R2 API calls (never enabled — 10042); `R2_BUCKET`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` deleted from Railway (verified zero leftovers); SigV4 client kept dormant
- NEW `/api/v1/storage` — owner-key-guarded HTTP surface (X-Owner-Key, deny-by-default; public status metadata only). E2E verified: wrong/no key → 403, traversal key → 400, upload verified, download byte-identical (binary-safe), delete → 404

**§6 tool execution made REAL (agent tools, actual results spoken)**
- Directive contract gains `tool_calls`; `src/lib/nexus/tools.ts` + pure `toolContract.ts` implement storage.put/get/list/delete + kaggle.datasets; the send route executes them against live services and a follow-up LLM turn speaks the ACTUAL results; `tool_results` ride in the response for auditability
- Live end-to-end: store-note request → real 60-byte Supabase write (readback verified) → spoken confirmation from the actual result; Kaggle search → 16 real dataset refs spoken
- **Honesty guard (defect caught live and fixed)**: the first delete test showed the LLM claiming "deleted" WITHOUT executing the tool — the object was still present. Fix: MANDATORY tool rules in the contract + deterministic `detectImplicitStorageTool` (explicit verb + file key / explicit Kaggle-search phrasing → server force-executes; quoting history is not retrieval). Re-test: tool executed, spoken from result, independent verification HTTP 404
- Kaggle `datasets/list` bug fixed en route: `maxSize` is a BYTE-size filter (returned 0 results live); `pageSize` is the result count — verified with real refs

**EOS + Cloudflare + Railway**
- EOS: Product/Client/Deployment/Sandbox IDs now configured (env + Railway + `eos.ts` performs the real OAuth exchange whenever the secret exists). All 12 client/secret permutations of every supplied value answered 400 `invalid_client_credentials` → **EPIC_CLIENT_SECRET is the single genuinely missing credential in the project** (source: EOS Developer Portal → product → Clients)
- Cloudflare token account-verified (GET /accounts 200, id match); R2 retirement reflected in the status surface
- Railway env aligned: 16 variables upserted + 3 R2 vars deleted = 37 production variables; live deployment healthy throughout

**Verification**: 46/46 unit tests (+9 session 6 total: storage-key sanitization, tool-call coercion, implicit-intent guard incl. store/delete-priority, deterministic result-speak), tsc --noEmit clean, production build clean, live server E2E (health, integrations snapshot, storage guards/CRUD, conversation tool scenarios), honest verifier 17/18 OK (the one FAIL is the genuinely missing EOS secret — reported, not hidden)

## 2026-11-13 (session 6b) — Tool loop production-proof

**Problem found in production verification**: on Railway the z-ai SDK's ambient credentials do not exist → `think()` falls back honestly, so an owner "store this note" request produced the degraded message with NO tool execution (locally the LLM emitted tool_calls correctly). The delete request still worked only because the honesty guard force-executed it.

**Fix (two layers, both deterministic and honest)**
- `composeToolReply(results)`: when the speak-back LLM turn is unavailable (or the main turn fell back), the spoken reply is templated from the ACTUAL tool results — never claiming what did not happen. Production proof: store → `"Done, Boss. stored 53 bytes at notes/prod-proof2.txt (readback verified)."` + independent readback matched the exact content + delete → 404.
- Store-intent guard: `store/save … at <key>: <text>` force-executes storage.put when the LLM emits no tool call (delete wins over store when both verbs appear; no explicit text after the key → not forced). Unit-tested (+2 → 46/46)
- Documented the production LLM provider limitation honestly (docs/INTEGRATIONS.md): the provider chain is provider-independent (D6); the owner can activate a free-tier LLM provider credential on Railway without code changes beyond a registry entry

## 2026-11-12 (session 5) — Credential integration completed: real operations, production deployment live

**Every supplied credential inspected, mapped, configured and exercised** (the directive: implementation ≠ local execution; no fabricated success — audit register rewritten with six explicit states: discovered / configured / authenticated / permissions verified / real operations / production verified — docs/INTEGRATIONS.md)

**Corrected two false blockers from session 4 (both were verifier defects, not credential limits)**
- Railway "read-only token, 0 projects" was wrong: querying `me` alongside `projects` nulls the whole GraphQL response (Not Authorized on `me` null-propagates). Queried separately: project `reasonable-heart` exists (owner-created today) with service **Jarvis-Nexus** deploying from GitHub main. **Write access proven by real mutations**: variableUpsert → true, variableDelete → true (probe cleaned), volumeCreate → success
- Cloudflare `/user/tokens/verify` 401 was expected behaviour, not a fault: the supplied token is ACCOUNT-scoped (user-level endpoints answer 9109/401). Account access itself: 200 with matching account id

**Cloudflare R2 — S3 credentials CREATED via the API (no dashboard visit needed for the credential part)**
- Investigated per directive: official R2 docs state S3 credentials derive from an API token (AccessKeyID = token id; SecretAccessKey = SHA-256 of the token value). The supplied token can use the account-tokens API → created `jarvis-nexus-r2-s3` (policy: R2 bucket-item read/write + storage-metadata read) → derived S3 credentials, stored in `.env.local` + Railway (never printed/committed). Both tokens reach the R2 API; R2 itself returns `10042 "Please enable R2 through the Cloudflare Dashboard"` — a billing action the API reserves for the dashboard (established by real attempts on list + create with both tokens)

**Railway production bring-up (real operations, owner's own project)**
- Created the persistent **volume at `/data`** (SQLite home per Dockerfile); wrote **19 production environment variables** (DATABASE_URL=file:/data/custom.db + GitHub/Kaggle ×6/Cloudflare+R2/Supabase/EPIC/Railway credentials) with skipDeploys batching
- Deployment verified live: `https://jarvis-nexus-production.up.railway.app` — `/api/v1/health` answered 200 `degraded: DATABASE_URL missing` before the env writes; the post-push deployment boots with volume + full env
- `railwayStatus()` runtime surface now reports the live project + latest deployment + public URL (was a stale "needs write-scoped token" message)

**Kaggle ×6 — real data-plane operations per account**
- `kernels/list?user=<name>` → 200 on all six: **77 kernels visible** (e.g. `jimcreat/deyoung-diag`, `bittrexminingltd/deyoung-h3-b`); `datasets/list?user=` → 200 each; `competitions/list` → 200. Recorded the working query form (`mine=true` is rejected 400 by the current API — `user=` is correct)

**Supabase — precise single missing identifier established by attempt**
- The `sb_secret_` key is project-scoped (format-verified); management API rejects it (401) across Bearer/apikey/both/path variants — it requires an `sbp_` PAT. The **project URL** (Dashboard → Settings → API) is not in the repo, git history, reference repos, or Railway variables — the one datum the supplied credentials cannot self-discover. Key + DB password staged locally and on Railway; data-plane client activates with zero code changes once SUPABASE_URL exists

**Epic EOS — real OAuth attempts establish exactly what's missing**
- Supplied credential classified as the CLIENT ID (xyza7891 format, 32 chars). Real client-credentials attempts against `api.epicgames.dev/epic/oauth/v2/token` answered `invalid_client` / `invalid_client_credentials` (id-as-secret, id+empty-secret, bogus-id control) → the client secret (plus ProductId/DeploymentId from the EOS Developer Portal) is genuinely required and absent. EPIC_CLIENT_ID now configured locally + on Railway for the UE plugin

**Honest verifier rewrite** — `scripts/verify_integrations.py` encodes the API realities (account-scoped CF tokens, GraphQL null-propagation, project-scoped Supabase keys, EOS SDK-only auth): 11/15 OK; each non-OK row cites the real response + precise owner action. Local env completed (EPIC_CLIENT_ID, BLENDER_MCP_HOST/PORT, R2_BUCKET). Probe/audit scripts `scripts/probe_services*.py` + `scripts/configure_production.py` committed as reproducible evidence.

## 2026-11-12 (session 3) — Repository walkthrough + researched-tool integrations: Audio2Face-3D facial animation, MetaHuman drop-in path

**Repository investigation (Directive §2, repeated per user order)**
- All three reference repos (`reference/Jarvis/`, `ref_jarvis_repo/`, `repo-ref/`) diffed: near-identical clones of the same upstream (Python FastAPI CORE + Vite/three.js frontend); the live Next.js port already carries the world/character/scenario modules forward
- Full read of the live character stack: JarvisCharacterController.js (1,580 lines), client speech wiring, provider registry, send/TTS routes — the actual baseline for this session's work (previous summaries had drifted from the real state)

**Research (the repos the Master Directive names — RESEARCH_REGISTER F8–F14, with sources)**
- NVIDIA Audio2Face: open-sourced Sep 2025 (F8); the hosted build.nvidia.com NIM is DEPRECATED and gRPC-only (F9); full wire protocol extracted by cloning NVIDIA/Audio2Face-3D-Samples (F10): PCM16-mono WAV in → bidi `ProcessAudioStream` → ARKit blendshape keyframes `{time_code, values[]}` with CamelCase names + emotion params
- metahuman-to-glb: 5-stage UE 5.7 → Draco GLB pipeline, 51 ARKit blendshapes, ~40 MB; needs Windows + UE + Blender (F11). MetaHuman license permits use in ANY engine since 5.6 (F12) — our three.js use is compatible
- PixelStreamingInfrastructure: Epic's official external servers/frontend repo since UE 5.5 (F13) — recorded as the P4 Unreal-track transport
- Convention discovery (F14): UE/MetaHuman ARKit set uses SINGLE `mouthFunnel`/`mouthPucker` (no L/R) — 51 shapes excluding tongueOut; verified against NVIDIA's shipped configs

**Audio2Face-3D integration (Directive §14 — "connect to the real tools")**
- New provider `src/lib/nexus/providers/audio2face.ts` + `FacialAnimationProvider` contract + registry chain `NEXUS_FACE_PROVIDERS` (default `audio2face_local`); `runFacialAnimation()` with time budget
- `scripts/a2f_gateway.py`: self-hostable FastAPI gateway speaking NVIDIA's exact gRPC protocol (cloned client as the reference) → JSON `{fps, durationMs, curves}`; JARVIS emotion states mapped to A2F emotion strengths; honest /health; runs wherever the owner hosts A2F — no gRPC/npm deps in the Next.js tree
- `synthesizeVoice()` attaches the face track for the SAME audio chunk (budget `A2F_BUDGET_MS`, default 1200 ms, never delays first word); send route returns `audio_faces`, TTS route returns `faces`
- Client: track flows through the SpeechSequencer into `character.speak()`; `faceCurve.mjs` validates deeply and samples with linear interpolation; `_updateLipSync` Layer 0 = neural track (jaw/mouth/brow/cheek/nose/chin/tongue), blink + gaze stay LOCAL by design (ED-19/ED-20); expression layer defers brow/mouth to the track while active
- Honest degradation verified LIVE with no gateway configured: faces:null → local LipsyncZh/En engines drive speech (98 viseme segments in the headless audit); zero console errors

**MetaHuman drop-in path (D2 upgrade readiness)**
- New `src/nexus/vendor/skeletonMaps.mjs`: UE5→Mixamo bone map (one-to-one, completeness-tested), convention auto-detection, ARKit-51 list, viseme→ARKit fallback mixes
- Controller load() detects the skeleton convention and aliases bones — every downstream system (retarget tables, postures, gaze, fingers, accents) works unchanged on a metahuman-to-glb export; Avaturn-specific rest-pose calibration skipped for that convention; `_setMorph` degrades visemes to ARKit shapes on rigs without Oculus visemes

**Verification**
- 37/37 unit tests (13 new: track validation/sampling/ownership, bone-map completeness, viseme fallback, ARKit-51 exact set); `tsc --noEmit` clean; production build clean; headless audit v3 passes end-to-end (character loads, speaks, points, behaves)
- A2F chain verified LIVE against a clearly-labelled test-substitute gateway (`scripts/mock_a2f_gateway.py`, Directive §27) via `scripts/verify_a2f_stub.py`: PASS — cheekPuff (curve-only fingerprint) sustained >0.2, jawOpen varied >0.25 p2p and reached >0.6 on the live face morphs; send route returns `audio_faces`; client speaks through the sequencer. Only the NVIDIA gRPC hop inside the gateway remains externally blocked (wheel + GPU)

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

## Session 4 — 2026-11-12

- Absorbed reference/Jarvis (gitlinks removed) as canonical tracked copy; duplicates local-only.
- GitHub source of truth established: jamesrudh-arch/Jarvis-Nexus main @ 2656f3b (verified pushes; secrets audit clean each time).
- Live credential verification: GitHub OK (jamesrudh-arch, push), Kaggle 6/6 (jimcreat, wikeyoung, deyoungsltd, bittrexminingltd, wikeyoung5, youngwilly), Cloudflare account OK (R2 = real 10042 enable-required state), Railway read-auth OK (mutations 403), Supabase sb_secret_ = project-scoped (management wants sbp_).
- Integrations layer + GET/POST /api/v1/integrations (live checks, 30 s cache, no secrets in responses); InspectorDrawer Connections tab replaces the decorative static panel.
- Wake-word/standby/barge-in engine (web + iOS event contract); VAD-gated standby = zero network while silent; MIC/MASTER enforcement; first-open permission at MIC-switch-ON.
- unreal/ (bridge + EOS plugin), blender/ (bpy addon + MCP-style server), ios/ (SwiftUI + Speech + AVAudioSession) — code complete with exact bring-up READMEs; docs/INTEGRATIONS.md audit register.
- Production Dockerfile (+persistent volume), .dockerignore; PWA manifest + icons; mobile companion touch targets + safe areas.
- Verified: 37/37 tests, typecheck clean, build clean, standalone boot + health + live integrations check.
