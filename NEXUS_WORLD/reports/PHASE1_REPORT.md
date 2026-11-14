# NEXUS WORLD — Phase 1 Report (Mandatory Report, spec §45)

Phase: 1 — Core world foundation
Report date: 2026-11-13
Companion: `JARVIS_NEXUS_ARCHITECTURE_AUDIT.md` (same run — the Founder directed both to be done together)
Result: **ACCEPTANCE GATE PASSED — 48/48 checks** + live-server evidence + Phase 0 regression clean.

---

## 1. What was inspected

Re-verified before changing anything: repository tree (Phase 0 baseline, commit `808f4eb`), runtime packages (fastapi 0.128.0, uvicorn 0.44.0, httpx 0.28.1, pydantic 2.12.5 — all pre-installed), and the JARVIS NEXUS directive's established-architecture table (adopted as target, actual status per component reported in the audit's Part A).

## 2. What was researched

Five candidate repositories from the JARVIS NEXUS directive, evidence-fetched by two research agents (primary sources: raw LICENSE files, releases/commits Atom feeds, PyPI/npm registries, official docs — all URLs in the audit Part C):
- **RunAnywhere** (RunanywhereAI/runanywhere-sdks): custom non-OSI threshold licence; Python SDK alpha and NOT on PyPI (verified 404) → REJECT
- **Stagehand** (browserbase/stagehand): MIT, v4.4.0 (2026-11-04), official Python SDK, local-browser mode, BYO-LLM callback → DEFER with documented trigger (semantic-browsing requirement)
- **CUT3R** (CUT3R/CUT3R): CC BY-NC-SA 4.0 (non-commercial), dormant since 2025-08-27, CUDA required → REJECT
- **Frigate** (blakeblackshear/frigate): MIT, 0.18.2, healthy — but requires cameras + bare-metal Docker host + accelerator; cannot run here or on Railway → REJECT (MQTT integration path documented for future)
- **H2O LLM Studio** (h2oai/h2o-llmstudio): Apache-2.0, v1.15.4 — but NVIDIA GPU + 128–256 GB RAM mandatory, duplicates TRL+PEFT/LLaMA-Factory already shortlisted → DEFER per directive's own rule

## 3. What was downloaded

**Nothing.** Zero repositories cloned, zero packages installed. All five candidates rejected/deferred on evidence; every Phase 1 need was met by already-installed components. (Directive Part 5: "ZERO NEW DEPENDENCIES IS AN ACCEPTABLE AND SOMETIMES SUPERIOR RESULT.")

## 4. What was integrated

Nothing external. Internally, the Phase 0 tested persistence pattern was promoted into the production module `persistence/world_store.py` (event-sourced, idempotent apply, replayable, deterministic state hash) and wired to every Phase 1 subsystem.

## 5. What was developed

| Module | Responsibility |
|---|---|
| `persistence/world_store.py` | Authoritative world state: event log + idempotent apply + 6 projections + replay + state hash + deterministic ID allocation |
| `infrastructure/event_bus.py` | In-process pub/sub with handler fault isolation (Tier 1: NATS adapter behind same interface) |
| `simulation/world_clock.py` | Tick↔calendar arithmetic, per-region timezones, day/night, seasons |
| `simulation/tick_engine.py` | Deterministic tick loop with crash-safe tick keys + automatic lease renewal |
| `simulation/region_ownership.py` | Region registry: acquire/renew/transfer with ownership validation |
| `geography/hierarchy.py` | 8-level procedural geography (seeded, fictional; 129 nodes in default world) |
| `security/permissions.py` | Action classes (observe…irreversible), roles, approval gates |
| `orchestration/command.py` | THE central orchestrator: permission → risk/approval → execute → audit; idempotent by command_id; capability registry (agent-manager hook) |
| `models/provider_registry.py` | Model-provider abstraction contract + ModelRouter + deterministic EchoProvider test double |
| `infrastructure/api_server.py` | FastAPI World API: 11 endpoints, token auth (founder/observer), polling event feed |
| `contracts/EVENTS.md` | Event + API + provider contracts |
| `scripts/run_world.py`, `scripts/serve_world.py` | CLI world runner; real uvicorn server |
| `tests/phase1_acceptance.py` | 48-check acceptance suite (spec §40 persistence criteria + directive Part 9) |

## 6. What was modified

Phase 0 files: untouched except `reports/PHASE1_*` additions. Git rollback point was committed BEFORE implementation (`808f4eb`); two implementation bug-fixes were made during development (command event payload completeness; result serialisation) plus two test-expectation corrections — all documented in the test output history.

## 7. What tests were executed

1. `python3 tests/phase1_acceptance.py` → `reports/PHASE1_TEST_OUTPUT.txt`
2. `python3 tests/phase0_smoke_test.py` (regression) → still 11/11 PASS
3. `python3 scripts/run_world.py --fresh --ticks 288` (CLI end-to-end) → `reports/PHASE1_LIVE_SERVER_EVIDENCE.txt` header + output
4. Live uvicorn server over real HTTP: create world → 144-tick day → unauthenticated request rejected → state persisted → `reports/PHASE1_LIVE_SERVER_EVIDENCE.txt`

## 8. Actual test results

**48/48 PASS in 265.3 ms** (verbatim in `reports/PHASE1_TEST_OUTPUT.txt`), covering: world+geography build (8 levels, 129 nodes) · duplicate-event rejection · 120-tick run · state hash identical after restart · replay reconstruction from event log alone · entity identity + ID-counter continuity · same-seed determinism · clock correctness (144 ticks = 1 day, +3h timezone, day/night boundary, season roll) · ancestry integrity + no orphan nodes · single-owner region leases · wrong-owner transfer rejected · ownership survives restart · observer role blocked · duplicate command_id no-op · external-action approval gate · unknown capability audited · complete audit log (7/7) · API create/409/health/auth 401/403 · tick batch + re-post idempotency (288 events, zero duplicates) · event pagination · transfer 409/200 · command endpoint + duplicate replay · **API-server restart survival** · provider routing/errors/duplicates · bus fault isolation. Live server: 201/200/403/200 over real TCP. Regression: Phase 0 suite 11/11.

## 9. Performance measurements

- Full 48-check suite incl. two world builds, 288+120 tick advances, replay rebuild, two API server instances: **265 ms wall clock** on 2 cores.
- CLI: 288 ticks + world creation (134 events) in the same run, sub-second total.
- Live HTTP: create-world 201 and 72-tick batch 200 responded within the client's default timeout without perceptible delay (sub-second, informal).
- NOT yet measured (no workload exists yet): sustained ticks/s at scale, p50/p95/p99 latency under load, memory ceiling per region — scheduled with Phase 2's resident population (spec §41: targets set after baseline).

## 10. Remaining failures

None in the delivered scope. Two test-expectation errors were found and corrected during development (audit-log count, pagination sequence numbers) — the system under test needed no change for them.

## 11. Outstanding risks

| Risk | Severity | Mitigation |
|---|---|---|
| SQLite single-writer limits concurrent API+engine processes | Medium | Tier 0 runs one writer by design; Tier 1 moves to PostgreSQL+NATS behind the same interfaces (ADR-001/002) |
| Lease model has no fencing tokens (single-owner assumption) | Low at Tier 0 | Documented in ADR; fencing tokens added at Tier 1 multi-worker |
| No TLS / no rate limiting (loopback dev server) | Medium at deployment time | Deployment-tier concern; token auth + read-only observers already enforced |
| LLM credentials still absent | Blocks Phase 2 cognition | Founder input required |
| Ephemeral sandbox (no 24/7 daemon) | Structural | Deterministic resumable world — any future host continues the same world from the event log |

## 12. Required hardware or services

Now: nothing new — everything runs on the Tier 0 sandbox. Phase 2: an OpenAI-compatible LLM endpoint + key. Phase 3+: Tier 1 host per `docs/SYSTEM_REQUIREMENTS.md`.

## 13. Next phase

**Phase 2 — Living resident vertical slice:** resident identities on the tested entity core; schedules; movement between buildings; work/eat/sleep; earn/spend (double-entry ledger — pattern already proven in Phase 0); communication events; memory records; independent decisions with the hierarchical-cognition contract (ADR-003) via the model-provider abstraction (needs credentials for the LLM tier; deterministic utility layer works without). Acceptance: residents maintain coherent lives across restarts without the Founder online.

## 14. Exact files changed/created

Created: `persistence/{__init__,world_store}.py`, `infrastructure/{__init__,event_bus,api_server}.py`, `geography/{__init__,hierarchy}.py`, `simulation/{__init__,world_clock,tick_engine,region_ownership}.py`, `security/{__init__,permissions}.py`, `orchestration/{__init__,command}.py`, `models/{__init__,provider_registry}.py`, `contracts/EVENTS.md`, `scripts/{run_world,serve_world}.py`, `tests/phase1_acceptance.py`, `reports/{PHASE1_TEST_OUTPUT.txt,PHASE1_LIVE_SERVER_EVIDENCE.txt,PHASE1_REPORT.md,JARVIS_NEXUS_ARCHITECTURE_AUDIT.md}`, `docs/DECISIONS/ADR-006-*.md`.
Modified: `docs/KNOWN_LIMITATIONS.md`, `README.md` (status updates).
Deleted: nothing. Full manifest with commit hash in the git log of this repository.
