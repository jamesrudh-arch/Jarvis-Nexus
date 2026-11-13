# RESEARCH_REGISTER — JARVIS NEXUS

Section 8 of the Master Directive: distinguish VERIFIED FACTS, TESTED RESULTS,
ENGINEERING RECOMMENDATIONS, and UNRESOLVED QUESTIONS. Never disguise an
assumption as a verified fact.

## Verified facts (external sources, checked)

| # | Fact | Source / date |
|---|------|---------------|
| F1 | Avaturn ToS grants personal-use-only, revocable license; commercial use prohibited; IP vests in Goodsize; USD 1M minimum compensation clause; commercial licensing via sales (Enterprise "custom T&C") | avaturn.live/terms-of-use, fetched 2026-11-12 |
| F2 | Avaturn PRO plan = USD 800/month (avatar creation platform/SDK: 1,000 avatars/mo, +$0.15 extra, custom branding/garments); Enterprise = custom T&C, dedicated options | avaturn.me/pricing, fetched 2026-11-12 |
| F3 | WebGPU is enabled by default from iOS 26; WebGL2 remains the compatibility baseline | Stage-1 research (2026-11) |
| F4 | Ready Player Me shut down 2026-01 — not an option | Stage-1 research |
| F5 | metahuman-to-glb (MIT) exports 51 ARKit blendshapes; threejs-hair-shader (MIT) available | Stage-1 research (verify again at P4 adoption) |
| F6 | three.js has no built-in subsurface scattering | Stage-1 research |
| F7 | Character GLB forensics: generator "Avaturn.me \| Blender"; 54 joints (docs claimed 66); 72 head morphs + Eyes/EyeAO/Eyelash/Teeth/Tongue; 31,181 tris; extensionsUsed [] (no Draco/KTX2/meshopt); 14 MB raw textures; no hair/cloth bones; no embedded animations | Stage-2 GLB dump (`scripts/dump_glb.cjs`) |
| F8 | NVIDIA open-sourced Audio2Face (models + SDK) Sep 2025 — the repo named in the Master Directive | developer.nvidia.com/blog/nvidia-open-sources-audio2face-animation-model (2025-09-24), fetched 2026-11-12 |
| F9 | The hosted Audio2Face-3D NIM on build.nvidia.com is labelled **Deprecated**; gRPC-only (grpc.nvcf.nvidia.com:443, `authorization: Bearer`, `function-id` per model: Claire 0961a6da-fb9e-4f2e-8491-247e5fd7bf8d, Mark 8efc55f5-6f00-424e-afe9-26212cd2c630, James 9327c39f-a361-4e02-bd72-e11b4c9b7b5e) | build.nvidia.com/nvidia/audio2face-3d/api, fetched 2026-11-12 |
| F10 | A2F-3D protocol (from cloning NVIDIA/Audio2Face-3D-Samples): bidi gRPC `ProcessAudioStream`; client sends AudioStreamHeader (face/emotion post-processing params) → AudioWithEmotion PCM16-mono chunks (packet 0 carries EmotionWithTimeCode list) → EndOfAudio; server returns AnimationDataStreamHeader (blendshape name list) + AnimationData.skel_animation.blend_shape_weights [{time_code, values[]}]; blendshape names CamelCase ARKit (EyeBlinkLeft, JawOpen…); emotion aggregate in metadata | github.com/NVIDIA/Audio2Face-3D-Samples @ scripts/audio2face_3d_api_client, cloned and read 2026-11-12 (Apache-2.0) |
| F11 | metahuman-to-glb pipeline: 5 stages (UE 5.7 assemble → Sequencer ARKit bake FBX → Blender shape-key transfer via KDTree → Draco GLB → three.js viewer), 51 ARKit blendshapes, ~40 MB output, 1024px texture cap; requires Windows + UnrealEditor-Cmd + Blender 5.x; UE GLTFExporter strips morph names (~700 MB output), hence the Sequencer FBX bake path | github.com/creategamecharacters/metahuman-to-glb README, fetched 2026-11-12 (MIT) |
| F12 | MetaHuman licensing: included in the standard Unreal Engine license (free under USD 1M revenue); since UE 5.6 MetaHumans can be used in ANY engine or DCC (Unity, Godot, Blender, Houdini, Maya…) — a MetaHuman-derived GLB in our three.js app is license-compatible | metahuman.com/license + Epic 5.6 announcements, fetched 2026-11-12 |
| F13 | PixelStreamingInfrastructure is Epic's official external repo of the Pixel Streaming servers + web frontend (Signalling Server, Matchmaker, SFU) since UE 5.5; the in-engine plugin points there now — the production path for serving an Unreal-rendered sanctuary to browsers/mobile via WebRTC | github.com/EpicGames/PixelStreamingInfrastructure + dev.epicgames.com documentation (UE 5.5+), fetched 2026-11-12 |
| F14 | UE/MetaHuman ARKit convention: `mouthFunnel` and `mouthPucker` are SINGLE shapes (no Left/Right variants); the A2F/metahuman-to-glb shared set is 51 shapes excluding tongueOut (needs non-default rig variant) | NVIDIA shipped config_claire/mark.yml multipliers list + metahuman-to-glb README, verified 2026-11-12 |

## Tested results (this project, this session)

| # | Result | Test |
|---|-------|------|
| T1 | Composer at CSS-pixel size on DPR≥2 devices = the zoom-blur root cause; fixed via setPixelRatio on all paths | Code-level: NexusSanctuaryScene.js init/resize/adaptive + pyramid |
| T2 | Branch `and` conditions never matched before the parser; Media Wall vs stage vs banner now agree | Unit + integration tests (8/8 + 1/1 registry) |
| T3 | End-to-end provider chain works: conversation → registry → z-ai → directive + WAV (728 KB audio) + emotion tone; telemetry reports `zai_cloud_route (fallback chain)` | Live server smoke test 2026-11-12 |
| T4 | Strict build passes after fixing 4 classes of hidden type errors | `tsc --noEmit` exit 0; `next build` exit 0 |
| T5 | Dependency purge is safe: only 11/77 packages were imported by app code (plus dev tooling); zero broken imports after removal | `scripts/dep_audit.py` + build + runtime |
| T6 | KTX2 compression on this model: VRAM 1.5 GB → 335 MB | Stage-1 measurement on jarvis_avaturn.glb |
| T7 | Streaming TTS candidates: Qwen3-TTS ~97 ms first chunk; Orpheus, CosyVoice 2 commercially usable | Stage-1 research — NOT yet tested on our reference scripts (P2 gate per D3) |
| T8 | Face-track pipeline (session 3): 37/37 unit tests incl. 13 new (validateFaceTrack fail-safety, curve interpolation/clamping, blink+gaze local ownership, MetaHuman bone-map completeness + one-to-one, viseme→ARKit fallback validity, ARKit-51 exact set) | `npm test` 2026-11-12 |
| T9 | No-gateway degradation path verified LIVE: /conversations/send with no A2F_SERVICE_URL → synthesizeVoice returns faces:null → local LipsyncZh/En engines drive speech (98 viseme segments observed); character, pointing (aimW 0.53), behavior director, scenario narration all pass the headless audit with the skeleton-aliasing refactor in place | scripts/audit_v3.py headless run 2026-11-12, zero console errors |
| T10 | A2F face-track chain verified LIVE with a clearly-labelled test-substitute gateway (scripts/mock_a2f_gateway.py, Directive §27): provider fetch → gateway JSON contract → synthesizeVoice attach → send route `audio_faces` → client sequencer → character.speak → curve sampling → live morphs. PASS criteria all met: cheekPuff (curve-only fingerprint) sustained >0.2; jawOpen varied >0.25 peak-to-peak; jawOpen reached >0.6. Only the NVIDIA gRPC hop inside scripts/a2f_gateway.py remains externally blocked | scripts/verify_a2f_stub.py headless run 2026-11-12 |

## Engineering recommendations (not yet tested/adopted)

- R1: Viseme work in P2 should target the ARKit/viseme standard so a P4 MetaHuman migration carries it over (D2 hedge)
- R2: Reflector should render only the stage subgraph, half-res on mobile tiers (currently full scene twice)
- R3: The three reference-repo copies (`repo-ref/`, `reference/Jarvis/`, `ref_jarvis_repo/`) are near-identical duplicates including 3× the model files — deduplicate to ONE reference when disk/audit hygiene matters (user decision; not touched this session)
- R4: `examples/websocket/` (server.ts + frontend.tsx) is a viable D4 presence-lite seed; add `socket.io`/`socket.io-client` when activating

## Image classification (D7 — inspected via VLM, 2026-11-12)

All 7 uploads are THIS project's own material (not external references):

| File | Class | Actual contents |
|------|-------|-----------------|
| upload/IMG_9024.png | Scenario concept + character/clothing reference | Woman in dark blazer + high-neck top, hair in a bun, touching a cyan holographic wireframe over a black table; cinematic low-key teal/black |
| upload/IMG_9025.png | Environment reference | Dark futuristic operations room: illuminated floor rings, glass data columns, cyan holo building projection; woman in dark suit |
| upload/IMG_9026.png | Scenario concept | Holo geometric projection over round table; visible text "J.A.R.V.I.S NEXUS / SPATIAL RECONSTRUCTION", "Precision: 0.98", "Recall: 0.96" |
| upload/IMG_9027.png | Scenario concept (cryo manifold) | Voxel pipe reconstruction with wireframe figures; "VOXEL RESOLUTION: 3mm", "FAILURE SEQUENCE: POINT OF ORIGIN", "IMPACT STRESS: 210 MPA (CRITICAL)", "TEMP: 180°C" — matches the cryo_manifold_forensic scenario |
| upload/IMG_9050.png | Interface inspiration (current app, MOBILE) | Live mobile screenshot: 3D view + chat ("cryo manifold B-4", "210 MPa spike"), INSPECT, CAM OFF, Interrupt |
| upload/IMG_9051.png | Interface (current app, DESKTOP) | Live desktop screenshot: Simulation & Scenario Director UI, "MASTER:ON MIC:OFF CAM:OFF", Resume Work |
| upload/IMG_9052.png | Interface inspiration (current app, MOBILE) | Live mobile screenshot from behind character + teal torus holo + chat, "nexus_cloud_route" visible |

Implication: the concept renders (9024–9027) fix the canonical look — dark blazer,
high-neck top, hair bun, cyan/teal holographic language — and the app screenshots
(9050–9052) are the UX baseline for the P1 mobile overhaul before/after comparison.

## Unresolved questions

| # | Question | Gate |
|---|----------|------|
| Q1 | Does Epic's MetaHuman EULA permit our intended browser-companion deployment, or only Unreal-embedded use? | Verify BEFORE P4 migration (D2) |
| Q2 | Which streaming TTS engine preserves Tongtong identity best? | P2 evaluation with same reference scripts (D3) |
| Q3 | Does the pyramid-mode bloom look correct on a real external display (Pepper's Ghost rig)? | Device test (B11 residual) |
| Q4 | z-ai SDK streaming support for TTS? | Re-check at P2; if absent, chain stays batch for z-ai and streaming comes from an added provider |

---

## Phase 2 — Technology Register (2026-11-13)

The directive-mandated technology register (Part 7: nine mandatory repositories
with full integration records + 27 additional evaluations, every licence
verified against official sources on 2026-11-13) lives at
**`docs/research/TECHNOLOGY_REGISTER.md`** — the canonical Phase 2 deliverable.
Decisions: 11 ADOPT NOW · 6 ADOPT LATER · 13 EVALUATE · 7 REJECT (each with
documented reason). Licence-risk register for AGPL/ELv2/GPL/UE-EULA/ASAM/CC0/
ODbL included there.
