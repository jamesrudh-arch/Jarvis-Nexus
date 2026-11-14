# NEXUS WORLD — Repository Acquisition Manifest

Protocol: spec §7 staged discovery (A: shortlist → B: inspect source/licence/deps → C: minimal PoC → D: benchmark → E: integrate after acceptance checks).
Audit date: 2026-11-13.

## Status legend

| Stage | Meaning |
|---|---|
| A — SHORTLISTED | Found, canonical URL identified |
| B — INSPECTED (remote) | README, LICENCE, dependency metadata, releases and activity inspected via fetched primary sources. **Not cloned.** |
| C — POC | Built/run locally as minimal proof of concept |
| E — INTEGRATED | Passed acceptance checks, wired into NEXUS with owner/tests |

**Phase 0 honest statement: no repository has been cloned or integrated yet.** All entries below are Stage A/B. Cloning is deferred until each phase's integration decision, because (a) the 8 GB disk cannot hold speculative checkouts (e.g. torch-based stacks cost ~2 GB each), and (b) spec §9 forbids integration without an owner, purpose, interface contract, test, failure strategy and maintenance strategy. The one exception is not a repository but a pattern: the stdlib-SQLite persistence core, which was **TESTED locally** (see ledger §3.1).

## Manifest

| # | Repository | Owner | Canonical URL | Version inspected | Licence | Language | Install status | Build status | Test status | Security review | Integration status | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | mesa | mesa org | https://github.com/mesa/mesa | v3.5.2 (2026-10-28) | Apache-2.0 | Python | not installed | n/a | not run | pending | Stage B | ADOPT at Phase 1 (sim core) |
| 2 | sumo | eclipse-sumo | https://github.com/eclipse-sumo/sumo | v1_28_0 (2026-10-07) | EPL-2.0 | C++ + Python tools | not installed | n/a | not run | pending | Stage B | ADOPT at Phase 4 (transport) |
| 3 | repast4py | Repast | https://github.com/Repast/repast4py | v1.3.1 (2026-10-22) | BSD-3-Clause | Python/C ext | not installed | n/a | not run | pending | Stage B | PROTOTYPE at Phase 9 (distributed) |
| 4 | repast.hpc | Repast | https://github.com/Repast/repast.hpc | v2.3.1 (2021-10-21) | BSD-3-Clause | C++ | not installed | n/a | n/a | n/a | Stage B | **REJECT** — dormant since 2022 |
| 5 | FLAMEGPU2 | FLAMEGPU | https://github.com/FLAMEGPU/FLAMEGPU2 | v2.0.0-rc.5 (2026-10-14) | **AGPL-3.0** | C++/CUDA | not installed (needs GPU) | n/a | n/a | AGPL obligations assessed | Stage B | DEFER to GPU tier; AGPL review before any service exposure |
| 6 | gama | gama-platform | https://github.com/gama-platform/gama | 2025.06.4 (2025-07-03) | GPL-3.0 | Java/GAML | not installed | n/a | n/a | pending | Stage B | PROTOTYPE (fallback only) |
| 7 | carla | carla-simulator | https://github.com/carla-simulator/carla | 0.9.16 (2025-09-16) | MIT | C++/UE + Python client | not installed (needs GPU server) | n/a | n/a | pending | Stage B | DEFER to GPU tier |
| 8 | langgraph | langchain-ai | https://github.com/langchain-ai/langgraph | 1.2.21 (2026-11-12) | MIT | Python | not installed | n/a | not run | pending | Stage B | ADOPT at Phase 2 (cognition orchestration) |
| 9 | graphiti | getzep | https://github.com/getzep/graphiti | v0.31.2 (2026-10-20) | Apache-2.0 | Python | not installed | n/a | not run | pending | Stage B | PROTOTYPE at Phase 2+ (memory) — RAM spike required (falkordblite) |
| 10 | vllm | vllm-project | https://github.com/vllm-project/vllm | v0.33.0 (2026-11-01) | Apache-2.0 | Python/CUDA | not installed (GPU-bound, 717 MB wheel) | n/a | n/a | n/a | Stage B | DEFER to GPU tier |
| 11 | sglang | sgl-project | https://github.com/sgl-project/sglang | v0.5.23 (2026-11-02) | Apache-2.0 | Python/CUDA | not installed (GPU-bound) | n/a | n/a | n/a | Stage B | DEFER to GPU tier |
| 12 | trl | huggingface | https://github.com/huggingface/trl | v1.17.1 (2026-10-30) | Apache-2.0 | Python | not installed | n/a | n/a | n/a | Stage B | DEFER to training tier (Phase 6) |
| 13 | peft | huggingface | https://github.com/huggingface/peft | v0.21.3 (2026-11-13) | Apache-2.0 | Python | not installed | n/a | n/a | n/a | Stage B | PROTOTYPE at Phase 6 |
| 14 | LLaMA-Factory | hiyouga | https://github.com/hiyouga/LLaMA-Factory | v0.9.5 (2026-05-30) | Apache-2.0 | Python | not installed | n/a | n/a | n/a | Stage B | DEFER to training tier |
| 15 | DeepSpeed | deepspeedai | https://github.com/deepspeedai/DeepSpeed | v0.20.0 (2026-11-12) | Apache-2.0 | Python/C++ | not installed | n/a | n/a | n/a | Stage B | DEFER to training tier |
| 16 | inspect_ai | UKGovernmentBEIS | https://github.com/UKGovernmentBEIS/inspect_ai | v0.3.289 (2026-11-10) | MIT | Python | not installed | n/a | not run | pending | Stage B | ADOPT at Phase 2 (model evals) |
| 17 | nats-server | nats-io | https://github.com/nats-io/nats-server | v2.15.3 (2026-11-11) | Apache-2.0 | Go | not installed | n/a | n/a | pending | Stage B | ADOPT at Tier 1 (event backbone) |
| 18 | nats.py | nats-io | https://github.com/nats-io/nats.py | 2.16.0 (2026-09-16) | Apache-2.0 | Python | not installed | n/a | n/a | pending | Stage B | ADOPT with nats-server |
| 19 | temporal | temporalio | https://github.com/temporalio/temporal | v1.33.0 (2026-11-11) | MIT | Go | not installed | n/a | n/a | pending | Stage B | PROTOTYPE at Tier 2 |
| 20 | postgres | postgres | https://github.com/postgres/postgres | 18.7 (2026-11-12) | PostgreSQL Licence (BSD-style) | C | not installed (Tier 1) | n/a | n/a | pending | Stage B | ADOPT at Tier 1 |
| 21 | postgis | postgis | https://github.com/postgis/postgis | 3.7.0 (2026-10-26) | **GPLv2** (code only; data unencumbered) | C | not installed (Tier 1) | n/a | n/a | pending | Stage B | ADOPT at Tier 1 (spatial) |
| 22 | redis | redis | https://github.com/redis/redis | 8.10.3 (2026-10-26) | RSALv2/SSPLv1/**AGPLv3** (8.0+) | C | not installed | n/a | n/a | internal use → no obligation | Stage B | ADOPT optional Tier 1 (cache) |
| 23 | opentelemetry-python | open-telemetry | https://github.com/open-telemetry/opentelemetry-python | 1.45.2 (2026-10-29) | Apache-2.0 | Python | not installed | n/a | n/a | pending | Stage B | ADOPT at Tier 1 |
| 24 | prometheus | prometheus | https://github.com/prometheus/prometheus | 3.16.0 (2026-11-04) | Apache-2.0 | Go | not installed | n/a | n/a | pending | Stage B | ADOPT at Tier 1 |
| 25 | grafana | grafana | https://github.com/grafana/grafana | 13.3.1 (2026-11-11) | **AGPL-3.0** (unmodified internal use OK) | TS/Go | not installed | n/a | n/a | AGPL noted, unmodified use | Stage B | ADOPT at Tier 1 |
| 26 | blender | blender | https://github.com/blender/blender | 5.3.0 (2026-11-09) | **GPL** (tool; output assets unencumbered) | C/C++ + Python API | not installed | n/a | n/a | pending | Stage B | ADOPT at Phase 4 (asset factory, headless) |
| 27 | OpenUSD | PixarAnimationStudios | https://github.com/PixarAnimationStudios/OpenUSD | v26.11 (2026-10-21) | **TOST-1.0** (Apache-2.0-like) | C++ + Python | not installed | n/a | n/a | pending | Stage B | PROTOTYPE (interchange format) |
| 28 | cesium | CesiumGS | https://github.com/CesiumGS/cesium | 1.147 (2026-11-02) | Apache-2.0 | JS/TS | not installed | n/a | n/a | pending; avoid Cesium ion SaaS lock-in | Stage B | PROTOTYPE (web viewer) |
| 29 | osmnx | gboeing | https://github.com/gboeing/osmnx | 2.1.1 (2026-07-21) | MIT | Python | not installed | n/a | n/a | pending | Stage B | ADOPT at Phase 1 (OSM extracts → PostGIS) |
| 30 | UnrealEngine | EpicGames | https://github.com/EpicGames/UnrealEngine (private, EULA-gated) | 5.8 stable / 5.9 preview | **EULA — UNVERIFIED from this network** | C++ | not installed | n/a | n/a | EULA review BLOCKED (403) | Stage A | DEFER to rendering tier; verify EULA first |

## Commit hashes

None recorded — no clones have been made (see honest statement above). Hashes will be recorded in this manifest at the moment of each Stage C clone.

## Upstream provenance policy (spec §8)

- Never remove licence or attribution notices; every vendored or cloned tree keeps its `LICENSE` and `NOTICE`.
- No silent forks: any fork requires an ADR documenting why extension/adapter layers were insufficient.
- Copyleft inventory to watch: FLAME GPU 2 (AGPL-3.0), Redis 8+ (AGPLv3 option), Grafana (AGPL-3.0), GAMA (GPL-3.0), PostGIS (GPLv2), Blender (GPL). None of these may be linked into a distributed NEXUS binary or exposed as a modified network service without legal review. Internal use is safe for all of them.

## Next acquisition actions (Phase 1 gate)

1. `pip install mesa` (Stage C PoC: one-region tick loop with N residents on SQLite event log).
2. Clone `mesa` only if patching is required (expected: not required).
3. Defer everything GPU-bound until Tier 2 hardware exists (see `docs/SYSTEM_REQUIREMENTS.md`).
