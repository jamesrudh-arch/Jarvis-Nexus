# TECHNOLOGY REGISTER — Phase 2 Deliverable

**Project:** JARVIS NEXUS · **Phase:** 2 (research only — zero installations made)
**Compiled:** 2026-11-13 (session 9) · **Licence sources:** verified against the
official repositories/sites on this date (cited per entry).
**Classification scheme (directive Part 7.2):** ADOPT NOW · ADOPT LATER · EVALUATE · REJECT.

> Directive rule honoured: "Research first. Do not install everything blindly.
> Only install dependencies with an explicit architectural reason." Nothing was
> installed in Phase 2. Each ADOPT NOW item below carries the architectural
> reason and lands in its consuming phase; REJECT items carry the documented
> reason, per "Never silently skip".

---

## 1. Mandatory implementation repositories (Part 7.1)

### A. Unreal Engine — PRIMARY WORLD ENGINE

| Field | Record |
| --- | --- |
| Official URL | https://github.com/EpicGames/UnrealEngine |
| Licence | Unreal Engine EULA (source-available to accounts linked to an authorised Epic Games account; NOT open source) |
| Version | UE 5.x current release line (source branch `release`); exact commit pinned when the owner's UE machine is provisioned (Phase 3) |
| Purpose | Mandatory primary world engine (blueprint Part 5): World Partition, Landscape, Lumen/Nanite, Mass Entity, StateTree, Chaos vehicles, JARVIS embodiment |
| Required dependencies | Windows (or Linux) build environment, ~200 GB disk, VS 2022, authorised Epic GitHub link, GPU for editor/runtime |
| Integration method | `world/Unreal/JarvisWorld.uproject` (F-C1 naming ruling pending) + C++ modules + HTTP bridge to NEXUS (existing `unreal/Python/jarvis_http_bridge.py` pattern) + EOS plugin (skeleton exists) |
| Actual files used | `unreal/JarvisNexus.uproject`, `unreal/Config/DefaultEngine.ini`, `unreal/Plugins/JarvisNexusEOS/**`, `unreal/Python/jarvis_http_bridge.py` (session-4 skeleton — to be migrated/expanded at Phase 3) |
| Changes made | None yet (Phase 3) |
| Build or runtime result | NOT EXECUTED in sandbox — no UE, no GPU (blocker B2, Phase 0 report). Epic GitHub returns 404 without the authorised account link |
| Tests | Deferred to Phase 3 (project builds, test map loads, coordinate round-trip test to 1 cm) |
| Security considerations | EULA obligations (revenue share above threshold); EOS credentials handled via env (never in repo); no paid provisioning without approval |
| Performance implications | Targets in blueprint Part 15 (60 FPS avg / 30 min at 1080p) — measured on owner hardware only |
| Status | **ADOPT NOW** (implementation blocked by B2 — project authoring proceeds in-sandbox; exact missing: UE binary + authorised source access + GPU) |

### B. Blender — ASSET PRODUCTION

| Field | Record |
| --- | --- |
| Official URL | https://github.com/blender/blender |
| Licence | GPL-3.0 (source); Blender binaries free; Python API usage from our scripts does not copyleft our pipeline scripts (API boundary), but any DISTRIBUTED modifications of Blender itself would be GPL |
| Version | Current stable 5.x line (pinned at Phase 4; headless attempt via official tarball or `bpy` wheel) |
| Purpose | Mandatory asset pipeline (blueprint Part 6): procedural buildings, modular kits, interiors, props, materials, LODs, validation, batch export |
| Required dependencies | ~600 MB disk (tarball) — sandbox has 6.1 GB free; no GPU needed for headless modelling |
| Integration method | `world/Blender/` structure + `scripts/` automation (existing `blender/jarvis_blender/*` MCP work migrates) + FBX/glTF/USD export decision documented at Phase 4 |
| Actual files used | `blender/jarvis_blender/{__init__,operators,mcp_server}.py`, `blender/scripts/validate_and_export_glb.py` (existing) |
| Changes made | None yet (Phase 4) |
| Build or runtime result | NOT EXECUTED in sandbox yet — no blender binary (blocker B3); Phase 4 attempts headless bring-up |
| Tests | Phase 4: executable validation script (scale/transforms/materials/UVs/collision/LODs/naming/triangles/metadata) + three real assets |
| Security considerations | MCP server binds localhost only; no network rendering to untrusted endpoints |
| Performance implications | Batch generation offline; no runtime cost |
| Status | **ADOPT NOW** (execution blocked by B3 with a scheduled in-sandbox attempt) |

### C. FreeMoCap — MOTION CAPTURE

| Field | Record |
| --- | --- |
| Official URL | https://github.com/freemocap/freemocap |
| Licence | **AGPL-3.0** (verified: repo LICENSE + freemocap.org/download, 2026-11-13) |
| Version | Alpha line (pin at adoption) |
| Purpose | Markerless mocap → BVH/FBX/TRC → Blender retarget → Unreal (blueprint animation pipeline) |
| Required dependencies | Multi-camera capture rig (owner hardware), Python 3.x |
| Integration method | Standalone tool pipeline (capture on owner machine → data files into `world/Blender/animations/`); **no code linking** — we invoke it as a tool and consume its exports, keeping our code out of AGPL scope |
| Actual files used | None yet (Phase 7 animation work) |
| Changes made | None |
| Build or runtime result | NOT EXECUTED (owner-side rig required) |
| Tests | Deferred (Phase 7: capture → retarget → Unreal import verification) |
| Security considerations | AGPL obligation: if we ever LINK FreeMoCap code into a network-served product we must open-source that service. Current plan (standalone tool + file exchange) avoids this — obligation documented |
| Performance implications | Offline capture; no runtime cost |
| Status | **ADOPT LATER** (Phase 7; AGPL boundary respected by design) |

### D. Natron — COMPOSITING / VFX

| Field | Record |
| --- | --- |
| Official URL | https://github.com/NatronGitHub/Natron |
| Licence | **GPL-2.0-or-later** (verified: repo + natrongithub.github.io/about, 2026-11-13) |
| Version | RB-2.6 line |
| Purpose | Node-based compositing for render passes, image sequences, VFX asset finishing (NOT a real-time renderer — blueprint explicit) |
| Integration method | Standalone tool; project files + render automation via its Python API; consumes Blender/Unreal render outputs |
| Actual files used | None yet |
| Changes made | None |
| Build or runtime result | Not executed (no current render-farm need) |
| Tests | Deferred |
| Security considerations | GPLv2: same standalone-tool boundary as FreeMoCap |
| Performance implications | Offline only |
| Status | **EVALUATE** (adopt when the render/compositing stage exists — Phase 4+ renders or Part 17 evidence post-production) |

### E. Theatre.js — CINEMATIC SEQUENCING (Three.js frontend)

| Field | Record |
| --- | --- |
| Official URL | https://github.com/theatre-js/theatre |
| Licence | **Apache-2.0 (`@theatre/core`) + AGPL-3.0 (`@theatre/studio`)** (verified: repo README, 2026-11-13). Production bundles include ONLY the Apache-licensed core; the studio is a development-time tool |
| Version | 0.7.x line (1.0 in progress upstream) |
| Purpose | Cinematic sequencing, timeline motion, camera choreography, UI transitions in the existing Three.js sanctuary (blueprint 7.1.E) |
| Required dependencies | npm (browser bundle) |
| Integration method | npm dependency in the Next.js app; sequences authored with the studio in dev builds only |
| Actual files used | None yet |
| Changes made | None |
| Build or runtime result | Not executed |
| Tests | Deferred (Phase 12 cinematic work) |
| Security considerations | Licence split must be respected: never ship `@theatre/studio` in production bundles (AGPL) — enforced via dependency review + bundle audit |
| Performance implications | Small core runtime; sequences replace bespoke tween code where justified |
| Status | **ADOPT LATER** (Phase 12; must show measurable benefit over the existing ScenarioDirector3D timeline system — "do not replace a working stack without measurable justification") |

### F. CARLA — AUTONOMOUS-DRIVING SIMULATION

| Field | Record |
| --- | --- |
| Official URL | https://github.com/carla-simulator/carla |
| Licence | **MIT (code) + CC-BY (assets)** (verified: repo + carla.org, 2026-11-13) |
| Version | 0.10.x line |
| Purpose | Directive: "evaluate and integrate where justified for vehicle and autonomous-driving simulation" |
| Integration method | n/a (rejected — see rationale) |
| Actual files used | None |
| Changes made | None |
| Build or runtime result | Not executed |
| Tests | n/a |
| Security considerations | n/a |
| Performance implications | CARLA requires tens of GB and a GPU; sandbox has neither |
| Status | **REJECT** — documented reason: (1) the world's traffic is fictional-city-scale ambient simulation, not autonomous-driving research; (2) blueprint Part 9.5 names Unreal Chaos as the vehicle physics owner; (3) CARLA would constitute a competing authoritative state system (blueprint 7.1 warning); (4) GPU/disk cost unjustified. Revisit ONLY if autonomous-driving experiments enter the Laboratory scope |

### G. SUMO — TRAFFIC SIMULATION

| Field | Record |
| --- | --- |
| Official URL | https://github.com/eclipse-sumo/sumo |
| Licence | **EPL-2.0 (and GPL-2.0 where noted)** (verified: repo + eclipse.dev/sumo, 2026-11-13) |
| Version | 1.2x current line |
| Purpose | Microscopic traffic-network simulation, routing, flow optimisation for the road atlas (blueprint 7.1.G) |
| Required dependencies | Python (`traci`), network definitions (our atlas GeoJSON → OSM-like network) |
| Integration method | Candidate TRAFFIC-STATE OWNER at Phase 9 (blueprint 9.5: "Choose and document one authoritative traffic-state owner"): SUMO computes routes/flows offline or co-simulated; Unreal visualises. Our fictional road network exports to SUMO's format |
| Actual files used | None yet |
| Changes made | None |
| Build or runtime result | Not executed (Phase 9 evaluation — pip-installable, sandbox-compatible) |
| Tests | Deferred (Phase 9: every vehicle completes a journey to a valid destination) |
| Security considerations | Runs offline; no network exposure |
| Performance implications | Handles 10k+ vehicles headlessly; far beyond the vertical slice's 20 |
| Status | **ADOPT LATER** (Phase 9 traffic phase; single authoritative-owner decision documented then) |

### H. Mesa — AGENT-BASED SIMULATION

| Field | Record |
| --- | --- |
| Official URL | https://github.com/mesa/mesa |
| Licence | **Apache-2.0** (verified: mesa.readthedocs.io + repo, 2026-11-13) |
| Version | 3.x/4.0 line |
| Purpose | Agent-based modelling for civilisation-scale population dynamics (blueprint 7.1.H) |
| Integration method | Candidate for the OFFLINE macro-simulation tier (distant regions at reduced fidelity, blueprint Part 15) while the vertical slice runs bespoke full-fidelity inhabitants |
| Actual files used | None yet |
| Changes made | None |
| Build or runtime result | Not executed |
| Tests | Deferred (Phase 7/8 evaluation against the bespoke scheduler) |
| Security considerations | None (offline library) |
| Performance implications | Python-tier; suitable for background macro ticks, not real-time visuals |
| Status | **EVALUATE** (Phase 7: adopt only if it outperforms the bespoke schedule/needs engine for the distant-population tier) |

### I. PettingZoo — MULTI-AGENT RL

| Field | Record |
| --- | --- |
| Official URL | https://github.com/Farama-Foundation/PettingZoo |
| Licence | **MIT** (verified: repo LICENSE, 2026-11-13) |
| Version | 1.24.x line |
| Purpose | Multi-agent RL environments IF inhabitant/group behaviour learning is adopted (blueprint 7.1.I) |
| Integration method | Training-time only (offline); trained policies export to the behaviour runtime — never a runtime dependency |
| Actual files used | None |
| Changes made | None |
| Build or runtime result | Not executed |
| Tests | Deferred |
| Security considerations | None |
| Performance implications | Training only; no runtime cost |
| Status | **EVALUATE** (only if Laboratory experiments require learned inhabitant policies; not on the Phase 6–15 critical path) |

---

## 2. Additional mandatory technology evaluations (Part 7.2)

| Technology | Purpose | Licence (verified) | Obligations / notes | Integration approach | Decision |
| --- | --- | --- | --- | --- | --- |
| OpenUSD | Scene interchange Blender ↔ Unreal ↔ tools | Modified Apache 2.0 (Pixar) | Patent notice terms; not plain Apache | Primary interchange format at Phase 4 if the FBX-vs-USD evaluation favours it (UE5 native USD stage support) | **ADOPT LATER** (Phase 4 format decision, documented with technical reason per blueprint Part 6) |
| Infinigen | Procedural 3D scene generation | **BSD-3-Clause** (verified: infinigen.org, 2026-11-13) | Attribution | Reference for procedural vegetation/terrain rules; our world is DESIGNED, not random | **EVALUATE** |
| QGIS | GIS authoring/verification for the atlas | GPL-2.0+ | Standalone tool; outputs are data (no copyleft on our GeoJSON) | Headless CLI validation of atlas GeoJSON at Phase 5 | **EVALUATE** (ADOPT at Phase 5 if hand-rolled validation is insufficient) |
| Cesium for Unreal | Real-world 3D geospatial streaming | Apache-2.0 (plugin) + commercial Cesium ion data (verified: cesium.com FAQ, 2026-11-13) | ion data has usage tiers | n/a — our world is FICTIONAL (anchor 45.0/10.0, invented geography) | **REJECT** (real-world geodata conflicts with the fictional-civilisation design; revisit only for a real-Earth mode) |
| OpenStreetMap | Real map data | ODbL 1.0 (share-alike for data) | Attribution + share-alike if derivative databases are published | n/a — fictional world | **REJECT** (same reason as Cesium; ODbL obligations noted for completeness) |
| OSM2World | OSM → 3D | GPL | n/a | n/a | **REJECT** (with the OSM decision) |
| BlenderGIS | GIS in Blender | GPL (Blender addon) | n/a | n/a | **REJECT** (with the OSM decision) |
| Blosm | OSM/city import in Blender | Freemium (base free; **Pro is PAID** ~€18, verified: vvoovv/blosm + Gumroad, 2026-11-13) | Paid tier needs owner approval (Part 22) | n/a | **REJECT** (real-world import + paid tier; our atlas is generated from our own geographic data) |
| Buildify | Blender building-kit addon | Freeware/Gumroad distribution | Kit-based, not procedural-spec-driven | Reference only | **EVALUATE** (as visual reference for the modular kit; the architecture bible mandates OUR kit with our metadata/naming/LOD rules) |
| Unreal PCG | Procedural content in-engine | UE EULA (built into UE5) | Epic EULA | Blueprint Part 5 native system: scatter, building variation, vegetation | **ADOPT NOW** (lands with Phase 3/6) |
| Project Chrono | Advanced multibody physics | BSD-3-Clause | Attribution | Only if vehicle/robot physics exceed Chaos needs | **EVALUATE** |
| OpenDRIVE | Road-network description standard | ASAM standard licence (free) | Standard format, not software | Export format candidate IF SUMO/road tooling adopted at Phase 9 | **EVALUATE** |
| OpenSCENARIO | Scenario description standard | ASAM standard licence (free) | Same | Scenario interchange for traffic tests | **EVALUATE** |
| Mass Entity | UE crowd/mass simulation | UE EULA (built-in) | Epic EULA | Blueprint Part 15: "Mass-compatible distant population" | **ADOPT NOW** (lands with the population phase) |
| StateTree | UE stateful AI | UE EULA (built-in) | Epic EULA | Inhabitant/NPC behaviour trees | **ADOPT NOW** (lands with Phase 7) |
| LangGraph | Mission-state orchestration | **MIT** (verified: repo LICENSE, 2026-11-13) | Permissive | Blueprint Part 12: "LangGraph is the single mission-state authority" — directive-mandated for the mission lifecycle (checkpoints, recovery, replay) | **ADOPT NOW** (lands with Phase 14 missions) |
| Inspect AI | LLM/agent evaluation | MIT (UK AI Safety Institute) | Permissive | Evaluation harness for agent/mission quality runs | **EVALUATE** (Phase 14 observability) |
| Phoenix (Arize) | LLM tracing/observability | **Elastic License 2.0** (verified: arize.com/docs/phoenix licence page, 2026-11-13) | ELv2: self-hosting free and permitted; may NOT be offered as a managed service | Self-hosted tracing at the mission/orchestration phase | **ADOPT LATER** (Phase 14; ELv2 obligations documented — internal self-host use is permitted) |
| Graphiti | Temporal knowledge graphs | **Apache-2.0** (verified: repo LICENSE, 2026-11-13) | Permissive | Strong fit for the Part 3.1 memory tiers (episodic/semantic/epistemic with temporal invalidation) | **ADOPT LATER** (memory-system phase; blueprint gap F-A… memory tiers are PARTIALLY IMPLEMENTED today) |
| OpenHands | Coding-agent platform | **MIT** (verified: repo LICENSE, 2026-11-13) | Permissive | n/a — this project already has its engineering agent; running an always-on agent server adds attack surface and duplicate function | **REJECT** (documented reason: no current need + security surface; revisit if owner wants autonomous CI agents) |
| Pipecat | Voice/multimodal agent framework | **BSD-2-Clause** (verified: repo LICENSE, 2026-11-13) | Permissive | Blueprint Part 3.2: "Evaluate Pipecat and existing voice infrastructure. Do not replace a working stack without measurable justification" — the current stack (z-ai TTS/ASR + streaming + wake word) WORKS and is production-verified | **EVALUATE** (A/B at Phase 12 on first-chunk latency and interruption handling; adopt only on measured superiority) |
| Yjs | CRDT collaborative data | MIT | Permissive | Multi-user editing is a D4 future path ("without a rewrite") | **EVALUATE** (deferred until multi-user exists) |
| Automerge | CRDT collaborative data | **MIT** (verified: repo LICENSE, 2026-11-13) | Permissive | Same as Yjs; evaluate both together | **EVALUATE** |
| Poly Haven | CC0 textures/HDRI/models | **CC0** | No attribution required (they request it) | Phase 4 material library | **ADOPT NOW** (CC0 — licence-clean) |
| ambientCG | CC0 PBR materials | **CC0** | None | Phase 4 material library | **ADOPT NOW** |
| Kenney | CC0 game assets | CC0 (assets) | None | Phase 4/6 placeholder-to-final props | **ADOPT NOW** |
| Quaternius | CC0 low-poly models | CC0 | None | Phase 6 greybox/ambient props | **ADOPT NOW** |
| KayKit | CC0 character/prop packs | CC0 | None | Phase 7 inhabitant greyboxing (MetaHuman/AI-generated characters replace for hero-level) | **ADOPT NOW** |

---

## 3. Decision summary

| Decision | Count | Items |
| --- | --- | --- |
| ADOPT NOW | 11 | Unreal Engine (B2-blocked, authoring proceeds) · Blender (B3 attempt at Phase 4) · Unreal PCG · Mass Entity · StateTree · LangGraph · Poly Haven · ambientCG · Kenney · Quaternius · KayKit |
| ADOPT LATER | 6 | FreeMoCap (Phase 7) · Theatre.js (Phase 12) · SUMO (Phase 9) · OpenUSD (Phase 4 decision) · Phoenix (Phase 14) · Graphiti (memory phase) |
| EVALUATE | 13 | Natron · Mesa · PettingZoo · Infinigen · QGIS · Buildify · Project Chrono · OpenDRIVE · OpenSCENARIO · Inspect AI · Pipecat · Yjs · Automerge |
| REJECT | 7 | CARLA · Cesium for Unreal · OpenStreetMap · OSM2World · BlenderGIS · Blosm · OpenHands — each with a documented reason (fictional-world design, competing state authority, paid tier, security surface) |

## 4. Licence-risk register

- **AGPL-3.0 (FreeMoCap; Theatre.js studio):** safe under the standalone-tool / dev-only-dependency boundary. NEVER link AGPL code into served products and never ship `@theatre/studio` in production bundles (enforced by dependency review + bundle audit at adoption).
- **Elastic License 2.0 (Phoenix):** self-hosting permitted; must never be offered as a managed service. Internal observability use is compliant.
- **GPL family (Natron GPLv2+, Blender GPL-3, QGIS GPL-2+):** standalone tools; our scripts interact via APIs/files — no distribution of modified GPL binaries planned.
- **UE EULA (engine, PCG, Mass Entity, StateTree, MetaHuman):** revenue-share terms above the threshold; MetaHuman use in any engine permitted since UE 5.6 (existing finding F12).
- **ASAM (OpenDRIVE/OpenSCENARIO):** standards use is free; verify redistribution terms if spec documents are bundled.
- **CC0 (Poly Haven, ambientCG, Kenney, Quaternius, KayKit):** no obligations; attribution given voluntarily in asset metadata (which blueprint Part 6 mandates anyway).
- **ODbL (OSM):** rejected path; obligations documented for completeness.

## 5. Phase-2 boundary statement

No packages installed, no code written, no credentials used beyond public
web research. Every licence claim above was verified against the official
repository or vendor page on 2026-11-13; verification sources are named
inline. Items marked ADOPT NOW enter their consuming phases (3, 4, 6, 7, 14)
with the integration method stated above; nothing is claimed integrated —
integration evidence lands phase by phase per the directive's status labels.
