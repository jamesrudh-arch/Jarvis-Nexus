# NEXUS WORLD — Phase 1B Report: System-Wide Integration Directive (spec §45)

Phase: 1B — System-wide integration (mandatory directive executed together
with the Phase 1 world foundation)
Report date: 2026-11-13
Companions: `integration/INTEGRATION_REGISTER.md` (the 15-field live
register, 77 entries) · `research/TECHNOLOGY_DISCOVERY_SWEEP.md` (the
16-category global discovery) · `docs/DECISIONS/ADR-007`
Result: **39/39 integration acceptance checks PASS + Phase 1 regression
48/48 + Phase 0 regression 11/11, all re-run on the security-patched
stack. 13 technologies OPERATIONAL with real-operation evidence. Zero
fabricated integrations; every blocker recorded precisely.**

---

## 1. What was inspected

Re-verified before changing anything: the committed Phase 0/1 tree
(git `836818b` clean), runtime packages (mcp 1.27.0, playwright 1.57.0 +
chromium-1200 browsers, opencv-python-headless 4.13.0.90,
prometheus_client 0.24.1, psutil — all pre-present and pinned in the new
`requirements.txt`), and the environment's hard constraints (2 cores,
3.9 GB RAM, 8 GB disk, no GPU, no display, no root, no Docker daemon).

## 2. What was researched

A global discovery sweep across ALL 16 directive categories (NOT limited
to any supplied list), executed by three parallel research agents against
primary sources (PyPI JSON API, npm registry, raw GitHub files, release/
commit feeds, official docs) with in-sandbox verification where possible
(including live benchmarks of piper/kokoro/faster-whisper/whisper.cpp, a
rootless Godot run, and a Playwright chromium launch + `ldd` check).
Consolidated in `research/TECHNOLOGY_DISCOVERY_SWEEP.md`; 77 register
entries resulted: 13 OPERATIONAL, 29 DEFER (with triggers), 35 REJECT
(with precise reasons).

## 3. What was downloaded

- `piper-tts 1.8.0` wheel (+onnxruntime dep) and the
  `en_US-lessac-medium` voice model (63 MB, from
  huggingface.co/rhasspy/piper-voices) — the only runtime additions.
- `bandit 1.9.4` + `pip-audit 2.10.1` (dev-time security tooling).
- `@modelcontextprotocol/server-filesystem` 2.3.0 via npx cache (runtime
  subprocess, not vendored).
- Upgrades (security remediation): fastapi 0.128.0 → 0.162.6, starlette
  0.50.0 → 1.10.0.

## 4. What was integrated (REAL connections, each with evidence)

| # | Integration | Real operation performed | Evidence |
|---|---|---|---|
| 1 | **MCP integration layer** (official mcp SDK 1.27.0, `integration/mcp_layer.py`) | discovery, schema capture, allowlist enforcement, timed execution, error mapping, JSON logging, health — for 2 servers | M1–M8 |
| 2 | **Filesystem MCP server** (official reference server 2.3.0 via npx, `--read-only`) | live stdio handshake; 10 tools discovered; real list_directory / read_text_file / read_multiple_files / directory_tree calls | M1–M8 |
| 3 | **JARVIS exposed AS an MCP server** (`integration/mcp_server_expose.py`) | external-client round-trip: get_world_status, run_ticks (tick 0→5 persisted), wrong-token rejection, permission enforcement through the MCP transport | J1–J6 |
| 4 | **Playwright headless chromium** (`integration/browser.py`) | real page loads (local fixture + live https://example.com HTTP 200), link extraction, PNG screenshot | B1–B4 |
| 5 | **OpenCV vision** (`integration/vision.py`) | image analysis (known fixture + screenshot), QR encode→decode roundtrip | V1–V3 |
| 6 | **piper TTS** (`integration/voice.py`) | 3.53 s of speech synthesised in 0.2 s wall (WAV, 22.05 kHz) | W1 |
| 7 | **prometheus_client + psutil** (`observability/metrics.py`) | /metrics exposition with command/tool/latency/world/MCP/process series | O1–O2, A1, A5 |
| 8 | **Central orchestration of everything** | multi-tool workflow browser.screenshot → vision.analyze_image through the orchestrator with audit trail, approval gate, idempotency | X1–X5, A4 |

Plus the platform core re-verified on the new stack: FastAPI API (now 14
endpoints), SQLite event store, orchestrator + permissions, bandit and
pip-audit as operating security tooling.

**Not claimed as integrated** (precise blockers, full records in the
register): Railway (account/token absent), Blender MCP (needs Blender GUI
app + no root + bpy needs Python 3.13), UE MCPs (need live UE editor),
Docker (no daemon), cloud voice/vision APIs (no credentials), computer-use
agents (need Docker/X11/creds or GUI), robotics (no hardware).

## 5. What was developed

| Module | Responsibility |
|---|---|
| `integration/mcp_layer.py` | THE reusable MCP client layer: discovery, tool schemas, per-server allowlist permissions, timed execution, error taxonomy, JSON logging, health monitoring; credential-stripped child env |
| `integration/mcp_server_expose.py` | JARVIS capabilities exposed as an MCP stdio server (5 tools) routing through the same orchestrator/permission path |
| `integration/browser.py` | Playwright service: dedicated worker thread (sync API constraint), navigate/links/screenshot |
| `integration/vision.py` | OpenCV service: analyze_image, decode_qr, make_qr_png |
| `integration/voice.py` | piper TTS service: lazy model load, WAV synthesis |
| `integration/register.py` | 15-field register with the 8-state machine; OPERATIONAL requires evidence; regressions refused |
| `integration/wiring.py` | IntegrationBundle: connects approved tech, registers ALL capabilities on the single orchestrator; additive FastAPI routes |
| `observability/metrics.py` | Prometheus metrics + zero-dep JSON logging + InstrumentedOrchestrator |
| `tests/integration_acceptance.py` | 39-check suite — every check a real operation |
| `scripts/gen_register.py` | register generator (77 entries) |
| `requirements.txt` | pinned dependency inventory with justification comments |

## 6. What was modified

- `infrastructure/api_server.py`: additive `/metrics`, `/integrations`,
  `/integrations/health` (lazy bundle; zero Phase-1 endpoint changes).
- `persistence/world_store.py`: SQLite `check_same_thread=False` + writer
  RLock (FastAPI threadpool safety — needed once integrations became
  reachable through HTTP); `entities()` rewritten to constant
  parameterised queries (bandit B608 remediation).
- `docs/KNOWN_LIMITATIONS.md` (L-15…L-20), `README.md` (status).
- Environment: fastapi/starlette security upgrade (see §10).
- Development incidents (all fixed, all documented in this report):
  MCP-worker thread had no `run()` override (connect timeout);
  `Thread._stop` attribute shadowing; `run_coroutine_threadsafe` misuse
  for `Event.set()`; SDK default child env lacks HOME → npx hangs;
  QR encoder quiet-zone quirk; DOM URL trailing-slash normalisation.

## 7. What tests were executed

1. `python3 tests/integration_acceptance.py` → `reports/INTEGRATION_TEST_OUTPUT.txt`
2. `python3 tests/phase1_acceptance.py` (regression, post-upgrade) → 48/48
3. `python3 tests/phase0_smoke_test.py` (regression, post-upgrade) → 11/11
4. `bandit -r . -x ./tests` (twice: found → post-remediation) and
   `pip-audit -r requirements.txt` (twice) → `reports/SECURITY_SCAN_OUTPUT.txt`

## 8. Actual test results

**39/39 PASS in 7.4–7.9 s** (verbatim in
`reports/INTEGRATION_TEST_OUTPUT.txt`): MCP discovery/schemas (10 tools) ·
read-only server enforcement (write tools not served) · 4 real filesystem
tool calls · allowlist denial · server-error mapping · health counters ·
JARVIS-over-MCP status/ticks/token-rejection/permissions/capabilities ·
browser navigate/links/screenshot (incl. live example.com 200) · vision
fixture + QR roundtrip + screenshot analysis · piper WAV synthesis ·
orchestrated multi-tool workflow with audit events · command idempotency ·
unknown-capability rejection · Prometheus exposition + tick gauge ·
register state machine (evidence gate, regression refusal, persistence) ·
API additive routes + external capability over HTTP `/command`.
Regressions on the same (upgraded) stack: Phase 1 48/48, Phase 0 11/11.

## 9. Performance measurements

- Full 39-check integration suite (2 world builds, 2 npx MCP servers, 1
  Python MCP server, 2 chromium launches, 1 TTS synthesis, full API
  round-trips): **7.4–7.9 s wall** on 2 cores.
- MCP tool call round-trip after connect: milliseconds (content in
  `elapsed_ms` per call log line).
- piper synthesis: 3.53 s audio in 0.2 s (~17× realtime measured here;
  research benchmark 4×/306 MB RSS).
- npx filesystem server connect: 0.6 s warm (measured); 180 s timeout
  budget for cold cache.
- NOT yet measured: sustained tool-call throughput under load; MCP
  Streamable-HTTP transport latency (Tier 1); those land with Phase 2
  workloads per spec §41 (baseline-then-target).

## 10. Remaining failures

None in the delivered scope. Two test-expectation issues were found and
fixed during development (B2: DOM serialises `https://example.com` as
`https://example.com/`; V2: OpenCV's QR encoder output already includes
its quiet zone — adding a border breaks the detector). One REAL security
finding was remediated end-to-end: pip-audit found 5 CVEs in starlette
0.50.0 (PYSEC-2026-161/-2280/-2281/-248/-249) → upgraded to
fastapi 0.162.6 / starlette 1.10.0 → re-scan clean → all three suites
re-run green. bandit: 3 Medium → 2 accepted-and-documented (B108 /tmp
dev-path defaults), 0 High.

## 11. Outstanding risks

| Risk | Severity | Mitigation |
|---|---|---|
| Reference filesystem server is "educational, not production-ready" (upstream's own warning) | Medium | dual gate (read-only + allowlist) confines blast radius; vendor a hardened fork at Tier 1 |
| MCP SDK 1.x pinned; 2.x removes bundled FastMCP | Low | upgrade path documented (ADR-007); exposure server migration is the only code change |
| stdio exposure server uses per-call token (no headers on stdio) | Medium at Tier 1 | Tier 1 moves to Streamable HTTP + header auth (L-16) |
| piper GPL-3.0 | Low while internal | Founder decision before any binary distribution (L-19); MIT alternative recorded |
| Chromium system-lib dependency on fresh hosts | Medium at deploy | `ldd` pre-flight documented; deb.deps list in register (L-18) |
| LLM credentials still absent | Blocks Phase 2 cognition | Founder input required (unchanged since Phase 1) |
| Ephemeral sandbox (no 24/7 daemon) | Structural | deterministic-resumable world; any future host continues from the event log |

## 12. Required hardware or services

Now: nothing new — everything runs on the Tier 0 sandbox. Founder inputs
that would unblock more: (1) OpenAI-compatible LLM endpoint + key (Phase 2
cognition); (2) Railway account/token (Tier 1 deploy verification);
(3) optionally a GPU workstation tier (unlocks the DEFERRED
Blender/UE/training cluster entries).

## 13. Next phase

**Phase 2 — Living resident vertical slice** (unchanged plan, now with a
tested integration surface): resident identities on the entity core;
schedules/movement/work/eat/sleep; double-entry economy; communication
events; memory records (decide: MCP memory server vs Graphiti vs
Postgres schema — L-05); hierarchical cognition via the model-provider
abstraction (needs LLM credentials). Acceptance: residents maintain
coherent lives across restarts without the Founder online. The
integration layer is ready for whatever Phase 2 needs (e.g., ASR when
voice commands arrive).

## 14. Exact files changed/created

Created: `integration/{__init__,mcp_layer,mcp_server_expose,browser,vision,voice,register,wiring}.py`,
`integration/{register.json,INTEGRATION_REGISTER.md}`,
`observability/metrics.py` (dir `__init__` existed),
`tests/integration_acceptance.py`, `scripts/gen_register.py`,
`requirements.txt`, `research/TECHNOLOGY_DISCOVERY_SWEEP.md`,
`docs/DECISIONS/ADR-007-mcp-integration-layer.md`,
`reports/{INTEGRATION_DIRECTIVE_REPORT,INTEGRATION_TEST_OUTPUT,SECURITY_SCAN_OUTPUT}.md|txt`,
`assets/voices/en_US-lessac-medium.onnx{,.json}` (model, 63 MB).
Modified: `infrastructure/api_server.py` (additive routes),
`persistence/world_store.py` (thread-safe SQLite + B608 fix),
`docs/KNOWN_LIMITATIONS.md`, `README.md`.
Deleted: nothing. Rollback point: commit `836818b` (Phase 1); this phase
commits on top with the full test evidence included.
