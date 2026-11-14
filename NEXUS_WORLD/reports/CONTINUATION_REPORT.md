# NEXUS WORLD — Continuation Report (spec §45, 14-point mandatory format)

Phase: Continuation (Phase 1B completion + Phase 2 living residents +
3D NEXUS WORLD + credentials + MCP completion)
Report date: 2026-11-13
Directive: JARVIS NEXUS — CONTINUATION DIRECTIVE (preserve baseline,
configure two credentials, complete Blender/Unreal MCP, complete NEXUS
WORLD, continue the roadmap, verify, report honestly)
Result: **5 suites green — 150/150 checks (Phase 0: 11/11, Phase 1:
48/48 regression, Phase 2: 27/27, 3D: 17/17, Integration: 47/47).
18 technologies OPERATIONAL with evidence. Both credentials live-tested
with honest outcomes. Every blocker recorded precisely.**

---

## 1. What was inspected

The full committed baseline BEFORE any change: git history (4 commits),
Phase 0/1/1B artifacts, the 77-entry register, 13 OPERATIONAL
integrations, all prior reports. **Audit finding (honest):** the sandbox
recycle between sessions silently reverted two environment-level fixes —
the piper voice MODEL file was gone (W1 failing: 36/39) and the
fastapi/starlette security upgrade had reverted to 0.128.0/0.50.0. Both
were re-applied and re-verified; pip packages piper-tts reinstalled.
A2/A3 failures traced to the same missing model (voice capability is
honestly not registered when the model is absent).

## 2. What was researched

Railway deployment paths: GraphQL v2 schema introspection (all 255
mutations enumerated), CLI v5.74.0 behaviour with workspace tokens,
GitHub-repo vs OCI-image deploy flows. Blender 5.3 API deltas (primitive
op scale kwarg removal, slotted Action API, stdout pollution of stdio
MCP). z-ai CLI chat schema (OpenAI-compatible JSON, model glm-4-plus).
OpenAI edge-geo-blocking behaviour (403 before auth). No repositories
were cloned; no candidate matrix re-opened (register stands at 82
entries).

## 3. What was downloaded

- `bpy 5.3.0` wheel (407.7 MB) + `mcp<2` + deps into a NEW Python 3.13
  sidecar venv (`.venv-blender`) — the single largest addition; root-free
  via uv; recreatable in one command (ADR-008, L-22).
- piper voice model re-downloaded (63.2 MB, hf-mirror after HF stalls).
- Railway CLI 5.74.0 via npm (deployment attempt — see §10).

## 4. What was integrated (REAL connections, each with evidence)

| # | Integration | Real operation performed | Evidence |
|---|---|---|---|
| 1 | **Blender 5.3 (bpy module)** — decision REVERSED from REJECT (py3.13 sidecar now exists) | real scene construction (64 buildings, roads, 24 residents), Cycles CPU renders (top/street/night), USD+glTF+FBX exports, 144-fcurve keyframe animation | R2-R10, R17 |
| 2 | **Blender MCP server (self-built, headless)** — 6 tools over stdio MCP | initialize+list_tools handshake, build_scene, render_view, export_scene, scene_info, animate_scene — all real bpy calls; path-confinement guard proven rejecting `/tmp/evil.blend` | R11-R17 |
| 3 | **3D render pipeline on the central orchestrator** | render3d.render via POST /render → MCP transport → inspection (OpenCV) → AUTO-CORRECTION of a deliberately broken frame (brightness 0.004 → healed) | R3-R7, A7-A9 |
| 4 | **Z-AI (GLM glm-4-plus) hosted LLM** | first live completions verified this session (16:03 UTC: model glm-4-plus, real reply, 20-token usage); a SUSTAINED 429 rate-limit window then developed under testing (verified twice with direct CLI calls) — handled by the 300 s circuit breaker + 1-call/tick budget; deterministic fallback always authoritative. P19-P21 prove validation + fallback paths. | LIVE_COGNITION_EVIDENCE, P19-P21 |
| 5 | **OpenAI API provider** — configured exactly as directed | live probe executed: HTTP 403 edge-geo-block + key appears truncated (28 chars) — honest failure recorded, NEVER a fake completion | CREDENTIAL_VERIFICATION |
| 6 | **Railway (workspace token)** | live GraphQL v2: workspace enumerated (project "reasonable-heart"), write-capability PROVEN (serviceCreate + serviceDelete round-trip, workspace left clean); CLI + deploy path blocked — see §10 | RAILWAY_VERIFICATION |

**Not claimed as integrated:** Railway code deployment (no source-upload
mutation in the public API; CLI rejects workspace tokens), Unreal Engine
editor control (needs Windows/GPU/100GB — all 5 UE MCP entries remain
REJECTED with reasons; the Blender→Unreal export half IS operational),
OpenAI completions (geo-block + truncated key).

## 5. What was developed

| Module | Responsibility |
|---|---|
| `residents/engine.py` | THE living population: deterministic identity (names/roles/traits via SHA-256, no RNG state), needs model (energy/hunger/social/purpose), circadian + weekday utility layer, locality-first home/work/venue assignment, kinematic movement, weather state machine, meetings, memory emission — all event-sourced on the tested core |
| `residents/cognition.py` | ADR-003 layer 2: LLM chooses ONLY among the utility layer's allowed actions; invalid/unavailable → deterministic fallback, reason recorded |
| `geography/spatial.py` | deterministic 2D layout — single source of truth for simulation movement AND 3D rendering (no duplicated capability) |
| `models/zai_provider.py`, `models/openai_provider.py` | real ModelProvider implementations (subprocess CLI / raw httpx per register decision #10) with honest failure semantics + 429 circuit breaker |
| `render3d/` (6 modules) | spec builder, Blender core (py3.13 side), driver, OpenCV inspection + auto-correction loop, orchestrator pipeline (MCP-first, driver fallback) |
| `mcp_servers/blender_server.py` | FastMCP stdio server inside the bpy venv — the headless answer to GUI-editor Blender MCP |
| `persistence/world_store.py` | additive: memories projection, 5 new event types, hash + replay extended (regression clean) |
| `simulation/tick_engine.py` | optional behaviour hook (Phase 1 worlds unaffected — 48/48) |
| `infrastructure/api_server.py` + `integration/wiring.py` | additive routes: populate/residents/cognition-status/render/renders; blender MCP + render3d on the ONE orchestrator |
| `tests/phase2_acceptance.py`, `tests/render3d_acceptance.py` | 27 + 17 real-operation checks |
| `scripts/verify_credentials.py`, `verify_railway.py`, `live_cognition_test.py` | live evidence generators |

## 6. What was modified

Phase 0/1 files: untouched (regressions 11/11, 48/48). Phase 1B:
`wiring.py`/`api_server.py` additive only; `world_store.py` additive
event types + memories table (hash semantics extended — replay equality
re-proven P16); environment re-applied (piper model, security upgrade).
`.env` was git-TRACKED by Phase 1B — now untracked + gitignored +
chmod 600 (security hardening; keys never committed).

## 7. What tests were executed

1. `python3 tests/phase0_smoke_test.py` → 11/11 (regression)
2. `python3 tests/phase1_acceptance.py` → 48/48 (regression)
3. `python3 tests/phase2_acceptance.py` → 27/27
4. `python3 tests/render3d_acceptance.py` → 17/17
5. `python3 tests/integration_acceptance.py` → 47/47 (39 prior + 8 new:
   P2A-D populate/ticks/residents over the integrated app, A6 blender
   MCP connected, A7/A8 render auth + real render, A9 artifacts)
6. Live evidence scripts: credentials, Railway, cognition (all above)

## 8. Actual test results

**150/150 across five suites.** Phase 2 highlights: night coherence
24/24 asleep at 03:00; workday coherence 13/24 working/commuting at
13:00; all six actions observed; 39 resident communications; weather
transitions; REPLAY hash equality (P16); same-seed DETERMINISM (P17);
restart survival (P18); cognition validation + fallback (P19-P21);
API auth/409/404 semantics (P22-P27). 3D highlights: renders inspected
(mean 166.9, std 41.1, 2466 colours); black-frame REJECTED; broken
render AUTO-CORRECTED; USD/GLB/FBX magic bytes verified; MCP
path-confinement rejects escapes; 144 real fcurves. Integration: W1
piper restored (3.56 s audio in 0.21 s), A8 real render over MCP
transport.

## 9. Performance measurements

- 4 simulated days × 24 residents: **0.6 s** (≈ 10k events/day).
- Full Phase 2 suite (27 checks incl. two worlds, 7+ simulated days,
  replay + determinism rebuilds): **11.1 s**.
- Full 3D suite (6+ renders, 3 exports, MCP server lifecycle,
  animation): **26.0 s**; single 640×360/10-sample render ≈ 1-3 s;
  960×540/24 ≈ 15-40 s (CPU-only, L-24).
- Integration suite 47 checks incl. chromium, 2 MCP servers, piper,
  render: **20.3 s**.
- z-ai LLM call latency: 1-10 s (when not rate-limited).
- NOT measured: sustained multi-day tick throughput at scale; render
  farm throughput — baseline recorded for Phase 3 targets.

## 10. Remaining failures / precise blockers

None in delivered scope. Blockers requiring FOUNDER (only these):
1. **OpenAI**: edge-geo-blocked (403 "Country, region, or territory not
   supported") AND key appears truncated (28 chars). Needs: full-length
   key + egress from a supported region. Until then Z-AI (GLM) is the
   reachable hosted path — same contract, same router.
2. **Railway code deploy**: token is valid AND write-capable (proven),
   but deployment needs a GitHub repo connection, OCI image source, or
   a CLI-compatible account token (CLI rejects workspace tokens on its
   user-scoped check — verified; public API has no source-upload
   mutation — all 255 introspected). The project "reasonable-heart"
   exists with 0 services; Procfile + autoseed serve script are ready
   (`scripts/serve_world.py`, NEXUS_AUTOSEED=1, NEXUS_HOST=0.0.0.0).
3. **Unreal Engine import side**: needs Windows + GPU + ~100GB + UE
   5.4+ (EULA L-04). Export side delivered (USD/FBX/GLB verified).

## 11. Outstanding risks

| Risk | Severity | Mitigation |
|---|---|---|
| Sandbox recycles revert env-level state (proven twice: piper model, security upgrade; also lost pip packages once) | High for continuity | re-application documented in this report; venv recreate one-liner (L-22); committed artifacts are the durable truth |
| z-ai 429 rate limits under burst | Medium | circuit breaker + 1-call/tick budget + deterministic fallback (L-23) |
| bpy 407MB sidecar is gitignored | Medium | one-command recreate; honest "no backend" error otherwise (never a fake render) |
| Inspection is programmatic, not semantic | Medium | L-25; auto-correction covers exposure/framing; VLM-assisted inspection is a Phase 3 candidate |
| Event volume ~10k/day at 24 residents | Low at Tier 0 | SQLite handles it; Tier 1 moves to PostgreSQL (ADR-001) |

## 12. Required hardware or services

Nothing new for the delivered scope (everything runs on the Tier 0
sandbox). Founder inputs that would unblock more: (1) full OpenAI key +
supported-region egress; (2) GitHub repo connection or account-scope
Railway token; (3) a Windows/GPU workstation tier for UE import + GPU
rendering.

## 13. Next phase

**Phase 3 candidates (in existing roadmap order):** economy (double-
entry ledger — pattern proven in Phase 0) on the resident population;
road-following navigation (replace straight-line movement); rigged
characters + walk-cycle animation on the tested keyframe path; semantic
visual inspection; social graph projection from communication events;
Railway deployment the moment a deploy path is unblocked.

## 14. Exact files changed/created

Created: `residents/{__init__,engine,cognition}.py`,
`geography/spatial.py`, `render3d/{__init__,blender_colors,blender_core,
blender_script,spec,driver,inspection,pipeline}.py`,
`mcp_servers/{blender_server}.py` (+`__init__`), `tests/{phase2_acceptance,
render3d_acceptance}.py`, `scripts/{verify_credentials,verify_railway,
live_cognition_test}.py`, `docs/DECISIONS/ADR-008-blender-headless-sidecar.md`,
`Procfile`, `reports/{CREDENTIAL_VERIFICATION,RAILWAY_VERIFICATION,
LIVE_COGNITION_EVIDENCE,PHASE2_TEST_OUTPUT,RENDER3D_TEST_OUTPUT}.txt`,
`reports/render_evidence/*.png`.
Modified (additive): `persistence/world_store.py`,
`simulation/tick_engine.py`, `infrastructure/api_server.py`,
`integration/wiring.py`, `tests/integration_acceptance.py` (+8 checks),
`scripts/{gen_register,serve_world}.py`,
`integration/{register.json,INTEGRATION_REGISTER.md}` (82 entries),
`docs/KNOWN_LIMITATIONS.md` (L-13/14/15 resolved; L-21..L-26 added),
`contracts/EVENTS.md`, `README.md`, `.env` handling (untracked+600).
Rollback points: commits `8d28e61` (Phase 2+3D) and this phase's commit.
