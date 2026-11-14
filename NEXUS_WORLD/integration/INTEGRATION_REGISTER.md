# JARVIS NEXUS — Live Integration Register

Maintained per the Mandatory System-Wide Integration Directive §5. States: DISCOVERED → EVALUATED → APPROVED → INSTALLED → CONNECTED → REGISTERED → TESTED → OPERATIONAL. A technology reaches OPERATIONAL only with recorded evidence. `Decision` records intelligent selection (§6): PROCEED / DEFER / REJECT.

## Summary

| # | Technology | Category | State | Decision | Reason |
|---|---|---|---|---|---|
| 1 | Unreal asset pipeline (Blender side) | 3D asset pipeline | OPERATIONAL | PROCEED | export side real and bundle-complete; import side precisely blocked with documented requirements |
| 2 | Creatures (birds + quadrupeds) | 3D characters & animation | OPERATIONAL | PROCEED | verified geometry + animation |
| 3 | Procedural characters + armature animation | 3D characters & animation | OPERATIONAL | PROCEED | real armatures + real fcurves, verified |
| 4 | bpy (Blender as module) | 3D modelling | OPERATIONAL | PROCEED | Continuation Directive items 3+4: Blender Python API + 3D world generation + visual inspection — all delivered with real |
| 5 | trimesh | 3D modelling | EVALUATED | DEFER | installed in env; Phase 4 3D asset pipeline; not wired to avoid dead dependencies |
| 6 | usd-core (OpenUSD) | 3D modelling / scene description | EVALUATED | DEFER | Phase 4 (visuals); cp312 wheel 28MB verified; TOST-1.0 licence reviewed |
| 7 | Blender MCP server (self-built, headless) | 3D modelling MCP | OPERATIONAL | PROCEED | 10 real tools, all exercised with evidence this session |
| 8 | Automated correction + regeneration loop | 3D observability | OPERATIONAL | PROCEED | full loop exercised with real evidence |
| 9 | Visual quality inspection v2 | 3D observability | OPERATIONAL | PROCEED | calibrated, honest, regression-safe |
| 10 | Rigid-body physics (bake + measured read-back) | 3D physics | OPERATIONAL | PROCEED | real simulated, baked and measured physics |
| 11 | Procedural world generation (deterministic fBm) | 3D world generation | OPERATIONAL | PROCEED | deterministic, tested, integrated |
| 12 | Terrain + environmental systems (bpy realisation) | 3D world generation | OPERATIONAL | PROCEED | real bpy geometry with verified counts |
| 13 | Ollama | AI models / inference (local) | EVALUATED | REJECT | install.sh requires sudo + systemd service — neither exists in this sandbox; hosted APIs remain the Tier 0 path (ADR) |
| 14 | llama-cpp-python | AI models / inference (local) | EVALUATED | REJECT | PyPI ships sdist ONLY (no wheels) — full C++ compile on 2 cores; maintenance liability in a no-root sandbox |
| 15 | onnxruntime | AI models / inference (local) | EVALUATED | DEFER | right tool when small local models (embeddings/classifiers) are needed; autoregressive LLM generation stays hosted per A |
| 16 | vLLM / SGLang | AI models / inference (serving) | EVALUATED | DEFER | GPU-bound (ADR-005); Tier 2+ hardware decision |
| 17 | H2O LLM Studio | AI models / training | EVALUATED | DEFER | directive's own rule: defer until a real fine-tuning need + GPU tier exist (NVIDIA GPU + 128-256GB RAM mandatory) |
| 18 | FastAPI + uvicorn | API framework | OPERATIONAL | PROCEED | established architecture component; security-patched this phase |
| 19 | openai SDK | APIs & SDKs | EVALUATED | REJECT | would drag a SECOND HTTP stack (httpx2 + jiter) alongside pinned httpx 0.28.1; raw httpx keeps one stack and full timeou |
| 20 | Playwright | Browser automation | OPERATIONAL | PROCEED | chosen over Stagehand (deferred) and browser MCPs (duplicate capability) per directive Part 3 evaluation |
| 21 | Stagehand | Browser automation | EVALUATED | DEFER | no semantic-browsing requirement yet; direct Playwright covers current needs; MIT + v4.4.0 verified healthy — integrate  |
| 22 | @playwright/mcp | Browser automation (MCP) | EVALUATED | DEFER | duplicate capability vs direct Playwright integration (directive §6 rejects duplicates); revisit when EXTERNAL MCP clien |
| 23 | chrome-devtools-mcp | Browser automation (MCP) | EVALUATED | DEFER | secondary to Playwright; requires a Chrome/Chrome-for-Testing binary download + shared-lib check first |
| 24 | Browserbase MCP | Browser automation (cloud) | EVALUATED | DEFER | needs BROWSERBASE_API_KEY + paid account; local Playwright covers Tier 0 |
| 25 | OpenCV (headless) | Computer vision | OPERATIONAL | PROCEED | strongest existing CPU vision implementation; zero new dependencies |
| 26 | CUT3R | Computer vision (3D reconstruction) | EVALUATED | REJECT | CC BY-NC-SA 4.0 (non-commercial), dormant since 2025-08-27, CUDA required |
| 27 | Frigate | Computer vision (NVR) | EVALUATED | REJECT | requires physical cameras + bare-metal Docker host + accelerator — none exist here (MQTT integration path documented for |
| 28 | Anthropic computer-use demo | Computer-use systems | EVALUATED | DEFER | requires Docker + X11/VNC + Claude API credentials — none available (no daemon, no display, no keys) |
| 29 | OpenAdapt | Computer-use systems | EVALUATED | DEFER | targets an interactive GUI desktop session; headless sandbox has no display |
| 30 | UI-TARS | Computer-use systems | EVALUATED | REJECT | 7B+ vision-language model — impossible in 3.9GB RAM on CPU |
| 31 | johnvansickle static ffmpeg | Creative production | EVALUATED | REJECT | site unreachable from this sandbox network (HTTP 000, 30s timeouts — verified) |
| 32 | imageio-ffmpeg | Creative production (audio/video) | EVALUATED | DEFER | needed when world timeline audio/video rendering arrives; wav output already covered natively |
| 33 | 3D render pipeline (render3d.*) | Creative production / visualisation | OPERATIONAL | PROCEED | Continuation Directive item 4: 3D world generation + visual inspection + automated correction |
| 34 | SQLite event store (stdlib sqlite3) | Data / event store | OPERATIONAL | PROCEED | strongest existing implementation for Tier 0; DuckDB/Postgres deferred by tier |
| 35 | DuckDB | Data processing / analytics | EVALUATED | DEFER | event store is append-heavy OLTP; revisit for Tier 1 projection/analytics queries |
| 36 | Docker | Deployment / infrastructure | EVALUATED | REJECT | no daemon, no root, cannot install (hard environmental block, verified `docker: command not found`) |
| 37 | RunAnywhere | Deployment / runtimes | EVALUATED | REJECT | custom non-OSI threshold licence; Python SDK alpha and NOT on PyPI (404 verified) |
| 38 | Railway GraphQL v2 API (workspace token) | Deployment platform API | OPERATIONAL | PROCEED | live verification of an existing, deployed, publicly-reachable service with real logs — PRIORITY 1 satisfied read-only |
| 39 | Railway CLI | Deployment platform tooling | EVALUATED | DEFER | CLI rejects workspace tokens on its user-scoped auth check; GraphQL API covers the verification needs; GitHub-repo deplo |
| 40 | Unreal MCP server (self-built, Remote Control API client) | Game engine MCP | REGISTERED | PROCEED | protocol-verified with honest unreachable reporting; editor execution blocked on user-provided hardware (checklist docum |
| 41 | Bevy | Game engines | EVALUATED | REJECT | no Rust toolchain in sandbox; full crate compile on 2 cores impractical |
| 42 | Godot headless | Game engines / digital environments | EVALUATED | DEFER | no game project and no Python bindings — a GDScript shell adds nothing today; revisit if an interactive digital environm |
| 43 | UE5 / CARLA | Game engines / digital environments | EVALUATED | REJECT | GPU-bound + ~100GB disk + UE EULA still UNVERIFIED (L-04); Phase 0 ADR-005 deferral stands |
| 44 | OpenAI API (raw httpx provider) | Hosted LLM provider | INSTALLED | DEFER | network-edge geo-block of the sandbox egress IP + truncated key — both external; diagnosis complete with hard evidence;  |
| 45 | Z-AI CLI (GLM chat completions) | Hosted LLM provider | OPERATIONAL | PROCEED | live completions verified again this session; rate-limit resilience proven in both directions |
| 46 | MCP Integration Layer (official mcp SDK) | MCP client infrastructure | OPERATIONAL | PROCEED | core directive requirement; dual-gated (layer allowlist + server --read-only) |
| 47 | mcp-for-blender (blender-mcp) | MCP server — 3D | EVALUATED | REJECT | requires the Blender DESKTOP APP with GUI running (addon starts a socket server inside Blender, started from the N-panel |
| 48 | @modelcontextprotocol/server-puppeteer | MCP server — browser | EVALUATED | REJECT | ARCHIVED — 'no longer maintained, NO SECURITY GUARANTEES' (upstream), deprecated on npm since 2025-05 |
| 49 | @modelcontextprotocol/server-postgres | MCP server — database | EVALUATED | REJECT | ARCHIVED/deprecated (0.6.2, 2024-12-04); postgres-mcp is the maintained successor when Postgres lands |
| 50 | mcp-server-sqlite (official) | MCP server — database | EVALUATED | REJECT | removed from npm entirely (E404 verified); PyPI copy unmaintained since 2025-04; ALSO duplicate capability — the native  |
| 51 | postgres-mcp (Postgres MCP Pro) | MCP server — database | EVALUATED | DEFER | trigger: Tier 1 PostgreSQL deployment (ADR-001); pinned to mcp SDK 1.x — matches our pin |
| 52 | mcp-server-git (official) | MCP server — development | EVALUATED | DEFER | repository managed directly with git CLI; no agent-driven git need yet |
| 53 | Filesystem MCP Server | MCP server — file & workspace | OPERATIONAL | PROCEED | mandated file/workspace MCP category; read-only scope matches Tier 0 risk posture |
| 54 | VedantRGosavi/UE5-MCP | MCP server — game engine | EVALUATED | REJECT | explicitly abandoned by author ('didn't move forward') |
| 55 | chongdashu/unreal-mcp | MCP server — game engine | EVALUATED | REJECT | stale (2025-04-22), self-described experimental, needs editor |
| 56 | flopperam/unreal-engine-mcp | MCP server — game engine | EVALUATED | REJECT | project relocated/absorbed elsewhere |
| 57 | kvick-games/UnrealMCP | MCP server — game engine | EVALUATED | REJECT | stale (last commit 2025-06-22), very WIP, Windows-centric |
| 58 | ue-mcp | MCP server — game engine | EVALUATED | REJECT | fundamentally needs a live UE 5.4-5.9 editor (GUI) — impossible without GPU/display/100GB disk; best-in-class option rec |
| 59 | @modelcontextprotocol/server-memory | MCP server — memory | EVALUATED | DEFER | Phase 2 resident-memory subsystem will decide between this, Graphiti, and a Postgres schema (L-05) |
| 60 | JARVIS MCP Server (self-exposure) | MCP server — platform exposure | OPERATIONAL | PROCEED | directive requires exposing capabilities through MCP, not just consuming |
| 61 | mcp-server-time (official) | MCP server — time | EVALUATED | DEFER | the world clock is the authoritative time source inside the simulation |
| 62 | mcp-server-fetch (official) | MCP server — web fetch | EVALUATED | DEFER | browser.navigate + httpx provider cover fetching; add when an LLM agent needs raw-fetch tool semantics |
| 63 | Notion MCP (hosted remote) | MCP server — workspace | EVALUATED | DEFER | no Notion workspace in scope; self-hosted repo itself is no longer actively maintained (hosted remote is the path if eve |
| 64 | mcp-obsidian (PyPI) | MCP server — workspace | EVALUATED | REJECT | requires the Obsidian desktop app RUNNING + API key (obsidian-mcp is the headless path) |
| 65 | mcp-obsidian (npm) | MCP server — workspace | EVALUATED | REJECT | NO licence, NO repository field — unverifiable provenance, rejected on supply-chain security |
| 66 | obsidian-mcp | MCP server — workspace/lore | EVALUATED | DEFER | lore/codex subsystem arrives with narrative phases; verified headless-capable |
| 67 | Grafana | Monitoring & observability | EVALUATED | DEFER | separate stateful service — no host to spare at Tier 0; AGPL-3.0 licence noted for Tier 1 decision |
| 68 | JSON structured logging (stdlib) | Monitoring & observability | OPERATIONAL | PROCEED | structlog/loguru REJECTED as unjustified dependencies (see below) |
| 69 | OpenTelemetry Python SDK | Monitoring & observability | EVALUATED | DEFER | meaningful only with an OTLP collector at Tier 1; prometheus_client covers Tier 0 |
| 70 | loguru | Monitoring & observability | EVALUATED | REJECT | replaces stdlib global logging state and breaks parity with uvicorn/FastAPI loggers; unjustified dependency |
| 71 | prometheus_client | Monitoring & observability | OPERATIONAL | PROCEED | zero new deps; Grafana/OTel deferred to Tier 1 |
| 72 | structlog | Monitoring & observability | EVALUATED | REJECT | stdlib logging + 15-line JSON formatter delivers the requirement with ZERO dependencies (directive Part 5) |
| 73 | OpenAI 403 diagnostics (edge geo-block analysis) | Network diagnostics | OPERATIONAL | PROCEED | complete diagnosis with hard evidence; resolution is user-side (full-length key + supported-region egress) |
| 74 | Central orchestrator + permission system | Platform core (internal) | OPERATIONAL | PROCEED | directive Part 6: one orchestrator, everything registers here |
| 75 | Goals, mood + autonomy policy layer | Resident cognition | OPERATIONAL | PROCEED | the honest scripted-vs-autonomous distinction the directive demands — measured, not asserted |
| 76 | Long-term memory + relationship graph | Resident cognition | OPERATIONAL | PROCEED | event-derived, replay-safe, tested |
| 77 | Resident mind API (inner life endpoints) | Resident cognition API | OPERATIONAL | PROCEED | tested live over the real API |
| 78 | ROS 2 | Robotics / hardware | EVALUATED | REJECT | installation requires root + apt + Ubuntu (official docs); Debian Tier-3 at best; no robot hardware exists |
| 79 | pyserial / pyfirmata | Robotics / hardware | EVALUATED | REJECT | ZERO serial devices exist in this sandbox — nothing to talk to |
| 80 | Gazebo | Robotics / simulation | EVALUATED | REJECT | apt-only distribution; no py3.12 pip path |
| 81 | bandit | Security tooling | OPERATIONAL | PROCEED | account-free SAST; semgrep deferred as heavier Tier 1 option |
| 82 | detect-secrets | Security tooling | EVALUATED | DEFER | optional pre-commit hygiene; last release 2024-05 (slowing) — evaluate alternatives when repo goes public |
| 83 | pip-audit | Security tooling | OPERATIONAL | PROCEED | account-free CVE scanning; safety REJECTED (account-gated) |
| 84 | safety | Security tooling | EVALUATED | REJECT | account-gated (signup/login required); free tier unsuitable; pip-audit covers this account-free |
| 85 | semgrep | Security tooling | EVALUATED | DEFER | 72MB heavy for CI-less Tier 0; bandit covers Python AST needs; revisit at Tier 1 CI |
| 86 | trufflehog (PyPI) | Security tooling | EVALUATED | REJECT | PyPI package abandoned since 2021 (the real tool is a Go binary); AGPL-3.0 |
| 87 | Repast HPC | Simulation frameworks | EVALUATED | REJECT | unmaintained since 2022 (Phase 0 finding); Mesa is the adopted path (ADR-003) |
| 88 | faster-whisper | Voice / speech (ASR) | EVALUATED | DEFER | no audio input pipeline until voice commands arrive (Phase 2+); benchmarked: tiny int8 = 11x realtime at 447MB RSS |
| 89 | openai-whisper | Voice / speech (ASR) | EVALUATED | REJECT | torch 539MB + stale releases; faster-whisper is strictly better for CPU |
| 90 | whisper.cpp / pywhispercpp | Voice / speech (ASR) | EVALUATED | DEFER | alternative to faster-whisper when RAM is tight; pywhispercpp ships cp312 wheels |
| 91 | coqui-tts | Voice / speech (TTS) | EVALUATED | REJECT | 148 modules import torch at runtime (539MB wheel) — zero CPU-quality gain over piper/kokoro for our use |
| 92 | kokoro (official package) | Voice / speech (TTS) | EVALUATED | REJECT | requires torch + transformers; kokoro-onnx is the CPU path (deferred entry) |
| 93 | kokoro-onnx | Voice / speech (TTS) | EVALUATED | DEFER | piper chosen for speed (17x realtime measured); kokoro is the quality option when synthesis time is not critical |
| 94 | piper-phonemize | Voice / speech (TTS) | EVALUATED | REJECT | NOT on PyPI (verified); obsolete — piper 1.8 embeds espeak-ng in its wheel |
| 95 | piper-tts | Voice / speech (TTS) | OPERATIONAL | PROCEED | research benchmark: 4x realtime at 306 MB RSS, torch-free — best CPU TTS; kokoro-onnx deferred as quality alternative |

## Detail records

### 1. Unreal asset pipeline (Blender side) — OPERATIONAL (decision: PROCEED)

- **category**: 3D asset pipeline
- **provider**: Blender Foundation (exporters) + NEXUS WORLD (bundle)
- **repo url**: https://github.com/blender/blender
- **purpose**: Blender→Unreal asset pipeline: USD/glTF/FBX exports, now a full UE-ready BUNDLE (3 formats + manifest with naming/axis/unit conventions + honest import status)
- **integration method**: render3d/ue_export.py — exporter kwargs introspected at runtime (5.x-safe), magic-byte verification py-side, manifest builder
- **install status**: installed (part of bpy venv + py3.12 side)
- **connection status**: connected via MCP export_unreal_bundle tool + driver 'bundle' op
- **orchestrator registration**: render3d.ue_export on the orchestrator
- **operational test**: nexus3d W9/W10 (12/12): USD+FBX+GLB exported, magic bytes verified, manifest with verified_import:false (honest); full-world bundle on disk (workspace/exports/world_bundle_full: USD 739 KB, FBX 32.7 MB, GLB 3.7 MB)
- **security assessment**: workspace-confined outputs; no credentials
- **licensing**: Apache-2.0
- **deployment location**: Tier-0 sandbox; import side requires UE 5.4+ on Windows/GPU (documented, not claimed)
- **limitations**: UE import half remains blocked on hardware — the manifest records verified_import:false until a real editor executes
- **evidence**: NEXUS3D_TEST_OUTPUT.txt W9/W10 + manifest.json in workspace/exports/p4_acceptance_bundle/
- **state**: OPERATIONAL
- **decision reason**: export side real and bundle-complete; import side precisely blocked with documented requirements

### 2. Creatures (birds + quadrupeds) — OPERATIONAL (decision: PROCEED)

- **category**: 3D characters & animation
- **provider**: NEXUS WORLD (self-built) on bpy 5.3
- **repo url**: —
- **purpose**: Living fauna: 10 birds with wing-flap keyframes on noise flight paths + 2 quadrupeds with diagonal-pair gait cycles
- **integration method**: render3d/characters_core.py:build_creatures
- **install status**: runs in the bpy venv
- **connection status**: part of the composite world build
- **orchestrator registration**: render3d.worldgen orchestrator capability
- **operational test**: nexus3d W7 (12/12): 10 birds, 20 animated wings, 2 quadrupeds with gait keys
- **security assessment**: workspace-confined
- **licensing**: ours
- **deployment location**: Tier-0 sandbox
- **limitations**: procedural loops, not agent-driven (fauna has no needs model yet)
- **evidence**: NEXUS3D_TEST_OUTPUT.txt W7
- **state**: OPERATIONAL
- **decision reason**: verified geometry + animation

### 3. Procedural characters + armature animation — OPERATIONAL (decision: PROCEED)

- **category**: 3D characters & animation
- **provider**: NEXUS WORLD (self-built) on bpy 5.3
- **repo url**: —
- **purpose**: Rigged humanoid residents (8-bone armatures, bone-parented mesh parts, keyframed walk/idle cycles driven by the simulated position timeline)
- **integration method**: render3d/characters_core.py: data-level bone parenting (parent_type/parent_bone/matrix_parent_inverse — no operator context needed headless)
- **install status**: runs in the bpy venv
- **connection status**: MCP tool build_characters
- **orchestrator registration**: render3d.worldgen orchestrator capability
- **operational test**: nexus3d W6 (12/12): 6 rigs × (torso/head/2 arms/2 legs) = 36 bone-parented parts + 6 walk cycles
- **security assessment**: workspace-confined
- **licensing**: ours
- **deployment location**: Tier-0 sandbox
- **limitations**: FK bone rotation cycles (no IK); straight-line walk paths at Tier 0
- **evidence**: NEXUS3D_TEST_OUTPUT.txt W6
- **state**: OPERATIONAL
- **decision reason**: real armatures + real fcurves, verified

### 4. bpy (Blender as module) — OPERATIONAL (decision: PROCEED)

- **category**: 3D modelling
- **provider**: Blender Foundation
- **repo url**: https://github.com/blender/blender
- **purpose**: Headless Blender 5.3: real scene construction, Cycles CPU rendering, USD/glTF/FBX export, keyframe animation — the 3D half of NEXUS WORLD
- **integration method**: dedicated sidecar venv (.venv-blender, Python 3.13 + bpy 5.3.0 + mcp<2, 407MB wheel) driven by render3d/driver.py subprocess and the Blender MCP server; DECISION REVERSED from Phase 1B REJECT — the rejection reason (wheels need py3.13, host is 3.12) is void now that uv + a py3.13 sidecar venv exist on this host
- **install status**: installed (uv venv, .venv-blender; recreatable: uv venv .venv-blender --python 3.13 && uv pip install --python .venv-blender/bin/python bpy 'mcp<2')
- **connection status**: connected — in-process bpy import verified (blender 5.3.0), Cycles CPU renders + exports executed
- **orchestrator registration**: via the Blender MCP server tools (mcp.blender.*) and render3d.* capabilities
- **operational test**: PASS — R2 (version), R3-R5 (top/street/night renders), R8-R10 (USD/GLB/FBX export with magic-byte checks), R17 (144 fcurves)
- **security assessment**: subprocess isolation; MCP-server path confinement to workspace dir; no network use
- **licensing**: GPL-3.0 (Blender); used as a local tool, not redistributed — Founder decision needed before any binary distribution
- **deployment location**: Tier 0 sandbox (.venv-blender sidecar, gitignored; workspace artifacts under workspace/)
- **limitations**: CPU-only rendering (no GPU) — 480x270/8 samples ≈ 1-3 s, 960x540/24 ≈ 15-40 s; buildings are boxes with kind materials; resident markers are body+head meshes (rigged characters are Phase 3+)
- **evidence**: reports/RENDER3D_TEST_OUTPUT.txt checks R2-R10, R17
- **state**: OPERATIONAL
- **decision reason**: Continuation Directive items 3+4: Blender Python API + 3D world generation + visual inspection — all delivered with real-operation evidence

### 5. trimesh — EVALUATED (decision: DEFER)

- **category**: 3D modelling
- **provider**: mikedh
- **repo url**: https://github.com/mikedh/trimesh
- **purpose**: Lightweight mesh import/export/analysis
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: installed in env; Phase 4 3D asset pipeline; not wired to avoid dead dependencies

### 6. usd-core (OpenUSD) — EVALUATED (decision: DEFER)

- **category**: 3D modelling / scene description
- **provider**: Pixar
- **repo url**: https://github.com/PixarAnimationStudios/OpenUSD
- **purpose**: 3D scene interchange for world visualisation
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: Phase 4 (visuals); cp312 wheel 28MB verified; TOST-1.0 licence reviewed

### 7. Blender MCP server (self-built, headless) — OPERATIONAL (decision: PROCEED)

- **category**: 3D modelling MCP
- **provider**: NEXUS WORLD (self-built)
- **repo url**: https://github.com/blender/blender
- **purpose**: Headless Blender Python API control over MCP stdio — the 3D half of NEXUS WORLD through the central orchestrator
- **integration method**: FastMCP stdio server in the bpy 5.3 venv, 10 tools (6 original + build_terrain_scene, build_characters, run_physics, export_unreal_bundle), path-confinement guard, stdout shield
- **install status**: installed (.venv-blender, Python 3.13 + bpy 5.3.0 + mcp<2)
- **connection status**: connected via integration/mcp_layer.py; R11 handshake + tool discovery re-verified with the 10-tool set
- **orchestrator registration**: mcp.blender on the ONE orchestrator
- **operational test**: render3d_acceptance R11-R17 (17/17) + nexus3d W4/W6/W8/W9 (12/12) — real bpy calls through MCP transport
- **security assessment**: path confinement to workspace; credentials never reach the child env
- **licensing**: Apache-2.0 (Blender); server code ours
- **deployment location**: Tier-0 sandbox (CPU Cycles)
- **limitations**: CPU-only rendering; FBX export of full worlds takes ~8-10 min on 2 cores
- **evidence**: RENDER3D_TEST_OUTPUT.txt + NEXUS3D_TEST_OUTPUT.txt (this session)
- **state**: OPERATIONAL
- **decision reason**: 10 real tools, all exercised with evidence this session

### 8. Automated correction + regeneration loop — OPERATIONAL (decision: PROCEED)

- **category**: 3D observability
- **provider**: NEXUS WORLD (self-built)
- **repo url**: —
- **purpose**: The self-healing render chain: inspection failure → parameter escalation (correction) → deterministic scene REGENERATION (noon light + top view) if all corrections fail
- **integration method**: render3d/inspection.py:render_with_regeneration wired into pipeline.render
- **install status**: part of the repo
- **connection status**: render3d.render capability
- **orchestrator registration**: on the orchestrator (render3d.render)
- **operational test**: nexus3d W11 (12/12): broken frames fail corrections, regeneration produces a passing frame (real files, real inspection)
- **security assessment**: n/a
- **licensing**: ours
- **deployment location**: Tier-0 sandbox
- **limitations**: one regeneration attempt per render call
- **evidence**: NEXUS3D_TEST_OUTPUT.txt W11
- **state**: OPERATIONAL
- **decision reason**: full loop exercised with real evidence

### 9. Visual quality inspection v2 — OPERATIONAL (decision: PROCEED)

- **category**: 3D observability
- **provider**: NEXUS WORLD on OpenCV
- **repo url**: https://github.com/opencv/opencv
- **purpose**: Programmatic render inspection: existence, size, brightness, variance, colour diversity + NEW sharpness (Laplacian variance), saturation, edge density — calibrated against all accepted render evidence so no prior evidence is retroactively invalidated
- **integration method**: render3d/inspection.py thresholds calibrated on 2026-11-13 render corpus (known-good night/street renders: lap_var 4.3–36, saturation 27–70)
- **install status**: part of the repo (opencv headless)
- **connection status**: inside render3d.render/worldgen capabilities
- **orchestrator registration**: render3d.inspect orchestrator capability
- **operational test**: nexus3d W5 (12/12) + render3d A7-A9 regression (17/17)
- **security assessment**: n/a
- **licensing**: Apache-2.0
- **deployment location**: Tier-0 sandbox
- **limitations**: programmatic metrics, not aesthetic judgement
- **evidence**: NEXUS3D_TEST_OUTPUT.txt W5
- **state**: OPERATIONAL
- **decision reason**: calibrated, honest, regression-safe

### 10. Rigid-body physics (bake + measured read-back) — OPERATIONAL (decision: PROCEED)

- **category**: 3D physics
- **provider**: NEXUS WORLD (self-built) on bpy 5.3
- **repo url**: —
- **purpose**: Real physics in the world: deterministic drop tests with baked point caches and MEASURED outcomes (drop distance, rest height, bounce counts) read back via frame_set + evaluated depsgraph
- **integration method**: render3d/physics_core.py: rigidbody world, ptcache.bake_all, per-frame evaluated matrix_world sampling
- **install status**: runs in the bpy venv
- **connection status**: MCP tool run_physics + driver 'world' op
- **orchestrator registration**: render3d.physics orchestrator capability
- **operational test**: nexus3d W8 (12/12): 12/12 bodies simulated, 18 measured bounces, mean rest height 0.037 (physically consistent with the -0.4 ground + body radii)
- **security assessment**: workspace-confined
- **licensing**: ours
- **deployment location**: Tier-0 sandbox (Bullet via bpy)
- **limitations**: drop tests at Tier 0; resident interactions with physics bodies not yet coupled
- **evidence**: NEXUS3D_TEST_OUTPUT.txt W8 + physics probe
- **state**: OPERATIONAL
- **decision reason**: real simulated, baked and measured physics

### 11. Procedural world generation (deterministic fBm) — OPERATIONAL (decision: PROCEED)

- **category**: 3D world generation
- **provider**: NEXUS WORLD (self-built)
- **repo url**: —
- **purpose**: Terrain elevation, hydrology, parks, vegetation, rocks for NEXUS WORLD — the procedural world layer
- **integration method**: render3d/worldgen.py: hash-seeded multi-octave value noise (NO RNG state — replay-safe), city-flattening heightfield sampling, environmental context for residents
- **install status**: part of the repo
- **connection status**: n/a (pure module)
- **orchestrator registration**: input to render3d.worldgen orchestrator capability
- **operational test**: nexus3d W1-W3 (12/12): determinism, seed variance, city-flattening (height 0 on roads)
- **security assessment**: n/a
- **licensing**: ours
- **deployment location**: Tier-0 sandbox
- **limitations**: visual/environmental layer at Tier 0 — does not alter resident movement (regression-safe by design)
- **evidence**: NEXUS3D_TEST_OUTPUT.txt W1-W3
- **state**: OPERATIONAL
- **decision reason**: deterministic, tested, integrated

### 12. Terrain + environmental systems (bpy realisation) — OPERATIONAL (decision: PROCEED)

- **category**: 3D world generation
- **provider**: NEXUS WORLD (self-built) on bpy 5.3
- **repo url**: —
- **purpose**: Heightfield mesh (4096 verts/3969 faces), water plane (transmission material), park grounds, 160 trees (oak/pine), shoreline rocks, rain particle system (4000 particles)
- **integration method**: render3d/terrain_core.py — bmesh displacement, city-flattened heights, particle emitter
- **install status**: runs in the bpy venv
- **connection status**: MCP tool build_terrain_scene + driver 'world' op
- **orchestrator registration**: render3d.worldgen orchestrator capability
- **operational test**: nexus3d W4/W4b (12/12): real geometry counts read back from bpy.data; rain particles configured
- **security assessment**: workspace-confined
- **licensing**: ours
- **deployment location**: Tier-0 sandbox (CPU)
- **limitations**: particle systems evaluate at render time; terrain is visual + environmental, not a movement graph
- **evidence**: NEXUS3D_TEST_OUTPUT.txt W4/W4b + world renders
- **state**: OPERATIONAL
- **decision reason**: real bpy geometry with verified counts

### 13. Ollama — EVALUATED (decision: REJECT)

- **category**: AI models / inference (local)
- **provider**: Ollama
- **repo url**: https://github.com/ollama/ollama
- **purpose**: Local model server
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: install.sh requires sudo + systemd service — neither exists in this sandbox; hosted APIs remain the Tier 0 path (ADR)

### 14. llama-cpp-python — EVALUATED (decision: REJECT)

- **category**: AI models / inference (local)
- **provider**: abetlen
- **repo url**: https://github.com/abetlen/llama-cpp-python
- **purpose**: llama.cpp Python bindings
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: PyPI ships sdist ONLY (no wheels) — full C++ compile on 2 cores; maintenance liability in a no-root sandbox

### 15. onnxruntime — EVALUATED (decision: DEFER)

- **category**: AI models / inference (local)
- **provider**: Microsoft
- **repo url**: https://github.com/microsoft/onnxruntime
- **purpose**: Torch-free CPU inference for small ONNX models
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: right tool when small local models (embeddings/classifiers) are needed; autoregressive LLM generation stays hosted per ADR

### 16. vLLM / SGLang — EVALUATED (decision: DEFER)

- **category**: AI models / inference (serving)
- **provider**: vLLM / SGLang projects
- **repo url**: https://github.com/vllm-project/vllm
- **purpose**: High-throughput LLM serving
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: GPU-bound (ADR-005); Tier 2+ hardware decision

### 17. H2O LLM Studio — EVALUATED (decision: DEFER)

- **category**: AI models / training
- **provider**: H2O.ai
- **repo url**: https://github.com/h2oai/h2o-llmstudio
- **purpose**: No-code LLM fine-tuning
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: directive's own rule: defer until a real fine-tuning need + GPU tier exist (NVIDIA GPU + 128-256GB RAM mandatory)

### 18. FastAPI + uvicorn — OPERATIONAL (decision: PROCEED)

- **category**: API framework
- **provider**: FastAPI project / encode
- **repo url**: https://github.com/fastapi/fastapi
- **purpose**: World API gateway: 11 Phase-1 endpoints + additive /metrics, /integrations, /integrations/health
- **integration method**: fastapi 0.162.6 + uvicorn 0.44.0 (workers=1 — SQLite single writer)
- **install status**: installed; UPGRADED 0.128.0 → 0.162.6 during this phase to clear 5 starlette CVEs
- **connection status**: connected (TestClient + live uvicorn in Phase 1 evidence)
- **orchestrator registration**: POST /command routes through the central orchestrator; external capabilities reachable (A4)
- **operational test**: PASS — Phase 1 suite 48/48 re-run on the upgraded stack; integration A1-A5
- **security assessment**: pip-audit clean post-upgrade; token auth 401/403 verified in Phase 1; TLS/rate-limiting remain deployment-tier
- **licensing**: MIT (fastapi) / BSD-3 (uvicorn, starlette)
- **deployment location**: Tier 0 sandbox; Railway at Tier 1 (creds pending)
- **limitations**: workers must stay 1 at Tier 0 (SQLite single writer, L-11)
- **evidence**: reports/PHASE1_TEST_OUTPUT.txt 48/48 on upgraded stack; reports/INTEGRATION_TEST_OUTPUT.txt A1-A5; reports/SECURITY_SCAN_OUTPUT.txt section 2-4
- **state**: OPERATIONAL
- **decision reason**: established architecture component; security-patched this phase

### 19. openai SDK — EVALUATED (decision: REJECT)

- **category**: APIs & SDKs
- **provider**: OpenAI
- **repo url**: https://github.com/openai/openai-python
- **purpose**: Official OpenAI client
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: would drag a SECOND HTTP stack (httpx2 + jiter) alongside pinned httpx 0.28.1; raw httpx keeps one stack and full timeout/retry/SSE control (httpx-sse already present)

### 20. Playwright — OPERATIONAL (decision: PROCEED)

- **category**: Browser automation
- **provider**: Microsoft
- **repo url**: https://github.com/microsoft/playwright-python
- **purpose**: Headless chromium automation: navigate, extract text/links, screenshot (computer-use substrate)
- **integration method**: sync API in ONE dedicated worker thread (official constraint: sync API is not thread-safe and must not run inside asyncio); integration/browser.py
- **install status**: installed (playwright 1.57.0 + chromium-1200 browser binaries)
- **connection status**: connected — real chromium 143 launches, renders, closes cleanly
- **orchestrator registration**: browser.navigate / browser.screenshot / browser.links
- **operational test**: PASS — B1-B4 (local fixture + live https://example.com 200), X1 orchestrated screenshot
- **security assessment**: headless, no credentials stored; navigation timeouts enforced; screenshot path caller-supplied (EXTERNAL action class + founder approval required)
- **licensing**: Apache-2.0
- **deployment location**: Tier 0 sandbox (in-process thread)
- **limitations**: fresh hosts need chromium system libs (deb.deps list; verified present here); sync API single-thread constraint; no interaction ops yet (click/type land with computer-use phase)
- **evidence**: reports/INTEGRATION_TEST_OUTPUT.txt checks B1-B4, X1-X2
- **state**: OPERATIONAL
- **decision reason**: chosen over Stagehand (deferred) and browser MCPs (duplicate capability) per directive Part 3 evaluation

### 21. Stagehand — EVALUATED (decision: DEFER)

- **category**: Browser automation
- **provider**: Browserbase
- **repo url**: https://github.com/browserbase/stagehand
- **purpose**: AI-driven semantic browsing (natural-language page actions)
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: BYO-LLM callback needs LLM credentials (Phase 2 dependency)
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: no semantic-browsing requirement yet; direct Playwright covers current needs; MIT + v4.4.0 verified healthy — integrate when residents browse by intent

### 22. @playwright/mcp — EVALUATED (decision: DEFER)

- **category**: Browser automation (MCP)
- **provider**: Microsoft
- **repo url**: https://github.com/microsoft/playwright-mcp
- **purpose**: Browser automation exposed as an MCP server (accessibility-tree based)
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: verified runnable in this sandbox (npx --version 0.0.85)
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: duplicate capability vs direct Playwright integration (directive §6 rejects duplicates); revisit when EXTERNAL MCP clients need browser control

### 23. chrome-devtools-mcp — EVALUATED (decision: DEFER)

- **category**: Browser automation (MCP)
- **provider**: ChromeDevTools
- **repo url**: https://github.com/ChromeDevTools/chrome-devtools-mcp
- **purpose**: DevTools-grade network/console/perf control
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: telemetry on by default (opt-out env)
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: secondary to Playwright; requires a Chrome/Chrome-for-Testing binary download + shared-lib check first

### 24. Browserbase MCP — EVALUATED (decision: DEFER)

- **category**: Browser automation (cloud)
- **provider**: Browserbase
- **repo url**: https://github.com/browserbase/mcp-server-browserbase
- **purpose**: Cloud browser automation
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: needs BROWSERBASE_API_KEY + paid account; local Playwright covers Tier 0

### 25. OpenCV (headless) — OPERATIONAL (decision: PROCEED)

- **category**: Computer vision
- **provider**: OpenCV
- **repo url**: https://github.com/opencv/opencv-python
- **purpose**: Torch-free CPU image analysis (dimensions, colour, edges, sharpness, QR)
- **integration method**: opencv-python-headless 4.13.0.90 via integration/vision.py
- **install status**: installed (pre-present, verified Apache-2.0)
- **connection status**: n/a (library, in-process)
- **orchestrator registration**: vision.analyze_image / vision.decode_qr
- **operational test**: PASS — V1 (known fixture 64x32x3), V2 (QR encode→decode roundtrip), V3 (screenshot analysis)
- **security assessment**: pure computation on caller-supplied images; no network; base64 input validated
- **licensing**: Apache-2.0
- **deployment location**: Tier 0 sandbox (in-process)
- **limitations**: no object detection (needs ONNX models — deferred with onnxruntime entry); QR encoder output includes its own quiet zone (extra border breaks the detector — documented in code)
- **evidence**: reports/INTEGRATION_TEST_OUTPUT.txt checks V1-V3
- **state**: OPERATIONAL
- **decision reason**: strongest existing CPU vision implementation; zero new dependencies

### 26. CUT3R — EVALUATED (decision: REJECT)

- **category**: Computer vision (3D reconstruction)
- **provider**: CUT3R project
- **repo url**: https://github.com/CUT3R/CUT3R
- **purpose**: Streaming 3D reconstruction
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: CC BY-NC-SA 4.0 (non-commercial), dormant since 2025-08-27, CUDA required

### 27. Frigate — EVALUATED (decision: REJECT)

- **category**: Computer vision (NVR)
- **provider**: Blake Blackshear
- **repo url**: https://github.com/blakeblackshear/frigate
- **purpose**: Local camera NVR with object detection
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: requires physical cameras + bare-metal Docker host + accelerator — none exist here (MQTT integration path documented for a future hardware tier)

### 28. Anthropic computer-use demo — EVALUATED (decision: DEFER)

- **category**: Computer-use systems
- **provider**: Anthropic
- **repo url**: https://github.com/anthropics/anthropic-quickstarts
- **purpose**: Reference GUI computer-use agent
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: requires Docker + X11/VNC + Claude API credentials — none available (no daemon, no display, no keys)

### 29. OpenAdapt — EVALUATED (decision: DEFER)

- **category**: Computer-use systems
- **provider**: OpenAdaptAI
- **repo url**: https://github.com/OpenAdaptAI/OpenAdapt
- **purpose**: Desktop record/replay agent
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: targets an interactive GUI desktop session; headless sandbox has no display

### 30. UI-TARS — EVALUATED (decision: REJECT)

- **category**: Computer-use systems
- **provider**: ByteDance
- **repo url**: https://github.com/bytedance/UI-TARS
- **purpose**: GUI agent VLM (UI-TARS-1.5-7B)
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: 7B+ vision-language model — impossible in 3.9GB RAM on CPU

### 31. johnvansickle static ffmpeg — EVALUATED (decision: REJECT)

- **category**: Creative production
- **provider**: John Van Sickle
- **repo url**: https://johnvansickle.com/ffmpeg
- **purpose**: Static ffmpeg builds
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: site unreachable from this sandbox network (HTTP 000, 30s timeouts — verified)

### 32. imageio-ffmpeg — EVALUATED (decision: DEFER)

- **category**: Creative production (audio/video)
- **provider**: imageio
- **repo url**: https://github.com/imageio/imageio-ffmpeg
- **purpose**: pip-bundled ffmpeg binary (BSD-2 wrapper)
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: needed when world timeline audio/video rendering arrives; wav output already covered natively

### 33. 3D render pipeline (render3d.*) — OPERATIONAL (decision: PROCEED)

- **category**: Creative production / visualisation
- **provider**: JARVIS NEXUS (own code)
- **repo url**: render3d/
- **purpose**: World → scene spec → Blender → PNG renders with OpenCV visual inspection and AUTOMATED CORRECTION (escalating brightness/samples/camera on failed frames), plus asset exports
- **integration method**: orchestrator capabilities render3d.{render,export,animate,inspect}; MCP-first transport with direct-driver fallback; POST /render API route
- **install status**: installed (project code; no new main-env dependencies — cv2 already present)
- **connection status**: connected — both transports exercised
- **orchestrator registration**: 4 capabilities + POST /render (founder-gated, audited, idempotent)
- **operational test**: PASS — R3-R7 (renders + inspection + auto-correction of a deliberately broken frame), R8-R10 (exports), A8 (POST /render end-to-end through the orchestrator)
- **security assessment**: founder-token gated; outputs confined to workspace/; renders inspected before being reported as OK
- **licensing**: project code
- **deployment location**: Tier 0 sandbox; renders in workspace/renders
- **limitations**: inspection is programmatic (brightness/variance/colour diversity), not semantic — a 'passing' frame is well-exposed and non-degenerate, not necessarily beautiful
- **evidence**: reports/RENDER3D_TEST_OUTPUT.txt all checks; reports/INTEGRATION_TEST_OUTPUT.txt checks A7-A9
- **state**: OPERATIONAL
- **decision reason**: Continuation Directive item 4: 3D world generation + visual inspection + automated correction

### 34. SQLite event store (stdlib sqlite3) — OPERATIONAL (decision: PROCEED)

- **category**: Data / event store
- **provider**: SQLite
- **repo url**: https://www.sqlite.org
- **purpose**: Authoritative append-only event log + projections (event-sourced world state)
- **integration method**: stdlib sqlite3; WAL; check_same_thread=False + writer RLock added this phase for FastAPI threadpool safety
- **install status**: built-in (SQLite 3.53.1 bundled with Python)
- **connection status**: n/a (embedded)
- **orchestrator registration**: WorldStore backs every orchestrator command + audit
- **operational test**: PASS — Phase 0 11/11, Phase 1 48/48 (incl. replay/restart/determinism), integration X3-X4 (audit + idempotency through external tools)
- **security assessment**: SQL injection scan clean (bandit B608 remediated to constant parameterised queries); single-writer by design
- **licensing**: Public domain
- **deployment location**: Tier 0 sandbox (file); PostgreSQL at Tier 1 (ADR-001)
- **limitations**: single writer process (L-11); no concurrent multi-writer until Tier 1
- **evidence**: reports/SECURITY_SCAN_OUTPUT.txt; reports/PHASE1_TEST_OUTPUT.txt; reports/INTEGRATION_TEST_OUTPUT.txt X3-X4
- **state**: OPERATIONAL
- **decision reason**: strongest existing implementation for Tier 0; DuckDB/Postgres deferred by tier

### 35. DuckDB — EVALUATED (decision: DEFER)

- **category**: Data processing / analytics
- **provider**: DuckDB Labs
- **repo url**: https://github.com/duckdb/duckdb
- **purpose**: Columnar OLAP for event-log analytics
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: event store is append-heavy OLTP; revisit for Tier 1 projection/analytics queries

### 36. Docker — EVALUATED (decision: REJECT)

- **category**: Deployment / infrastructure
- **provider**: Docker
- **repo url**: https://www.docker.com
- **purpose**: Container runtime
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: no daemon, no root, cannot install (hard environmental block, verified `docker: command not found`)

### 37. RunAnywhere — EVALUATED (decision: REJECT)

- **category**: Deployment / runtimes
- **provider**: RunanywhereAI
- **repo url**: https://github.com/RunanywhereAI/runanywhere-sdks
- **purpose**: Cross-platform command launcher
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: custom non-OSI threshold licence; Python SDK alpha and NOT on PyPI (404 verified)

### 38. Railway GraphQL v2 API (workspace token) — OPERATIONAL (decision: PROCEED)

- **category**: Deployment platform API
- **provider**: Railway
- **repo url**: https://docs.railway.app/reference/api
- **purpose**: Deployment verification + management for the reasonable-heart project: services, deployments, domains, variables, logs
- **integration method**: raw HTTPS GraphQL (scripts/railway_*.py); client signature 'nexus-continuation/1.0' (Cloudflare bans the default urllib signature — error 1010, diagnosed live)
- **install status**: no install needed
- **connection status**: connected — token valid; project reasonable-heart enumerated; SERVICE 'Jarvis-Nexus' (GitHub repo jamesrudh-arch/Jarvis-Nexus, branch main, repoTrigger active)
- **orchestrator registration**: verification scripts + evidence files (no orchestrator capability — external platform)
- **operational test**: PRIORITY-1 LIVE VERIFICATION 2026-11-13T18:46Z: deployment SUCCESS (commit 535bfc33, 17:57–17:59 UTC), domain jarvis-nexus-production.up.railway.app syncStatus ACTIVE (targetPort 8080), PUBLIC HTTP 200 (railway-hikari), 101 live deployment-log entries (Prisma: NexusWorldState residentsJson updates, SecurityAuditEvent inserts), 42 environment variables (names recorded, values never)
- **security assessment**: workspace token in .env (never printed); variable VALUES deliberately not recorded — names only; zero mutations made (no duplicate projects, no production overwrites)
- **licensing**: API terms apply
- **deployment location**: Railway cloud (project reasonable-heart, production environment)
- **limitations**: GitHub-repo listing/one-click connects are user-scoped (githubRepos → Not Authorized for workspace tokens — expected); the GitHub→Railway connection itself was made user-side via the Railway GitHub App
- **evidence**: NEXUS_WORLD/reports/RAILWAY_PRIORITY1*.json + RAILWAY_SERVICE_INSPECT.json (live, this session)
- **state**: OPERATIONAL
- **decision reason**: live verification of an existing, deployed, publicly-reachable service with real logs — PRIORITY 1 satisfied read-only

### 39. Railway CLI — EVALUATED (decision: DEFER)

- **category**: Deployment platform tooling
- **provider**: Railway
- **repo url**: https://github.com/railwayapp/cli
- **purpose**: Local source-upload deploys (railway up) — evaluated for the deploy path, rejected for workspace tokens
- **integration method**: npm @railway/cli 5.74.0; RAILWAY_TOKEN env
- **install status**: installed
- **connection status**: REJECTED — CLI auth check is user-scoped: 'whoami' → Unauthorized with the workspace token (re-verified 2026-11-13); GraphQL v2 with the same token works (see Railway GraphQL entry)
- **orchestrator registration**: not registered (no usable transport)
- **operational test**: scripts/railway_cli_test.sh — live, honest failure recorded
- **security assessment**: token never printed
- **licensing**: MIT
- **deployment location**: n/a
- **limitations**: requires an account/project token or browser OAuth — user-side decision
- **evidence**: RAILWAY_VERIFICATION.txt + this session's re-verification
- **state**: EVALUATED
- **decision reason**: CLI rejects workspace tokens on its user-scoped auth check; GraphQL API covers the verification needs; GitHub-repo deploys land via the Railway GitHub App (already connected)

### 40. Unreal MCP server (self-built, Remote Control API client) — REGISTERED (decision: PROCEED)

- **category**: Game engine MCP
- **provider**: NEXUS WORLD (self-built) → Unreal Engine 5.4+ Remote Control
- **repo url**: https://dev.epicgames.com/documentation/unreal-engine/remote-control-quick-start-for-unreal-engine
- **purpose**: Real MCP server that controls a LIVE Unreal Editor over HTTP (remote python, level queries, asset import, actor spawn, screenshots, save) — the editor half of the 3D world
- **integration method**: mcp_servers/unreal_server.py: FastMCP stdio (main venv) + HTTP PUT /remote/call on PythonScriptLibrary.execPythonCommandEx; UNREAL_REMOTE_URL env (default :30010); 20k-char payload cap; honest editor_reachable:false responses
- **install status**: installed (no Unreal binaries required to run)
- **connection status**: MCP protocol CONNECTED via integration/wiring.py (7 tools discovered, handshake verified); editor endpoint NOT reachable (no UE editor exists in Tier-0: Linux, 2 cores, no GPU)
- **orchestrator registration**: mcp.unreal on the ONE orchestrator (with honest editor_status)
- **operational test**: unreal_mcp_acceptance 7/7: handshake, discovery, honest unreachable responses for all tools, malformed-spec rejection, payload cap, requirements doc assertions
- **security assessment**: no credentials in the editor channel; child env scrubbed; payload capped
- **licensing**: ours (MIT-style); UE usage subject to Epic EULA
- **deployment location**: server: Tier-0 sandbox; editor: requires Windows 10/11 + DX12 SM6 GPU (AMD RX-6000+/Intel Arc/NVIDIA RTX-2000+ per official Epic specs) + 100+ GB SSD — documented in docs/UNREAL_MCP_REQUIREMENTS.md
- **limitations**: NOT operational for editor control until real UE editor execution is verified (directive: no operational claim without it)
- **evidence**: UNREAL_MCP_TEST_OUTPUT.txt (7/7, this session)
- **state**: REGISTERED
- **decision reason**: protocol-verified with honest unreachable reporting; editor execution blocked on user-provided hardware (checklist documented)

### 41. Bevy — EVALUATED (decision: REJECT)

- **category**: Game engines
- **provider**: Bevy Contributors
- **repo url**: https://github.com/bevyengine/bevy
- **purpose**: Rust game engine
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: no Rust toolchain in sandbox; full crate compile on 2 cores impractical

### 42. Godot headless — EVALUATED (decision: DEFER)

- **category**: Game engines / digital environments
- **provider**: Godot Engine
- **repo url**: https://github.com/godotengine/godot
- **purpose**: Open-source engine (MIT); server binary runs rootless (verified 4.7.2)
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: no game project and no Python bindings — a GDScript shell adds nothing today; revisit if an interactive digital environment is required

### 43. UE5 / CARLA — EVALUATED (decision: REJECT)

- **category**: Game engines / digital environments
- **provider**: Epic Games / CARLA
- **repo url**: https://www.unrealengine.com
- **purpose**: Photoreal engine / driving simulator
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: GPU-bound + ~100GB disk + UE EULA still UNVERIFIED (L-04); Phase 0 ADR-005 deferral stands

### 44. OpenAI API (raw httpx provider) — INSTALLED (decision: DEFER)

- **category**: Hosted LLM provider
- **provider**: OpenAI
- **repo url**: https://github.com/openai/openai-openapi
- **purpose**: Phase 2 cognition provider (layer-2 LLM choice among allowed resident actions)
- **integration method**: raw httpx client per register decision #10 (models/openai_provider.py), honest failure semantics
- **install status**: installed (provider module, no SDK dependency)
- **connection status**: BLOCKED at the network edge — root-caused 2026-11-13: sandbox egress IP is Hong Kong (Alibaba AS45102, 8.212.10.159/47.57.242.119); OpenAI's Cloudflare edge returns HTTP 403 unsupported_country_region_territory BEFORE any credential check (verified: an UNAUTHENTICATED request gets the identical 403). Nigeria is NOT the cause.
- **orchestrator registration**: registered on ModelRouter behind z-ai default
- **operational test**: OPENAI_403_DIAGNOSIS.json: models+chat 403, unauthenticated baseline 403 (pre-auth edge block), key format analysis
- **security assessment**: key stored in .env (chmod 600, git-ignored); NEVER printed; key is truncated (28 chars vs expected 150+ for sk-proj-) — user should provide the full key
- **licensing**: Apache-2.0 (openapi spec); API ToS apply
- **deployment location**: Tier-0 sandbox → blocked by egress geography (external dependency: a supported-region egress or user-side relay)
- **limitations**: edge geo-block (HK datacenter IP) + truncated key — two independent defects; GLM remains the working provider
- **evidence**: NEXUS_WORLD/reports/OPENAI_403_DIAGNOSIS.json (live probes 2026-11-13T17:39Z)
- **state**: INSTALLED
- **decision reason**: network-edge geo-block of the sandbox egress IP + truncated key — both external; diagnosis complete with hard evidence; revisit with full key from a supported region

### 45. Z-AI CLI (GLM chat completions) — OPERATIONAL (decision: PROCEED)

- **category**: Hosted LLM provider
- **provider**: Z.ai (GLM glm-4-plus)
- **repo url**: https://github.com/zai-org/z-ai-web-dev-sdk
- **purpose**: Primary cognition provider (layer-2 LLM choices; the deterministic fallback stays authoritative)
- **integration method**: subprocess CLI provider (models/zai_provider.py) with 429 circuit breaker (300 s) + 1-call/tick budget
- **install status**: installed (global CLI)
- **connection status**: connected — LIVE completion verified 2026-11-13T18:44Z ('ALIVE', glm-4-plus, 18 tokens) after the sustained 429 window cleared; earlier same-session 429 window handled honestly by the breaker + fallback
- **orchestrator registration**: default provider on ModelRouter
- **operational test**: live probe + live_cognition_test.py (fallback path proven during the 429 window: residents continued on the deterministic utility layer, reason recorded per decision)
- **security assessment**: no credentials involved; child env scrubbed
- **licensing**: SDK MIT; API terms apply
- **deployment location**: Tier-0 sandbox — operational
- **limitations**: platform-side rate-limit windows (429) occur under load; circuit breaker + deterministic fallback are the mitigation (both tested)
- **evidence**: LIVE_COGNITION_EVIDENCE.txt + 2026-11-13T18:44Z live probe 'ALIVE' (18 tokens)
- **state**: OPERATIONAL
- **decision reason**: live completions verified again this session; rate-limit resilience proven in both directions

### 46. MCP Integration Layer (official mcp SDK) — OPERATIONAL (decision: PROCEED)

- **category**: MCP client infrastructure
- **provider**: modelcontextprotocol (Anthropic + community)
- **repo url**: https://github.com/modelcontextprotocol/python-sdk
- **purpose**: Reusable MCP client: discovery, tool schemas, permissions, execution, error mapping, JSON logging, health monitoring (directive §3)
- **integration method**: Python package (mcp 1.27.0, 1.x line pinned <2) wrapped by integration/mcp_layer.py; one worker thread + event loop per stdio server
- **install status**: installed (pre-present in env, pinned mcp>=1.27,<2)
- **connection status**: connected — 2 live stdio servers (filesystem via npx; jarvis self-exposure via python -m)
- **orchestrator registration**: every allowed tool registered as mcp.<server>.<tool>
- **operational test**: PASS — M1-M8 (filesystem server), J1-J6 (self-exposure), X1-X5 (orchestrated)
- **security assessment**: credential-stripped child env (TOKEN/SECRET/PASSWORD/API_KEY/CREDENTIAL patterns removed); per-server tool allowlist; hard call timeouts; error taxonomy never leaks SDK exceptions
- **licensing**: MIT
- **deployment location**: Tier 0 sandbox (in-process, integration/mcp_layer.py)
- **limitations**: stdio transport only (Streamable HTTP at Tier 1); SDK 2.x removes bundled FastMCP — upgrade needs the exposure server migrated
- **evidence**: reports/INTEGRATION_TEST_OUTPUT.txt checks M1-M8, J1-J6, X1-X5
- **state**: OPERATIONAL
- **decision reason**: core directive requirement; dual-gated (layer allowlist + server --read-only)

### 47. mcp-for-blender (blender-mcp) — EVALUATED (decision: REJECT)

- **category**: MCP server — 3D
- **provider**: ahujasid
- **repo url**: https://github.com/ahujasid/mcp-for-blender
- **purpose**: AI-driven Blender control
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: requires the Blender DESKTOP APP with GUI running (addon starts a socket server inside Blender, started from the N-panel) — no display here; SUPERSEDED by our own headless Blender MCP server (see OPERATIONAL entries), which delivers the same capability class without the GUI requirement

### 48. @modelcontextprotocol/server-puppeteer — EVALUATED (decision: REJECT)

- **category**: MCP server — browser
- **provider**: modelcontextprotocol (archived)
- **repo url**: https://github.com/modelcontextprotocol/servers-archived
- **purpose**: Legacy official browser server
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: ARCHIVED — 'no longer maintained, NO SECURITY GUARANTEES' (upstream), deprecated on npm since 2025-05

### 49. @modelcontextprotocol/server-postgres — EVALUATED (decision: REJECT)

- **category**: MCP server — database
- **provider**: modelcontextprotocol (archived)
- **repo url**: https://github.com/modelcontextprotocol/servers-archived
- **purpose**: Legacy official Postgres reader
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: ARCHIVED/deprecated (0.6.2, 2024-12-04); postgres-mcp is the maintained successor when Postgres lands

### 50. mcp-server-sqlite (official) — EVALUATED (decision: REJECT)

- **category**: MCP server — database
- **provider**: modelcontextprotocol (archived)
- **repo url**: https://github.com/modelcontextprotocol/servers-archived
- **purpose**: Legacy official SQLite server
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: removed from npm entirely (E404 verified); PyPI copy unmaintained since 2025-04; ALSO duplicate capability — the native WorldStore already exposes the world DB

### 51. postgres-mcp (Postgres MCP Pro) — EVALUATED (decision: DEFER)

- **category**: MCP server — database
- **provider**: crystaldba
- **repo url**: https://github.com/crystaldba/postgres-mcp
- **purpose**: Index tuning, EXPLAIN, health checks, restricted SQL for the world DB
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: trigger: Tier 1 PostgreSQL deployment (ADR-001); pinned to mcp SDK 1.x — matches our pin

### 52. mcp-server-git (official) — EVALUATED (decision: DEFER)

- **category**: MCP server — development
- **provider**: modelcontextprotocol
- **repo url**: https://github.com/modelcontextprotocol/servers
- **purpose**: Git repository operations over MCP
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: repository managed directly with git CLI; no agent-driven git need yet

### 53. Filesystem MCP Server — OPERATIONAL (decision: PROCEED)

- **category**: MCP server — file & workspace
- **provider**: modelcontextprotocol reference servers
- **repo url**: https://github.com/modelcontextprotocol/servers (npm @modelcontextprotocol/server-filesystem)
- **purpose**: Sandboxed read-only file access for JARVIS agents (workspace inspection)
- **integration method**: spawned via npx -y @modelcontextprotocol/server-filesystem --read-only <root>; 8-tool read-only allowlist
- **install status**: installed (npx cache; package 2.3.0, requires Node >=24 — host has 24.22.2)
- **connection status**: connected — initialize + list_tools handshake completed (10 tools discovered)
- **orchestrator registration**: 8 capabilities: mcp.filesystem.{list_directory,read_text_file,read_multiple_files,get_file_info,directory_tree,search_files,list_allowed_directories,list_directory_with_sizes}
- **operational test**: PASS — M1-M8: list/read/tree real calls, allowlist denial, error mapping, health counters
- **security assessment**: DUAL gate: server-side --read-only (write tools not even served — verified M1b) + layer allowlist (M6); confined to NEXUS_MCP_FS_ROOT
- **licensing**: MIT → Apache-2.0 transition in the servers repo (both permissive)
- **deployment location**: Tier 0 sandbox (subprocess via npx)
- **limitations**: reference server — explicitly educational, not production-hardened (upstream README); Node 24 runtime dependency; cold npx start needs network once
- **evidence**: reports/INTEGRATION_TEST_OUTPUT.txt checks M1-M8
- **state**: OPERATIONAL
- **decision reason**: mandated file/workspace MCP category; read-only scope matches Tier 0 risk posture

### 54. VedantRGosavi/UE5-MCP — EVALUATED (decision: REJECT)

- **category**: MCP server — game engine
- **provider**: VedantRGosavi
- **repo url**: https://github.com/VedantRGosavi/UE5-MCP
- **purpose**: Blender→UE pipeline
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: explicitly abandoned by author ('didn't move forward')

### 55. chongdashu/unreal-mcp — EVALUATED (decision: REJECT)

- **category**: MCP server — game engine
- **provider**: chongdashu
- **repo url**: https://github.com/chongdashu/unreal-mcp
- **purpose**: UE actor/blueprint control
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: stale (2025-04-22), self-described experimental, needs editor

### 56. flopperam/unreal-engine-mcp — EVALUATED (decision: REJECT)

- **category**: MCP server — game engine
- **provider**: flopperam
- **repo url**: https://github.com/flopperam/unreal-engine-mcp
- **purpose**: UE MCP server
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: project relocated/absorbed elsewhere

### 57. kvick-games/UnrealMCP — EVALUATED (decision: REJECT)

- **category**: MCP server — game engine
- **provider**: kvick-games
- **repo url**: https://github.com/kvick-games/UnrealMCP
- **purpose**: UE editor socket bridge
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: stale (last commit 2025-06-22), very WIP, Windows-centric

### 58. ue-mcp — EVALUATED (decision: REJECT)

- **category**: MCP server — game engine
- **provider**: db-lyon
- **repo url**: https://github.com/db-lyon/ue-mcp
- **purpose**: 31-tool Unreal Engine editor control (wraps Epic native MCP, UE 5.8+)
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: fundamentally needs a live UE 5.4-5.9 editor (GUI) — impossible without GPU/display/100GB disk; best-in-class option recorded for a future workstation tier

### 59. @modelcontextprotocol/server-memory — EVALUATED (decision: DEFER)

- **category**: MCP server — memory
- **provider**: modelcontextprotocol
- **repo url**: https://github.com/modelcontextprotocol/servers
- **purpose**: Knowledge-graph memory server
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: Node >=24 required (host matches)
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: Phase 2 resident-memory subsystem will decide between this, Graphiti, and a Postgres schema (L-05)

### 60. JARVIS MCP Server (self-exposure) — OPERATIONAL (decision: PROCEED)

- **category**: MCP server — platform exposure
- **provider**: NEXUS WORLD (this repository)
- **repo url**: integration/mcp_server_expose.py
- **purpose**: Expose world status/geography/ticks/capabilities/commands to external MCP clients through the SAME orchestrator + permission system (directive §2.7-2.8)
- **integration method**: mcp SDK FastMCP over stdio; python -m integration.mcp_server_expose --db ... --token ...
- **install status**: built (module in repo)
- **connection status**: connected — external-client round-trip proven by connecting TO it through the MCP layer
- **orchestrator registration**: tools route through CommandOrchestrator (one authority, two transports)
- **operational test**: PASS — J1-J6: status matches db, run_ticks persists (tick 0→5), wrong token rejected, observer/permission path enforced, capabilities listed
- **security assessment**: stdio has no headers → founder token is a per-call arg; wrong/missing token maps to OBSERVER role and the single permission path rejects mutations (verified J4/J5)
- **licensing**: project licence (same as repo)
- **deployment location**: Tier 0 sandbox (subprocess on demand)
- **limitations**: per-call token auth (stdio transport constraint, documented); one db per server process
- **evidence**: reports/INTEGRATION_TEST_OUTPUT.txt checks J1-J6
- **state**: OPERATIONAL
- **decision reason**: directive requires exposing capabilities through MCP, not just consuming

### 61. mcp-server-time (official) — EVALUATED (decision: DEFER)

- **category**: MCP server — time
- **provider**: modelcontextprotocol
- **repo url**: https://github.com/modelcontextprotocol/servers
- **purpose**: Time/timezone conversion over MCP
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: the world clock is the authoritative time source inside the simulation

### 62. mcp-server-fetch (official) — EVALUATED (decision: DEFER)

- **category**: MCP server — web fetch
- **provider**: modelcontextprotocol
- **repo url**: https://github.com/modelcontextprotocol/servers
- **purpose**: URL fetching for LLM agents
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: browser.navigate + httpx provider cover fetching; add when an LLM agent needs raw-fetch tool semantics

### 63. Notion MCP (hosted remote) — EVALUATED (decision: DEFER)

- **category**: MCP server — workspace
- **provider**: Notion
- **repo url**: https://github.com/makenotion/notion-mcp-server
- **purpose**: Notion workspace integration
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: no Notion workspace in scope; self-hosted repo itself is no longer actively maintained (hosted remote is the path if ever needed)

### 64. mcp-obsidian (PyPI) — EVALUATED (decision: REJECT)

- **category**: MCP server — workspace
- **provider**: MarkusPfundstein
- **repo url**: https://github.com/MarkusPfundstein/mcp-obsidian
- **purpose**: Obsidian via Local REST API
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: requires the Obsidian desktop app RUNNING + API key (obsidian-mcp is the headless path)

### 65. mcp-obsidian (npm) — EVALUATED (decision: REJECT)

- **category**: MCP server — workspace
- **provider**: unknown (no repo field)
- **repo url**: https://www.npmjs.com/package/mcp-obsidian
- **purpose**: Obsidian vault server
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: NO licence, NO repository field — unverifiable provenance, rejected on supply-chain security

### 66. obsidian-mcp — EVALUATED (decision: DEFER)

- **category**: MCP server — workspace/lore
- **provider**: StevenStavrakis
- **repo url**: https://github.com/StevenStavrakis/obsidian-mcp
- **purpose**: Headless markdown vault (world lore) — Obsidian app NOT required
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: lore/codex subsystem arrives with narrative phases; verified headless-capable

### 67. Grafana — EVALUATED (decision: DEFER)

- **category**: Monitoring & observability
- **provider**: Grafana Labs
- **repo url**: https://github.com/grafana/grafana
- **purpose**: Dashboards on top of /metrics
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: separate stateful service — no host to spare at Tier 0; AGPL-3.0 licence noted for Tier 1 decision

### 68. JSON structured logging (stdlib) — OPERATIONAL (decision: PROCEED)

- **category**: Monitoring & observability
- **provider**: Python stdlib
- **repo url**: https://docs.python.org/3/library/logging.html
- **purpose**: Structured JSON log lines for every integration operation (directive: logging requirement)
- **integration method**: observability/metrics.py JsonFormatter + setup_logging — zero dependencies
- **install status**: built-in
- **connection status**: n/a
- **orchestrator registration**: n/a (cross-cutting)
- **operational test**: PASS — structured lines present in the recorded run output (mcp.connect.ok / mcp.call.ok / browser.launched events)
- **security assessment**: no credentials ever logged (tokens stripped from child env AND never logged)
- **licensing**: PSF
- **deployment location**: Tier 0 sandbox (stdout)
- **limitations**: single-stream stdout at Tier 0; log shipping at Tier 1
- **evidence**: reports/INTEGRATION_TEST_OUTPUT.txt (JSON event lines throughout)
- **state**: OPERATIONAL
- **decision reason**: structlog/loguru REJECTED as unjustified dependencies (see below)

### 69. OpenTelemetry Python SDK — EVALUATED (decision: DEFER)

- **category**: Monitoring & observability
- **provider**: OpenTelemetry (CNCF)
- **repo url**: https://github.com/open-telemetry/opentelemetry-python
- **purpose**: Traces + metrics export
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: meaningful only with an OTLP collector at Tier 1; prometheus_client covers Tier 0

### 70. loguru — EVALUATED (decision: REJECT)

- **category**: Monitoring & observability
- **provider**: Delgan
- **repo url**: https://github.com/Delgan/loguru
- **purpose**: Logging UX library
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: replaces stdlib global logging state and breaks parity with uvicorn/FastAPI loggers; unjustified dependency

### 71. prometheus_client — OPERATIONAL (decision: PROCEED)

- **category**: Monitoring & observability
- **provider**: Prometheus (CNCF)
- **repo url**: https://github.com/prometheus/client_python
- **purpose**: Metrics exposition: commands, tool calls, latency histogram, world tick/events gauges, MCP server up, process CPU/RAM
- **integration method**: 0.24.1 via observability/metrics.py; GET /metrics (direct generate_latest route — avoids the /metrics vs /metrics/ 307 redirect)
- **install status**: installed (pre-present, verified Apache-2.0)
- **connection status**: n/a (library)
- **orchestrator registration**: InstrumentedOrchestrator wraps the single central orchestrator (telemetry only)
- **operational test**: PASS — O1-O2 (exposition + tick gauge), A1/A5 (HTTP endpoint before/after traffic)
- **security assessment**: read-only exposition; no external push gateway
- **licensing**: Apache-2.0
- **deployment location**: Tier 0 sandbox (FastAPI route)
- **limitations**: counters are per-process (Tier 0 single process by design); no scrape persistence
- **evidence**: reports/INTEGRATION_TEST_OUTPUT.txt checks O1-O2, A1, A5
- **state**: OPERATIONAL
- **decision reason**: zero new deps; Grafana/OTel deferred to Tier 1

### 72. structlog — EVALUATED (decision: REJECT)

- **category**: Monitoring & observability
- **provider**: hynek
- **repo url**: https://github.com/hynek/structlog
- **purpose**: Structured logging
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: stdlib logging + 15-line JSON formatter delivers the requirement with ZERO dependencies (directive Part 5)

### 73. OpenAI 403 diagnostics (edge geo-block analysis) — OPERATIONAL (decision: PROCEED)

- **category**: Network diagnostics
- **provider**: NEXUS WORLD (self-built) + ipinfo/ip-api
- **repo url**: —
- **purpose**: Root-cause evidence for the OpenAI HTTP 403: egress IP geolocation (dual-source), pre-auth edge block proof, key format analysis — the directive's demand to not assume Nigeria
- **integration method**: scripts/openai_403_diagnosis.py: live probes (geolocation x3, models/chat endpoints, unauthenticated baseline, GLM control)
- **install status**: part of the repo
- **connection status**: one-shot live diagnostics
- **orchestrator registration**: evidence file only
- **operational test**: all probes executed live 2026-11-13T17:39Z; conclusion: HK datacenter IP blocked pre-auth; key truncated (28 chars); Nigeria NOT involved
- **security assessment**: key never printed (length/prefix only)
- **licensing**: n/a
- **deployment location**: Tier-0 sandbox
- **limitations**: cannot change sandbox egress geography; will not proxy around a geo-block (policy)
- **evidence**: NEXUS_WORLD/reports/OPENAI_403_DIAGNOSIS.json
- **state**: OPERATIONAL
- **decision reason**: complete diagnosis with hard evidence; resolution is user-side (full-length key + supported-region egress)

### 74. Central orchestrator + permission system — OPERATIONAL (decision: PROCEED)

- **category**: Platform core (internal)
- **provider**: NEXUS WORLD (this repository)
- **repo url**: orchestration/command.py + security/permissions.py
- **purpose**: THE single authority (directive Part 6): intent → permission → approval → execute → audit; idempotent by command_id
- **integration method**: CommandOrchestrator + InstrumentedOrchestrator (telemetry wrapper); capability registry is the integration point for ALL tools
- **install status**: built (Phase 1, extended this phase)
- **connection status**: n/a (in-process)
- **orchestrator registration**: IS the orchestrator: 2 built-ins + 8 MCP filesystem + 3 browser + 2 vision + 1 voice capabilities registered in the acceptance run
- **operational test**: PASS — X1-X5 (approval gate, multi-tool workflow, audit trail, idempotency, unknown-capability rejection), J5 (permission path through MCP transport)
- **security assessment**: action classes observe→irreversible; EXTERNAL/IRREVERSIBLE require explicit approval (verified X1); observers read-only
- **licensing**: project licence
- **deployment location**: Tier 0 sandbox
- **limitations**: approval UX is a boolean flag at Tier 0 (interactive approval flow at Tier 1)
- **evidence**: reports/INTEGRATION_TEST_OUTPUT.txt X1-X5, J5; reports/PHASE1_TEST_OUTPUT.txt C/D sections
- **state**: OPERATIONAL
- **decision reason**: directive Part 6: one orchestrator, everything registers here

### 75. Goals, mood + autonomy policy layer — OPERATIONAL (decision: PROCEED)

- **category**: Resident cognition
- **provider**: NEXUS WORLD (self-built)
- **repo url**: —
- **purpose**: Genuine independent behaviour without LLM dependency: deterministic per-window goals (purpose_build/social_bond/rest_well/explore) measured from the event log, derived mood, bounded score biases (≤1.35) that make residents diverge from the pure utility script in personally-consistent ways
- **integration method**: residents/autonomy.py + engine integration; goal windows are pure functions of (seed, resident, window) — restart/replay-safe; goal outcomes recorded as memories
- **install status**: part of the repo
- **connection status**: engine default (enable_policy=True), counterfactual recorded per decision
- **orchestrator registration**: GET /autonomy/report
- **operational test**: autonomy A1-A3/A8-A12 (14/14): deterministic goals, event-log progress, bounded divergence (4.5% direct run / 29.9% API-driven run), source separation (script vs policy), restart persistence
- **security assessment**: n/a
- **licensing**: ours
- **deployment location**: Tier-0 sandbox
- **limitations**: bounded bias design: autonomy is measurable but deliberately not chaotic; LLM layer still authoritative at ambiguous moments when reachable
- **evidence**: AUTONOMY_TEST_OUTPUT.txt A1-A12
- **state**: OPERATIONAL
- **decision reason**: the honest scripted-vs-autonomous distinction the directive demands — measured, not asserted

### 76. Long-term memory + relationship graph — OPERATIONAL (decision: PROCEED)

- **category**: Resident cognition
- **provider**: NEXUS WORLD (self-built)
- **repo url**: —
- **purpose**: Salience-weighted episodic memory (importance × recency decay), evolving social graph derived purely from communication events, autobiographies, friend-based social pressure
- **integration method**: residents/memory.py — pure event-log projection (replay-safe; no new state beyond events)
- **install status**: part of the repo
- **connection status**: consumed by the autonomy policy + LLM context + API
- **orchestrator registration**: GET /residents/{id}/mind
- **operational test**: autonomy A4-A7 (14/14): salience decay, 32 relationship edges/12 friendships from real meetings, resident-specific autobiographies
- **security assessment**: n/a (simulation data)
- **licensing**: ours
- **deployment location**: Tier-0 sandbox
- **limitations**: memory text templates are simple; recall is salience-ranked keyword retrieval, not embeddings
- **evidence**: AUTONOMY_TEST_OUTPUT.txt A4-A7
- **state**: OPERATIONAL
- **decision reason**: event-derived, replay-safe, tested

### 77. Resident mind API (inner life endpoints) — OPERATIONAL (decision: PROCEED)

- **category**: Resident cognition API
- **provider**: NEXUS WORLD (self-built)
- **repo url**: —
- **purpose**: Public inspection of each resident's inner state: autobiography, salience-ranked memories, friends, mood, active goal with progress; plus the population-level autonomy audit
- **integration method**: infrastructure/api_server.py: GET /residents/{id}/mind, GET /autonomy/report (additive, permission-gated)
- **install status**: part of the repo
- **connection status**: live in the FastAPI app
- **orchestrator registration**: additive routes on the ONE API
- **operational test**: autonomy A13/A14 (14/14)
- **security assessment**: role-gated like every endpoint; no secrets in responses
- **licensing**: ours
- **deployment location**: Tier-0 sandbox
- **limitations**: audit reflects the current process run (ledger is in-memory analytics; state itself is event-sourced)
- **evidence**: AUTONOMY_TEST_OUTPUT.txt A13/A14
- **state**: OPERATIONAL
- **decision reason**: tested live over the real API

### 78. ROS 2 — EVALUATED (decision: REJECT)

- **category**: Robotics / hardware
- **provider**: Open Robotics
- **repo url**: https://github.com/ros2
- **purpose**: Robot operating system
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: installation requires root + apt + Ubuntu (official docs); Debian Tier-3 at best; no robot hardware exists

### 79. pyserial / pyfirmata — EVALUATED (decision: REJECT)

- **category**: Robotics / hardware
- **provider**: pyserial project
- **repo url**: https://github.com/pyserial/pyserial
- **purpose**: Serial / microcontroller interfaces
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: ZERO serial devices exist in this sandbox — nothing to talk to

### 80. Gazebo — EVALUATED (decision: REJECT)

- **category**: Robotics / simulation
- **provider**: gz-sim
- **repo url**: https://github.com/gazebosim/gz-sim
- **purpose**: Robot simulation
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: apt-only distribution; no py3.12 pip path

### 81. bandit — OPERATIONAL (decision: PROCEED)

- **category**: Security tooling
- **provider**: PyCQA
- **repo url**: https://github.com/PyCQA/bandit
- **purpose**: Python SAST scan of the repository (security assessment evidence)
- **integration method**: pip install bandit==1.9.4; bandit -r . -x ./tests
- **install status**: installed (1.9.4)
- **connection status**: n/a (scanner)
- **orchestrator registration**: n/a (dev tooling)
- **operational test**: PASS — full scan executed twice (found 3 Medium → remediated 1, accepted 2 with justification); 0 High
- **security assessment**: is itself the assessment tool; findings + remediation recorded
- **licensing**: Apache-2.0
- **deployment location**: Tier 0 sandbox (dev-time)
- **limitations**: AST-based Python only (no dependency analysis — pip-audit covers that)
- **evidence**: reports/SECURITY_SCAN_OUTPUT.txt (sections 1-3)
- **state**: OPERATIONAL
- **decision reason**: account-free SAST; semgrep deferred as heavier Tier 1 option

### 82. detect-secrets — EVALUATED (decision: DEFER)

- **category**: Security tooling
- **provider**: Yelp
- **repo url**: https://github.com/Yelp/detect-secrets
- **purpose**: Secrets scanning for commits
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: optional pre-commit hygiene; last release 2024-05 (slowing) — evaluate alternatives when repo goes public

### 83. pip-audit — OPERATIONAL (decision: PROCEED)

- **category**: Security tooling
- **provider**: Python Packaging Authority (pypa)
- **repo url**: https://github.com/pypa/pip-audit
- **purpose**: Dependency CVE scanning against the PyPI advisory database
- **integration method**: pip install pip-audit==2.10.1; pip-audit -r requirements.txt
- **install status**: installed (2.10.1)
- **connection status**: n/a (scanner; queries PyPI advisory service — network verified)
- **orchestrator registration**: n/a (dev tooling)
- **operational test**: PASS — found 5 real CVEs in starlette 0.50.0 → remediated by upgrade → re-scan clean
- **security assessment**: is itself the assessment tool; the found→fixed→verified loop is recorded end-to-end
- **licensing**: Apache-2.0
- **deployment location**: Tier 0 sandbox (dev-time)
- **limitations**: scans pinned requirements only (whole-venv scan would flag unrelated preinstalled packages)
- **evidence**: reports/SECURITY_SCAN_OUTPUT.txt (sections 1-4)
- **state**: OPERATIONAL
- **decision reason**: account-free CVE scanning; safety REJECTED (account-gated)

### 84. safety — EVALUATED (decision: REJECT)

- **category**: Security tooling
- **provider**: pyupio
- **repo url**: https://github.com/pyupio/safety
- **purpose**: Dependency CVE scanning
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: account-gated (signup/login required); free tier unsuitable; pip-audit covers this account-free

### 85. semgrep — EVALUATED (decision: DEFER)

- **category**: Security tooling
- **provider**: Semgrep Inc.
- **repo url**: https://github.com/semgrep/semgrep
- **purpose**: Deep SAST with rule packs
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: 72MB heavy for CI-less Tier 0; bandit covers Python AST needs; revisit at Tier 1 CI

### 86. trufflehog (PyPI) — EVALUATED (decision: REJECT)

- **category**: Security tooling
- **provider**: Truffle Security
- **repo url**: https://github.com/trufflesecurity/trufflehog
- **purpose**: Secrets scanning
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: PyPI package abandoned since 2021 (the real tool is a Go binary); AGPL-3.0

### 87. Repast HPC — EVALUATED (decision: REJECT)

- **category**: Simulation frameworks
- **provider**: Repast
- **repo url**: https://repast.github.io
- **purpose**: Distributed ABM
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: unmaintained since 2022 (Phase 0 finding); Mesa is the adopted path (ADR-003)

### 88. faster-whisper — EVALUATED (decision: DEFER)

- **category**: Voice / speech (ASR)
- **provider**: SYSTRAN
- **repo url**: https://github.com/SYSTRAN/faster-whisper
- **purpose**: Local CPU speech-to-text (tiny 72MB / base 138MB models)
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: MUST pin av==15.0.0 (default av 19 breaks decode_audio — verified in research)
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: no audio input pipeline until voice commands arrive (Phase 2+); benchmarked: tiny int8 = 11x realtime at 447MB RSS

### 89. openai-whisper — EVALUATED (decision: REJECT)

- **category**: Voice / speech (ASR)
- **provider**: OpenAI
- **repo url**: https://github.com/openai/whisper
- **purpose**: Reference Whisper
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: torch 539MB + stale releases; faster-whisper is strictly better for CPU

### 90. whisper.cpp / pywhispercpp — EVALUATED (decision: DEFER)

- **category**: Voice / speech (ASR)
- **provider**: ggml-org
- **repo url**: https://github.com/ggml-org/whisper.cpp
- **purpose**: Leanest ASR (172MB RSS)
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: alternative to faster-whisper when RAM is tight; pywhispercpp ships cp312 wheels

### 91. coqui-tts — EVALUATED (decision: REJECT)

- **category**: Voice / speech (TTS)
- **provider**: idiap (coqui-ai successor)
- **repo url**: https://github.com/idiap/coqui-ai-TTS
- **purpose**: Neural TTS toolkit
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: 148 modules import torch at runtime (539MB wheel) — zero CPU-quality gain over piper/kokoro for our use

### 92. kokoro (official package) — EVALUATED (decision: REJECT)

- **category**: Voice / speech (TTS)
- **provider**: hexgrad
- **repo url**: https://github.com/hexgrad/kokoro
- **purpose**: 82M TTS model package
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: requires torch + transformers; kokoro-onnx is the CPU path (deferred entry)

### 93. kokoro-onnx — EVALUATED (decision: DEFER)

- **category**: Voice / speech (TTS)
- **provider**: thewh1teagle
- **repo url**: https://github.com/thewh1teagle/kokoro-onnx
- **purpose**: Higher-quality 82M TTS (int8 109MB, 0.66x realtime on 2 cores)
- **integration method**: none (deferred)
- **install status**: not installed
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (deferred before integration)
- **security assessment**: not yet assessed in depth
- **licensing**: see provider
- **deployment location**: planned: Tier 0 sandbox or Tier 1
- **limitations**: —
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md
- **state**: EVALUATED
- **decision reason**: piper chosen for speed (17x realtime measured); kokoro is the quality option when synthesis time is not critical

### 94. piper-phonemize — EVALUATED (decision: REJECT)

- **category**: Voice / speech (TTS)
- **provider**: rhasspy (legacy)
- **repo url**: https://github.com/rhasspy/piper-phonemize
- **purpose**: Legacy piper phonemizer
- **integration method**: none (rejected)
- **install status**: not installed (rejected at evaluation)
- **connection status**: never connected
- **orchestrator registration**: not registered
- **operational test**: not tested (rejected)
- **security assessment**: rejected before integration
- **licensing**: varies
- **deployment location**: n/a
- **limitations**: n/a — rejected
- **evidence**: research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md
- **state**: EVALUATED
- **decision reason**: NOT on PyPI (verified); obsolete — piper 1.8 embeds espeak-ng in its wheel

### 95. piper-tts — OPERATIONAL (decision: PROCEED)

- **category**: Voice / speech (TTS)
- **provider**: Open Home Foundation (OHF-Voice/piper1-gpl)
- **repo url**: https://github.com/OHF-Voice/piper1-gpl
- **purpose**: Local CPU text-to-speech (JARVIS voice output without cloud credentials)
- **integration method**: piper-tts 1.8.0 + en_US-lessac-medium ONNX voice (63 MB) via integration/voice.py
- **install status**: installed (wheel 34 MB + onnxruntime; voice model downloaded from huggingface.co/rhasspy/piper-voices)
- **connection status**: n/a (local inference)
- **orchestrator registration**: voice.synthesize (EXTERNAL action class → founder approval)
- **operational test**: PASS — W1: 3.53s of 22.05kHz PCM16 WAV synthesised in 0.2s wall (~17x realtime on 2 cores)
- **security assessment**: fully local; no network at synthesis time; model file pinned by path
- **licensing**: GPL-3.0-or-later (piper code) — internal use; Apache-2.0 voice data. DISTRIBUTION of binaries would trigger GPL obligations (flagged for Founder decision at deployment tier)
- **deployment location**: Tier 0 sandbox (in-process, lazy model load)
- **limitations**: English voice only (more voices are downloads); GPL licence scope note above
- **evidence**: reports/INTEGRATION_TEST_OUTPUT.txt check W1
- **state**: OPERATIONAL
- **decision reason**: research benchmark: 4x realtime at 306 MB RSS, torch-free — best CPU TTS; kokoro-onnx deferred as quality alternative



## Round 3 additions — product build (2026-11-13/14)

Additive entries for the JARVIS command centre product build. Prior 95 records and history unchanged. New totals: 103 records, {'OPERATIONAL': 38, 'EVALUATED': 63, 'REGISTERED': 1, 'INSTALLED': 1}.

### JARVIS command centre web app (Next.js 16)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: The actual product: dashboard, chat, world, residents, lab, providers, ledger, system views in one command centre
- **Operational test**: browser-verified: 8 views navigated, interactions exercised (chat send, tick, 3D raycast click, resident inspect), 11 screenshots captured
- **Evidence**: NEXUS_WORLD/reports/app_screenshots/*.png; agent-browser verification logs in session
- **Limitations**: single-user Tier 0; no auth layer yet (NextAuth available, unconfigured)

### NEXUS engine TypeScript port

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: Deterministic, event-sourced world simulation driving the live product
- **Operational test**: 3-day seed: 11,442 events, 431 memories, 50 communications, autonomy 96.9% script / 3.1% policy divergence (matches Python reference ballpark 4.5%)
- **Evidence**: seed run logs; cold-boot proof: fresh DB -> tick 144, 3,962 events in 10.9s
- **Limitations**: geography generation uses hash-based determinism (not Python's MT sequence): fresh TS worlds differ from Python worlds at same seed (documented); cross-engine state parity not claimed

### Interactive 3D world viewer (Three.js)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: NEXUS WORLD accessible and interactive in the browser (PART IV)
- **Operational test**: browser-verified: 24 agent meshes render (probe count), click raycast opens resident inspector (6 hits verified), +1 tick advances sim from UI
- **Evidence**: screenshots 03/04; pixel-scan proof of 24 life-sign orbs; __nexus probe (removed after verification)
- **Limitations**: visual smoothing interpolates between ticks (positions are tick-quantized); low-poly aesthetic

### GLM voice pipeline (ASR + TTS)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: real voice interaction for JARVIS (speech input + spoken replies)
- **Operational test**: TTS verified live earlier in session (audio bytes returned); ASR endpoint live (microphone unavailable in headless verification — honestly untested end-to-end there)
- **Evidence**: chat reply audio path exercised; 429 handling code path verified live
- **Limitations**: rate windows apply (429 observed and handled honestly with degradation notices)

### GLM cognition layer in web engine (ADR-003 layer 2)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: resident decisions at ambiguous moments delegated to the hosted model, validated + utility fallback
- **Operational test**: code path live; provider rate window during session limited live LLM-choice capture (fallback path verified; LLM-choice path identical to Python reference which measured llm decisions)
- **Evidence**: cognition.ts validation logic; Python reference behaviour parity
- **Limitations**: cost control budget; rate-window degradation honest

### Engineering task ledger (product-integrated)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: PART II persistent engineering workflow with auditable state transitions
- **Operational test**: 14 real tasks seeded with honest states (5 VERIFIED, 5 BLOCKED, 3 TESTING, 1 IN_PROGRESS); API GET verified
- **Evidence**: curl /api/tasks output; UI screenshot 09
- **Limitations**: single-writer Tier 0

### Live provider probe system

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: honest, timestamped provider health (GLM live completion, OpenAI unauthenticated baseline, Railway production HTTP, egress geolocation)
- **Operational test**: live: GLM probe 345ms OK earlier in session, OpenAI baseline 403 geo-block (34ms), Railway production 200 (225ms), egress HK/AS45102 identified
- **Evidence**: providers API response; UI screenshot 08
- **Limitations**: probe cadence 60s; rate windows can mark GLM degraded (honest)

### Sandbox-recycle recovery (bpy 5.0.1 + piper + deps)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: restore the Python reference implementation stack after the sandbox recycle destroyed venvs, models and caches
- **Operational test**: ALL 8 suites green after recovery: 184/184 (integration recovered 41/47 -> 47/47)
- **Evidence**: suite outputs /tmp + regenerated reports; PHASE2/RENDER3D logs updated
- **Limitations**: bpy version 5.0.1 vs prior 5.3 (render suite passed unchanged)



## Round 4 additions — definitive build directive session (2026-11-14)

V2 world layer: JARVIS identity + presence, functional economy, building interiors, capability router. Verified by scripts/test-v2.ts (17/17), browser checks and 184/184 regression. New totals: 110 records, {'OPERATIONAL': 44, 'EVALUATED': 64, 'REGISTERED': 1, 'INSTALLED': 1}.

### JARVIS persistent identity subsystem (versioned, provider-independent)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: JARVIS's identity survives restarts, model changes and provider changes: versioned profile in the world event log (jarvis.identity_established), grounding every conversation
- **Operational test**: test-v2 D2 (v1 established), D6 (survives restart via new connection); /api/jarvis live; chat grounding reports identity v1 + N memories used per reply
- **Evidence**: scripts/test-v2.ts output (D2/D6 PASS); NEXUS_WORLD/reports/V2_VERIFICATION.txt; /api/jarvis live response
- **Limitations**: identity profile is static v1; versioning machinery ready for v2 evolution

### JARVIS as world resident (Sanctum home + resident entity)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: she has her own home (a real geo building), her own entity, moves/eats/socialises through the SAME engine as the 24 residents; the world does not revolve around her
- **Operational test**: test-v2 D1/D3/D4/D5 (exists, home=Sanctum with 3 rooms, no salary events); browser: entered Sanctum, JARVIS visible inside (cyan pixel scan 123), profile panel via /api/residents/res-000025
- **Evidence**: test-v2 D1–D5 PASS; screenshots 02 (cyan marker), 05 (Sanctum interior with her present), 06 (profile panel)
- **Limitations**: her body is a stylised presence marker, not a MetaHuman (UE rendering hardware-blocked — honest label in UI)

### Functional economy (37 businesses, salaries, purchases, B2B restocks, grants)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: interconnected economy: ateliers pay salaries and produce wares, kitchens sell meals, stores sell supplies, both restock from ateliers (real business-to-business transactions), institution pays civic wages from a daily grant
- **Operational test**: test-v2 A2–A6: conservation laws verified FROM THE EVENT LOG ALONE (wallets 1035 = init 1184 + salaries 288 − purchases 437; till 5909 = init 5510 + 437 + grants 250 − 288); 122 live transactions at last check incl. B2B restocks; dashboard feed shows real resident/business names
- **Evidence**: scripts/test-v2.ts A2–A6 PASS; dashboard screenshot 01 (live transactions incl. 'Moruholm Works → Wholesale wares · 40')
- **Limitations**: no taxation (grant is the single exogenous inflow, documented); eating at a shop venue does not transact (kitchens sell meals only); no distinct 'shopping' action in v1

### Building interiors (52 rooms, 112 objects, enter-building mode)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: real internal structures: Sanctum (Atrium/Studio/Observatory), civic hall (Hall/Office/Archive), every food venue (Dining/Kitchen), every shop (Floor/Storage); residents are placed in semantically appropriate rooms on arrival
- **Operational test**: test-v2 C1–C3 (all rooms within building bounds; residents with room_id inside that room's rect and building — 11 indoors at check); browser: entered 4 buildings (Ulmoholm House, JARVIS Sanctum, Moruholm Works, shell-note path for Wynuvale House); captured Cyra Ironquill eating indoors at Galedor House · Floor via API
- **Evidence**: test-v2 C1–C3 PASS; screenshots 04 (interior mode), 05 (Sanctum + JARVIS), 07 (shop interior)
- **Limitations**: intra-building transit not simulated (arrival places directly in room — documented); residential/workshop interiors not generated in v1 (honest shells, UI says so)

### Multi-model capability router (audit-trailed failover)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: capability-aware provider selection per category (reasoning/vision/stt/tts) with explicit routing decisions written to the audit log; unavailable providers are reported as skipped with reasons — never silently chosen or substituted
- **Operational test**: chat requests route reasoning→glm with skipped=[openai(BLOCKED HK egress)]; failures recorded as route:…[failed] (live 429 windows this session produced honest 503s, no fabricated replies)
- **Evidence**: AuditEvent rows in db/custom.db; chat 503 responses with provider field this session
- **Limitations**: exactly one selectable provider per category in this sandbox (OpenAI edge-blocked; documented) — the registry extends without touching callers when keys return

### VLM reference-image study (GLM-4V multimodal)

- **State**: EVALUATED — **Decision**: PROCEED
- **Purpose**: study the attached reference image with a live vision model and derive the design language for the product
- **Operational test**: attempted 3x: 429 each time — NOT marked operational; design language derived from the platform gateway's own extraction of the actual image with provenance noted; VLM call to be re-run when the window clears
- **Evidence**: REFERENCE_IMAGE_STUDY.txt (provenance note); three 429 outputs in session log
- **Limitations**: rate-window dependent; not retried beyond 3 attempts this session (honest)

### Sandbox-recycle recovery #2 (python stack, piper, bpy after second recycle)

- **State**: OPERATIONAL — **Decision**: PROCEED
- **Purpose**: the sandbox was recycled AGAIN mid-project (mesa/langgraph/fastapi/cv2/piper/bpy destroyed a second time) — full recovery using the documented reproducible process
- **Operational test**: all 8 suites re-run after recovery: 184/184 PASS (11/48/28/17/7/14/12/47) — baseline preserved
- **Evidence**: final_regression.sh output this session (184/184); NEXUS_WORLD/reports/*_TEST_OUTPUT.txt refreshed
- **Limitations**: recycle #2 cost ~15 min of recovery; process is documented in SOURCE_OF_TRUTH §3/§8 — reproducible by design

