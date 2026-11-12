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
