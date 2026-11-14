# NEXUS WORLD — Phase 0 Technical Audit Report (Mandatory Report, spec §45)

Phase: 0 — Discovery and Audit
Report date: 2026-11-13
Orchestrator: Z.ai (principal architect / simulation / AI / distributed / database / gameplay / graphics / security / QA / technical-writer roles per spec §42)
Deliverable gate: COMPLETE — audit identified the actual starting point; no large implementation started, per spec §47.

---

## 1. What was inspected

**Local environment (all findings reproducible via `scripts/hardware_audit.sh`, output in `reports/PHASE0_HARDWARE_AUDIT.txt`):**
- Filesystem `/home/z/my-project/`: contains ONLY `upload/` (four pasted directive versions: JARVIS NEXUS v1/v2/v3 and NEXUS WORLD v4) and `download/` (README stub). **No JARVIS NEXUS repository, no J_AI codebase, no Django/Neo4j/LangChain installation exists on this machine.** The prior-session project summary describes a J_AI system, but none of its files are present — either it lived in a different environment or was never persisted here. Nothing could be preserved because nothing is there (limitation L-01).
- Hardware: 2 × Intel Xeon cores; 3.9 GiB RAM (no swap); 9.9 GiB disk, 8.0 GiB free; **no GPU** (no nvidia-smi, no /dev/dri); Debian 13 trixie, kernel 5.10.
- Runtimes: Python 3.12.16 (venv), Node v24.22.2, npm 11.19.1, git 2.47.3.
- Installed packages: fastapi 0.128.0, redis-py 7.4.0, fakeredis — no django, neo4j, langchain, torch, mesa.
- Services: no postgres/mysql/neo4j/redis/nats/temporal/docker binaries; no DB-related ports listening.

**Prior project records:** all four uploaded directive versions read and diffed in substance; NEXUS WORLD v4 (current) supersedes v1–v3 and is the governing specification.

## 2. What was researched

Three parallel research agents fetched **primary sources on 2026-11-13** (GitHub raw LICENSE/README, releases/commits Atom feeds, PyPI JSON API, official docs, ODbL text, Cesium ToS/pricing, Epic hardware-spec pages; GitHub REST API was rate-limited, so licence/activity evidence came from raw files and Atom feeds). 30 candidates of the spec §29 matrix covered; every entry with fetched-source URLs is in `research/RESEARCH_EVIDENCE_LEDGER.md`. Verdict summary:

- **ADOPT (Tier 0/1):** Mesa 3.5.2 (Apache-2.0), LangGraph 1.2.21 (MIT), Inspect AI 0.3.289 (MIT), SUMO 1.28.0 (EPL-2.0, Phase 4), PostgreSQL 18.7 + PostGIS 3.7 (Tier 1), NATS 2.15.3 + JetStream (Tier 1), OpenTelemetry/Prometheus/Grafana (Tier 1), Blender 5.3 headless (Phase 4), OSM extracts with ODbL isolation (ADR-004).
- **PROTOTYPE:** Repast4Py 1.3.1 (Phase 9 distributed), Graphiti 0.31.2 (memory; RAM spike pending L-05), OpenUSD 26.11 (interchange), CesiumJS 1.147 (web viewer, self-hosted tiles), GAMA (fallback only), PEFT (Tier 2).
- **DEFER (GPU-bound, Tier 2):** vLLM 0.33.0, SGLang 0.5.23, FLAME GPU 2 (AGPL-3.0, RC), CARLA 0.9.16, TRL 1.17.1, LLaMA-Factory 0.9.5, DeepSpeed 0.20.0, Unreal Engine 5.8 (EULA text UNVERIFIED — L-04).
- **REJECT:** Repast HPC (dormant since 2022, C++/cluster-only).

## 3. What was downloaded

**No third-party repository was cloned and no package installed.** Reason: spec §7 staged protocol (clone only at Stage C with an integration decision) and Tier 0 disk budget (torch-stack ≈ 2 GB each). All 30 candidates remain at Stage A/B (remote inspection) — recorded with version, licence and decision in `repositories/REPOSITORY_ACQUISITION_MANIFEST.md`. Claiming "downloaded and integrated" here would have been a false completion claim (spec §43).

## 4. What was integrated

Nothing external. One internal integration exists: the **event-sourced persistence pattern** (stdlib SQLite) — designed, implemented and tested as `tests/phase0_smoke_test.py`. This is the foundation the Phase 1 world runs on (ADR-002).

## 5. What was developed

- `NEXUS_WORLD/` project tree per spec §44 (29 directories).
- `scripts/hardware_audit.sh` — reproducible environment auditor.
- `tests/phase0_smoke_test.py` — 11-check acceptance suite for the persistence core (restart survival, idempotency, ledger zero-sum, replay, determinism).
- `research/RESEARCH_EVIDENCE_LEDGER.md` — 26+ technology entries with evidence classes, claims register C1–C7.
- `repositories/REPOSITORY_ACQUISITION_MANIFEST.md` — 30 entries, Stage A/B, copyleft inventory.
- `docs/MASTER_ARCHITECTURE.md` — validated layered architecture, 10 diagrams/sections done of the 25 required (index inside), three-tier topology.
- `docs/SYSTEM_REQUIREMENTS.md`, `docs/KNOWN_LIMITATIONS.md` (L-01…L-10), five ADRs.

## 6. What was modified

Nothing pre-existing was modified (nothing existed to modify — see §1). The uploaded directives were read-only inputs and remain untouched.

## 7. What tests were executed

1. `bash scripts/hardware_audit.sh` → `reports/PHASE0_HARDWARE_AUDIT.txt`.
2. `python3 tests/phase0_smoke_test.py` → `reports/PHASE0_TEST_OUTPUT.txt` (2026-11-13, on the audited 2-core host).

## 8. Actual test results

Smoke test: **11/11 PASS** (verbatim from `reports/PHASE0_TEST_OUTPUT.txt`):

```
[PASS] world built with 6 events — count=6
[PASS] T2 duplicate payment rejected
[PASS] T2 payer balance debited exactly once — r-001=99550
[PASS] T2 payee balance credited exactly once — r-002=50450
[PASS] T2 closed-system ledger sums to zero — sum=0
[PASS] T2 event log still has 6 events — count=6
[PASS] T1 state hash identical after restart — 2cd9b2c1f7f7a679 vs 2cd9b2c1f7f7a679
[PASS] T1 resident location persisted — bakery
[PASS] T1 resident energy restored to 100 — 100
[PASS] T3 replayed state hash identical to live state — 2cd9b2c1f7f7a679 vs 2cd9b2c1f7f7a679
[PASS] T4 same events => same state hash — 2cd9b2c1f7f7a679 vs 2cd9b2c1f7f7a679
=== RESULT: 11/11 checks passed in 6.6 ms on 2-core host ===
```

## 9. Performance measurements

- Full smoke suite (DB create, 6 events incl. double-entry payment, restart, replay rebuild, deterministic rebuild): **6.6 ms wall clock** on 2 cores — orders of magnitude inside any plausible tick budget.
- No other performance claims are made. Simulation ticks/s, decisions/s, inference latency, p50/p95/p99: **not yet measured** — no simulation exists yet; targets will be set after Phase 1 baseline per spec §41 ("Do not invent universal numerical targets before hardware and workload are measured").

## 10. Remaining failures

None in what was built. Known gaps are registered as limitations L-01…L-10 (`docs/KNOWN_LIMITATIONS.md`) rather than hidden: most material are L-01 (no prior codebase exists here — contrary to the directive's premise), L-03 (sandbox cannot host a 24/7 daemon), L-04 (UE EULA unverified).

## 11. Outstanding risks

| Risk | Severity | Mitigation |
|---|---|---|
| Founder expects prior JARVIS/NEXUS code to be extended, but it is absent | High | This report states it plainly; supply the repo to this environment if it exists elsewhere |
| Hosted LLM credentials not yet provided | Medium (blocks Phase 2 cognition + evals) | Tier 0 Phases 1–2 first stages need none; request before Phase 2 benchmark |
| Ephemeral sandbox (processes die between sessions) | Medium | Deterministic resumable tick loop; Tier 1 host for true persistence |
| ODbL / UE EULA legal unknowns | Medium | ADR-004 isolation; ADR-005 verification gate; legal review before any publication |
| Graphiti/FalkorDB RAM fit unknown | Low | Phase 2 spike with Postgres fallback |

## 12. Required hardware or services

- Now (Phase 1–2): nothing beyond the current sandbox + **an OpenAI-compatible hosted LLM endpoint and API key** for cognition benchmarks (Inspect AI) and resident decision calls.
- Phase 3–5 (recommended): Tier 1 host per `docs/SYSTEM_REQUIREMENTS.md` (8+ cores, 32 GB RAM, 500 GB SSD).
- Phase 6+ (aspirational): Tier 2 GPU host (24 GB+ VRAM) for local serving/fine-tuning; separate UE5 rendering workstation.

## 13. Next phase

**Phase 1 — Core world foundation** (spec §39): world identity + world clock + geographic hierarchy + persistent storage + event infrastructure + entity identity + region ownership, as a small persistent world surviving restart, with acceptance tests per spec §40. Concretely:
1. `pip install mesa` (Stage C PoC), build `simulation/` tick loop over the tested event core.
2. World clock entity (ticks ↔ calendar, timezones) + geography hierarchy (world→continent→country→state→city→district→neighbourhood→building) in SQLite.
3. FastAPI read endpoints + Founder command skeleton with permission classes.
4. Acceptance: restart survival, replay, duplicate-event rejection, 100+ tick deterministic run, world survives API-server restart.
Gate to Phase 2 (living residents vertical slice) on those tests passing.

## 14. Exact files changed/created this phase

```
NEXUS_WORLD/
├── README.md
├── research/RESEARCH_EVIDENCE_LEDGER.md
├── repositories/REPOSITORY_ACQUISITION_MANIFEST.md
├── docs/
│   ├── MASTER_ARCHITECTURE.md
│   ├── SYSTEM_REQUIREMENTS.md
│   ├── KNOWN_LIMITATIONS.md
│   └── DECISIONS/
│       ├── ADR-001-three-tier-hardware-strategy.md
│       ├── ADR-002-event-sourced-idempotent-state.md
│       ├── ADR-003-mesa-core-and-hierarchical-cognition.md
│       └── ADR-004-osm-isolation-ADR-005-gpu-deferral.md
├── scripts/hardware_audit.sh
├── tests/phase0_smoke_test.py
└── reports/
    ├── PHASE0_HARDWARE_AUDIT.txt
    ├── PHASE0_TEST_OUTPUT.txt
    └── PHASE0_TECHNICAL_AUDIT.md   (this file)
```
Plus 24 empty scaffolding directories per spec §44 awaiting their phases. No files outside `NEXUS_WORLD/` were modified. No git history exists yet in this tree (no repository was initialised; recommend `git init` at Phase 1 start so every subsequent phase carries commit hashes as spec §45 requires).
