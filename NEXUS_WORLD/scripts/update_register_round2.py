#!/usr/bin/env python3
"""Registry update — PHASE CONTINUATION DIRECTIVE round 2.

Updates existing entries with this session's live evidence and adds the
new technologies (P1–P5). Honest states only: nothing is OPERATIONAL
without the recorded evidence of this session's test suites.
"""
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO)

from integration.register import (IntegrationRecord,  # noqa: E402
                                  IntegrationRegister)

reg = IntegrationRegister.load(os.path.join(REPO, "integration",
                                            "register.json"))

NOW = "2026-11-13T18:50:00Z"


def upsert(name, category, provider, repo_url, purpose,
           integration_method, install, connection, registration, test,
           security, licensing, deployment, limitations, evidence, state,
           decision, decision_reason):
    rec = IntegrationRecord(
        name=name, category=category, provider=provider, repo_url=repo_url,
        purpose=purpose, integration_method=integration_method,
        install_status=install,
        connection_status=connection,
        orchestrator_registration=registration, operational_test=test,
        security_assessment=security, licensing=licensing,
        deployment_location=deployment, limitations=limitations,
        evidence=evidence, state=state, decision=decision,
        decision_reason=decision_reason)
    reg.upsert(rec)
    return rec


# ---------------------------------------------------------- updates (5)
upsert(
    "OpenAI API (raw httpx provider)",
    category="Hosted LLM provider",
    provider="OpenAI",
    repo_url="https://github.com/openai/openai-openapi",
    purpose="Phase 2 cognition provider (layer-2 LLM choice among allowed "
            "resident actions)",
    integration_method="raw httpx client per register decision #10 "
                       "(models/openai_provider.py), honest failure "
                       "semantics",
    install="installed (provider module, no SDK dependency)",
    connection="BLOCKED at the network edge — root-caused 2026-11-13: "
               "sandbox egress IP is Hong Kong (Alibaba AS45102, 8.212."
               "10.159/47.57.242.119); OpenAI's Cloudflare edge returns "
               "HTTP 403 unsupported_country_region_territory BEFORE any "
               "credential check (verified: an UNAUTHENTICATED request "
               "gets the identical 403). Nigeria is NOT the cause.",
    registration="registered on ModelRouter behind z-ai default",
    test="OPENAI_403_DIAGNOSIS.json: models+chat 403, unauthenticated "
         "baseline 403 (pre-auth edge block), key format analysis",
    security="key stored in .env (chmod 600, git-ignored); NEVER printed; "
             "key is truncated (28 chars vs expected 150+ for sk-proj-) — "
             "user should provide the full key",
    licensing="Apache-2.0 (openapi spec); API ToS apply",
    deployment="Tier-0 sandbox → blocked by egress geography (external "
               "dependency: a supported-region egress or user-side relay)",
    limitations="edge geo-block (HK datacenter IP) + truncated key — two "
                "independent defects; GLM remains the working provider",
    evidence="NEXUS_WORLD/reports/OPENAI_403_DIAGNOSIS.json (live probes "
             "2026-11-13T17:39Z)",
    state="INSTALLED",
    decision="DEFER",
    decision_reason="network-edge geo-block of the sandbox egress IP + "
                    "truncated key — both external; diagnosis complete "
                    "with hard evidence; revisit with full key from a "
                    "supported region")

upsert(
    "Z-AI CLI (GLM chat completions)",
    category="Hosted LLM provider",
    provider="Z.ai (GLM glm-4-plus)",
    repo_url="https://github.com/zai-org/z-ai-web-dev-sdk",
    purpose="Primary cognition provider (layer-2 LLM choices; the "
            "deterministic fallback stays authoritative)",
    integration_method="subprocess CLI provider (models/zai_provider.py) "
                       "with 429 circuit breaker (300 s) + 1-call/tick "
                       "budget",
    install="installed (global CLI)",
    connection="connected — LIVE completion verified 2026-11-13T18:44Z "
               "('ALIVE', glm-4-plus, 18 tokens) after the sustained 429 "
               "window cleared; earlier same-session 429 window handled "
               "honestly by the breaker + fallback",
    registration="default provider on ModelRouter",
    test="live probe + live_cognition_test.py (fallback path proven "
         "during the 429 window: residents continued on the deterministic "
         "utility layer, reason recorded per decision)",
    security="no credentials involved; child env scrubbed",
    licensing="SDK MIT; API terms apply",
    deployment="Tier-0 sandbox — operational",
    limitations="platform-side rate-limit windows (429) occur under load; "
                "circuit breaker + deterministic fallback are the "
                "mitigation (both tested)",
    evidence="LIVE_COGNITION_EVIDENCE.txt + 2026-11-13T18:44Z live probe "
             "'ALIVE' (18 tokens)",
    state="OPERATIONAL",
    decision="PROCEED",
    decision_reason="live completions verified again this session; "
                    "rate-limit resilience proven in both directions")

upsert(
    "Blender MCP server (self-built, headless)",
    category="3D modelling MCP",
    provider="NEXUS WORLD (self-built)",
    repo_url="https://github.com/blender/blender",
    purpose="Headless Blender Python API control over MCP stdio — the 3D "
            "half of NEXUS WORLD through the central orchestrator",
    integration_method="FastMCP stdio server in the bpy 5.3 venv, 10 "
                       "tools (6 original + build_terrain_scene, "
                       "build_characters, run_physics, "
                       "export_unreal_bundle), path-confinement guard, "
                       "stdout shield",
    install="installed (.venv-blender, Python 3.13 + bpy 5.3.0 + mcp<2)",
    connection="connected via integration/mcp_layer.py; R11 handshake + "
               "tool discovery re-verified with the 10-tool set",
    registration="mcp.blender on the ONE orchestrator",
    test="render3d_acceptance R11-R17 (17/17) + nexus3d W4/W6/W8/W9 "
         "(12/12) — real bpy calls through MCP transport",
    security="path confinement to workspace; credentials never reach the "
             "child env",
    licensing="Apache-2.0 (Blender); server code ours",
    deployment="Tier-0 sandbox (CPU Cycles)",
    limitations="CPU-only rendering; FBX export of full worlds takes "
                "~8-10 min on 2 cores",
    evidence="RENDER3D_TEST_OUTPUT.txt + NEXUS3D_TEST_OUTPUT.txt (this "
             "session)",
    state="OPERATIONAL",
    decision="PROCEED",
    decision_reason="10 real tools, all exercised with evidence this "
                    "session")

upsert(
    "Unreal asset pipeline (Blender side)",
    category="3D asset pipeline",
    provider="Blender Foundation (exporters) + NEXUS WORLD (bundle)",
    repo_url="https://github.com/blender/blender",
    purpose="Blender→Unreal asset pipeline: USD/glTF/FBX exports, now a "
            "full UE-ready BUNDLE (3 formats + manifest with naming/"
            "axis/unit conventions + honest import status)",
    integration_method="render3d/ue_export.py — exporter kwargs "
                       "introspected at runtime (5.x-safe), magic-byte "
                       "verification py-side, manifest builder",
    install="installed (part of bpy venv + py3.12 side)",
    connection="connected via MCP export_unreal_bundle tool + driver "
               "'bundle' op",
    registration="render3d.ue_export on the orchestrator",
    test="nexus3d W9/W10 (12/12): USD+FBX+GLB exported, magic bytes "
         "verified, manifest with verified_import:false (honest); "
         "full-world bundle on disk (workspace/exports/"
         "world_bundle_full: USD 739 KB, FBX 32.7 MB, GLB 3.7 MB)",
    security="workspace-confined outputs; no credentials",
    licensing="Apache-2.0",
    deployment="Tier-0 sandbox; import side requires UE 5.4+ on Windows/"
               "GPU (documented, not claimed)",
    limitations="UE import half remains blocked on hardware — the "
                "manifest records verified_import:false until a real "
                "editor executes",
    evidence="NEXUS3D_TEST_OUTPUT.txt W9/W10 + manifest.json in "
             "workspace/exports/p4_acceptance_bundle/",
    state="OPERATIONAL",
    decision="PROCEED",
    decision_reason="export side real and bundle-complete; import side "
                    "precisely blocked with documented requirements")

upsert(
    "Railway CLI",
    category="Deployment platform tooling",
    provider="Railway",
    repo_url="https://github.com/railwayapp/cli",
    purpose="Local source-upload deploys (railway up) — evaluated for the "
            "deploy path, rejected for workspace tokens",
    integration_method="npm @railway/cli 5.74.0; RAILWAY_TOKEN env",
    install="installed",
    connection="REJECTED — CLI auth check is user-scoped: 'whoami' → "
               "Unauthorized with the workspace token (re-verified "
               "2026-11-13); GraphQL v2 with the same token works (see "
               "Railway GraphQL entry)",
    registration="not registered (no usable transport)",
    test="scripts/railway_cli_test.sh — live, honest failure recorded",
    security="token never printed",
    licensing="MIT",
    deployment="n/a",
    limitations="requires an account/project token or browser OAuth — "
                "user-side decision",
    evidence="RAILWAY_VERIFICATION.txt + this session's re-verification",
    state="EVALUATED",
    decision="DEFER",
    decision_reason="CLI rejects workspace tokens on its user-scoped auth "
                    "check; GraphQL API covers the verification needs; "
                    "GitHub-repo deploys land via the Railway GitHub App "
                    "(already connected)")

# ------------------------------------------------------- new entries (13)
new_entries = [
    dict(
        name="Railway GraphQL v2 API (workspace token)",
        category="Deployment platform API",
        provider="Railway",
        repo_url="https://docs.railway.app/reference/api",
        purpose="Deployment verification + management for the "
                "reasonable-heart project: services, deployments, "
                "domains, variables, logs",
        integration_method="raw HTTPS GraphQL (scripts/railway_*.py); "
                           "client signature 'nexus-continuation/1.0' "
                           "(Cloudflare bans the default urllib signature "
                           "— error 1010, diagnosed live)",
        install="no install needed",
        connection="connected — token valid; project reasonable-heart "
                   "enumerated; SERVICE 'Jarvis-Nexus' (GitHub repo "
                   "jamesrudh-arch/Jarvis-Nexus, branch main, "
                   "repoTrigger active)",
        registration="verification scripts + evidence files (no "
                     "orchestrator capability — external platform)",
        test="PRIORITY-1 LIVE VERIFICATION 2026-11-13T18:46Z: deployment "
             "SUCCESS (commit 535bfc33, 17:57–17:59 UTC), domain "
             "jarvis-nexus-production.up.railway.app syncStatus ACTIVE "
             "(targetPort 8080), PUBLIC HTTP 200 (railway-hikari), 101 "
             "live deployment-log entries (Prisma: NexusWorldState "
             "residentsJson updates, SecurityAuditEvent inserts), 42 "
             "environment variables (names recorded, values never)",
        security="workspace token in .env (never printed); variable "
                 "VALUES deliberately not recorded — names only; zero "
                 "mutations made (no duplicate projects, no production "
                 "overwrites)",
        licensing="API terms apply",
        deployment="Railway cloud (project reasonable-heart, production "
                   "environment)",
        limitations="GitHub-repo listing/one-click connects are "
                    "user-scoped (githubRepos → Not Authorized for "
                    "workspace tokens — expected); the GitHub→Railway "
                    "connection itself was made user-side via the "
                    "Railway GitHub App",
        evidence="NEXUS_WORLD/reports/RAILWAY_PRIORITY1*.json + "
                 "RAILWAY_SERVICE_INSPECT.json (live, this session)",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="live verification of an existing, deployed, "
                        "publicly-reachable service with real logs — "
                        "PRIORITY 1 satisfied read-only"),
    dict(
        name="Unreal MCP server (self-built, Remote Control API client)",
        category="Game engine MCP",
        provider="NEXUS WORLD (self-built) → Unreal Engine 5.4+ Remote "
                 "Control",
        repo_url="https://dev.epicgames.com/documentation/unreal-engine/"
                 "remote-control-quick-start-for-unreal-engine",
        purpose="Real MCP server that controls a LIVE Unreal Editor over "
                "HTTP (remote python, level queries, asset import, actor "
                "spawn, screenshots, save) — the editor half of the 3D "
                "world",
        integration_method="mcp_servers/unreal_server.py: FastMCP stdio "
                           "(main venv) + HTTP PUT /remote/call on "
                           "PythonScriptLibrary.execPythonCommandEx; "
                           "UNREAL_REMOTE_URL env (default :30010); "
                           "20k-char payload cap; honest "
                           "editor_reachable:false responses",
        install="installed (no Unreal binaries required to run)",
        connection="MCP protocol CONNECTED via integration/wiring.py "
                   "(7 tools discovered, handshake verified); editor "
                   "endpoint NOT reachable (no UE editor exists in "
                   "Tier-0: Linux, 2 cores, no GPU)",
        registration="mcp.unreal on the ONE orchestrator (with honest "
                     "editor_status)",
        test="unreal_mcp_acceptance 7/7: handshake, discovery, honest "
             "unreachable responses for all tools, malformed-spec "
             "rejection, payload cap, requirements doc assertions",
        security="no credentials in the editor channel; child env "
                 "scrubbed; payload capped",
        licensing="ours (MIT-style); UE usage subject to Epic EULA",
        deployment="server: Tier-0 sandbox; editor: requires Windows "
                   "10/11 + DX12 SM6 GPU (AMD RX-6000+/Intel Arc/"
                   "NVIDIA RTX-2000+ per official Epic specs) + 100+ GB "
                   "SSD — documented in docs/UNREAL_MCP_REQUIREMENTS.md",
        limitations="NOT operational for editor control until real UE "
                    "editor execution is verified (directive: no "
                    "operational claim without it)",
        evidence="UNREAL_MCP_TEST_OUTPUT.txt (7/7, this session)",
        state="REGISTERED",
        decision="PROCEED",
        decision_reason="protocol-verified with honest unreachable "
                        "reporting; editor execution blocked on "
                        "user-provided hardware (checklist documented)"),
    dict(
        name="Procedural world generation (deterministic fBm)",
        category="3D world generation",
        provider="NEXUS WORLD (self-built)",
        repo_url="",
        purpose="Terrain elevation, hydrology, parks, vegetation, rocks "
                "for NEXUS WORLD — the procedural world layer",
        integration_method="render3d/worldgen.py: hash-seeded multi-octave "
                           "value noise (NO RNG state — replay-safe), "
                           "city-flattening heightfield sampling, "
                           "environmental context for residents",
        install="part of the repo",
        connection="n/a (pure module)",
        registration="input to render3d.worldgen orchestrator capability",
        test="nexus3d W1-W3 (12/12): determinism, seed variance, "
             "city-flattening (height 0 on roads)",
        security="n/a",
        licensing="ours",
        deployment="Tier-0 sandbox",
        limitations="visual/environmental layer at Tier 0 — does not "
                    "alter resident movement (regression-safe by design)",
        evidence="NEXUS3D_TEST_OUTPUT.txt W1-W3",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="deterministic, tested, integrated"),
    dict(
        name="Terrain + environmental systems (bpy realisation)",
        category="3D world generation",
        provider="NEXUS WORLD (self-built) on bpy 5.3",
        repo_url="",
        purpose="Heightfield mesh (4096 verts/3969 faces), water plane "
                "(transmission material), park grounds, 160 trees "
                "(oak/pine), shoreline rocks, rain particle system "
                "(4000 particles)",
        integration_method="render3d/terrain_core.py — bmesh displacement, "
                           "city-flattened heights, particle emitter",
        install="runs in the bpy venv",
        connection="MCP tool build_terrain_scene + driver 'world' op",
        registration="render3d.worldgen orchestrator capability",
        test="nexus3d W4/W4b (12/12): real geometry counts read back "
             "from bpy.data; rain particles configured",
        security="workspace-confined",
        licensing="ours",
        deployment="Tier-0 sandbox (CPU)",
        limitations="particle systems evaluate at render time; terrain "
                    "is visual + environmental, not a movement graph",
        evidence="NEXUS3D_TEST_OUTPUT.txt W4/W4b + world renders",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="real bpy geometry with verified counts"),
    dict(
        name="Procedural characters + armature animation",
        category="3D characters & animation",
        provider="NEXUS WORLD (self-built) on bpy 5.3",
        repo_url="",
        purpose="Rigged humanoid residents (8-bone armatures, "
                "bone-parented mesh parts, keyframed walk/idle cycles "
                "driven by the simulated position timeline)",
        integration_method="render3d/characters_core.py: data-level bone "
                           "parenting (parent_type/parent_bone/"
                           "matrix_parent_inverse — no operator context "
                           "needed headless)",
        install="runs in the bpy venv",
        connection="MCP tool build_characters",
        registration="render3d.worldgen orchestrator capability",
        test="nexus3d W6 (12/12): 6 rigs × (torso/head/2 arms/2 legs) = "
             "36 bone-parented parts + 6 walk cycles",
        security="workspace-confined",
        licensing="ours",
        deployment="Tier-0 sandbox",
        limitations="FK bone rotation cycles (no IK); straight-line "
                    "walk paths at Tier 0",
        evidence="NEXUS3D_TEST_OUTPUT.txt W6",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="real armatures + real fcurves, verified"),
    dict(
        name="Creatures (birds + quadrupeds)",
        category="3D characters & animation",
        provider="NEXUS WORLD (self-built) on bpy 5.3",
        repo_url="",
        purpose="Living fauna: 10 birds with wing-flap keyframes on "
                "noise flight paths + 2 quadrupeds with diagonal-pair "
                "gait cycles",
        integration_method="render3d/characters_core.py:build_creatures",
        install="runs in the bpy venv",
        connection="part of the composite world build",
        registration="render3d.worldgen orchestrator capability",
        test="nexus3d W7 (12/12): 10 birds, 20 animated wings, 2 "
             "quadrupeds with gait keys",
        security="workspace-confined",
        licensing="ours",
        deployment="Tier-0 sandbox",
        limitations="procedural loops, not agent-driven (fauna has no "
                    "needs model yet)",
        evidence="NEXUS3D_TEST_OUTPUT.txt W7",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="verified geometry + animation"),
    dict(
        name="Rigid-body physics (bake + measured read-back)",
        category="3D physics",
        provider="NEXUS WORLD (self-built) on bpy 5.3",
        repo_url="",
        purpose="Real physics in the world: deterministic drop tests "
                "with baked point caches and MEASURED outcomes (drop "
                "distance, rest height, bounce counts) read back via "
                "frame_set + evaluated depsgraph",
        integration_method="render3d/physics_core.py: rigidbody world, "
                           "ptcache.bake_all, per-frame evaluated "
                           "matrix_world sampling",
        install="runs in the bpy venv",
        connection="MCP tool run_physics + driver 'world' op",
        registration="render3d.physics orchestrator capability",
        test="nexus3d W8 (12/12): 12/12 bodies simulated, 18 measured "
             "bounces, mean rest height 0.037 (physically consistent "
             "with the -0.4 ground + body radii)",
        security="workspace-confined",
        licensing="ours",
        deployment="Tier-0 sandbox (Bullet via bpy)",
        limitations="drop tests at Tier 0; resident interactions with "
                    "physics bodies not yet coupled",
        evidence="NEXUS3D_TEST_OUTPUT.txt W8 + physics probe",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="real simulated, baked and measured physics"),
    dict(
        name="Visual quality inspection v2",
        category="3D observability",
        provider="NEXUS WORLD on OpenCV",
        repo_url="https://github.com/opencv/opencv",
        purpose="Programmatic render inspection: existence, size, "
                "brightness, variance, colour diversity + NEW "
                "sharpness (Laplacian variance), saturation, edge "
                "density — calibrated against all accepted render "
                "evidence so no prior evidence is retroactively "
                "invalidated",
        integration_method="render3d/inspection.py thresholds calibrated "
                           "on 2026-11-13 render corpus (known-good "
                           "night/street renders: lap_var 4.3–36, "
                           "saturation 27–70)",
        install="part of the repo (opencv headless)",
        connection="inside render3d.render/worldgen capabilities",
        registration="render3d.inspect orchestrator capability",
        test="nexus3d W5 (12/12) + render3d A7-A9 regression (17/17)",
        security="n/a",
        licensing="Apache-2.0",
        deployment="Tier-0 sandbox",
        limitations="programmatic metrics, not aesthetic judgement",
        evidence="NEXUS3D_TEST_OUTPUT.txt W5",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="calibrated, honest, regression-safe"),
    dict(
        name="Automated correction + regeneration loop",
        category="3D observability",
        provider="NEXUS WORLD (self-built)",
        repo_url="",
        purpose="The self-healing render chain: inspection failure → "
                "parameter escalation (correction) → deterministic "
                "scene REGENERATION (noon light + top view) if all "
                "corrections fail",
        integration_method="render3d/inspection.py:render_with_regeneration "
                           "wired into pipeline.render",
        install="part of the repo",
        connection="render3d.render capability",
        registration="on the orchestrator (render3d.render)",
        test="nexus3d W11 (12/12): broken frames fail corrections, "
             "regeneration produces a passing frame (real files, real "
             "inspection)",
        security="n/a",
        licensing="ours",
        deployment="Tier-0 sandbox",
        limitations="one regeneration attempt per render call",
        evidence="NEXUS3D_TEST_OUTPUT.txt W11",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="full loop exercised with real evidence"),
    dict(
        name="Long-term memory + relationship graph",
        category="Resident cognition",
        provider="NEXUS WORLD (self-built)",
        repo_url="",
        purpose="Salience-weighted episodic memory (importance × "
                "recency decay), evolving social graph derived purely "
                "from communication events, autobiographies, "
                "friend-based social pressure",
        integration_method="residents/memory.py — pure event-log "
                           "projection (replay-safe; no new state "
                           "beyond events)",
        install="part of the repo",
        connection="consumed by the autonomy policy + LLM context + API",
        registration="GET /residents/{id}/mind",
        test="autonomy A4-A7 (14/14): salience decay, 32 relationship "
             "edges/12 friendships from real meetings, resident-"
             "specific autobiographies",
        security="n/a (simulation data)",
        licensing="ours",
        deployment="Tier-0 sandbox",
        limitations="memory text templates are simple; recall is "
                    "salience-ranked keyword retrieval, not embeddings",
        evidence="AUTONOMY_TEST_OUTPUT.txt A4-A7",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="event-derived, replay-safe, tested"),
    dict(
        name="Goals, mood + autonomy policy layer",
        category="Resident cognition",
        provider="NEXUS WORLD (self-built)",
        repo_url="",
        purpose="Genuine independent behaviour without LLM dependency: "
                "deterministic per-window goals (purpose_build/"
                "social_bond/rest_well/explore) measured from the event "
                "log, derived mood, bounded score biases (≤1.35) that "
                "make residents diverge from the pure utility script in "
                "personally-consistent ways",
        integration_method="residents/autonomy.py + engine integration; "
                           "goal windows are pure functions of (seed, "
                           "resident, window) — restart/replay-safe; "
                           "goal outcomes recorded as memories",
        install="part of the repo",
        connection="engine default (enable_policy=True), "
                   "counterfactual recorded per decision",
        registration="GET /autonomy/report",
        test="autonomy A1-A3/A8-A12 (14/14): deterministic goals, event-"
             "log progress, bounded divergence (4.5% direct run / "
             "29.9% API-driven run), source separation (script vs "
             "policy), restart persistence",
        security="n/a",
        licensing="ours",
        deployment="Tier-0 sandbox",
        limitations="bounded bias design: autonomy is measurable but "
                    "deliberately not chaotic; LLM layer still "
                    "authoritative at ambiguous moments when reachable",
        evidence="AUTONOMY_TEST_OUTPUT.txt A1-A12",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="the honest scripted-vs-autonomous distinction "
                        "the directive demands — measured, not asserted"),
    dict(
        name="Resident mind API (inner life endpoints)",
        category="Resident cognition API",
        provider="NEXUS WORLD (self-built)",
        repo_url="",
        purpose="Public inspection of each resident's inner state: "
                "autobiography, salience-ranked memories, friends, "
                "mood, active goal with progress; plus the population-"
                "level autonomy audit",
        integration_method="infrastructure/api_server.py: GET "
                           "/residents/{id}/mind, GET /autonomy/report "
                           "(additive, permission-gated)",
        install="part of the repo",
        connection="live in the FastAPI app",
        registration="additive routes on the ONE API",
        test="autonomy A13/A14 (14/14)",
        security="role-gated like every endpoint; no secrets in "
                 "responses",
        licensing="ours",
        deployment="Tier-0 sandbox",
        limitations="audit reflects the current process run (ledger is "
                    "in-memory analytics; state itself is event-sourced)",
        evidence="AUTONOMY_TEST_OUTPUT.txt A13/A14",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="tested live over the real API"),
    dict(
        name="OpenAI 403 diagnostics (edge geo-block analysis)",
        category="Network diagnostics",
        provider="NEXUS WORLD (self-built) + ipinfo/ip-api",
        repo_url="",
        purpose="Root-cause evidence for the OpenAI HTTP 403: egress IP "
                "geolocation (dual-source), pre-auth edge block proof, "
                "key format analysis — the directive's demand to not "
                "assume Nigeria",
        integration_method="scripts/openai_403_diagnosis.py: live probes "
                           "(geolocation x3, models/chat endpoints, "
                           "unauthenticated baseline, GLM control)",
        install="part of the repo",
        connection="one-shot live diagnostics",
        registration="evidence file only",
        test="all probes executed live 2026-11-13T17:39Z; conclusion: "
             "HK datacenter IP blocked pre-auth; key truncated (28 "
             "chars); Nigeria NOT involved",
        security="key never printed (length/prefix only)",
        licensing="n/a",
        deployment="Tier-0 sandbox",
        limitations="cannot change sandbox egress geography; will not "
                    "proxy around a geo-block (policy)",
        evidence="NEXUS_WORLD/reports/OPENAI_403_DIAGNOSIS.json",
        state="OPERATIONAL",
        decision="PROCEED",
        decision_reason="complete diagnosis with hard evidence; "
                        "resolution is user-side (full-length key + "
                        "supported-region egress)"),
]

for e in new_entries:
    upsert(**e)

reg.save(os.path.join(REPO, "integration", "register.json"))
with open(os.path.join(REPO, "integration", "INTEGRATION_REGISTER.md"),
          "w") as f:
    f.write(reg.to_markdown())

from collections import Counter
print("entries:", len(reg.all()))
print(Counter(r.state for r in reg.all()))
print(Counter(r.decision for r in reg.all()))
