# NEXUS WORLD — Research Evidence Ledger

Project: NEXUS WORLD — persistent autonomous simulated civilisation
Phase: 0 (Discovery and Audit)
Ledger created: 2026-11-13
Research method: three parallel research agents fetching primary sources (GitHub raw `LICENSE`/`README`, releases/commits Atom feeds, PyPI JSON API, official docs, licence texts). No claim below is marked VERIFIED unless the cited source was actually fetched on 2026-11-13.

## Evidence classification legend (spec §5)

| Class | Meaning |
|---|---|
| VERIFIED | Directly supported by fetched primary evidence (licence file, release feed, docs page) |
| TESTED | Independently reproduced by our own executed tests on this hardware |
| HYPOTHESIS | Plausible but not verified for our workload |
| PROPOSED | Architectural recommendation of NEXUS WORLD |
| UNKNOWN | Insufficient evidence — must be resolved before integration |

## Environment the evidence was gathered against (Tier 0 sandbox)

| Property | Measured value (see `reports/PHASE0_HARDWARE_AUDIT.txt`) |
|---|---|
| CPU | 2 × Intel Xeon (no AVX-512 flag observed in audit; check full audit file) |
| RAM | 3.9 GiB total, ~3.5 GiB available |
| Disk | 9.9 GiB total, ~8.0 GiB free |
| GPU | NONE (`nvidia-smi` absent, no `/dev/dri`) |
| OS | Debian 13 (trixie), kernel 5.10 |
| Python | 3.12.16 (`/home/z/.venv`) |
| Node | v24.22.2, npm 11.19.1 |
| Installed DBs/services | NONE (no postgres, neo4j, redis, nats, temporal, docker) |
| Python packages present | fastapi 0.128.0, redis-py 7.4.0, fakeredis (no django/langchain/torch/mesa) |

---

## 1. Simulation frameworks

### 1.1 Mesa (Python ABM) — Decision: **ADOPT (Tier 0)** — VERIFIED
| Field | Value |
|---|---|
| Repository | https://github.com/mesa/mesa (github.com/projectmesa/mesa 301-redirects here) |
| Official source | https://mesa.readthedocs.io |
| Licence | Apache-2.0 — VERIFIED from raw LICENSE |
| Maintenance | Very active: v3.5.2 released 2026-10-28; commits 2026-11-12; Mesa 4.0 in alpha |
| Capabilities | Modular ABM core: grids, schedulers, optional browser viz (Solara/matplotlib), network extra; base deps only numpy/pandas/scipy/tqdm |
| Limitations | Single-process only; no distribution; domain simulators (traffic, GIS) out of core (Mesa-geo is a separate project) |
| Dependencies | Python ≥3.12 (matches sandbox), numpy/pandas/scipy |
| Integration | Native Python, `pip install mesa` — direct fit for the civilisation core |
| Alternatives | AgentPy, NetLogo, Repast Simphony, Mesa-geo (GIS) |
| Evidence | Repo, LICENSE, releases.atom, PyPI JSON, docs — all fetched 2026-11-13 |
| Reason | Pure-Python, permissive licence, verified Python 3.12 support, negligible footprint on 2-core sandbox. The authoritative sim core runs as a library inside our process; distribution is our own concern (see Repast4Py). |

### 1.2 FLAME GPU 2 — Decision: **DEFER (Tier 2, GPU only)** — VERIFIED
| Field | Value |
|---|---|
| Repository | https://github.com/FLAMEGPU/FLAMEGPU2 |
| Docs | https://docs.flamegpu.com |
| Licence | **AGPL-3.0** — VERIFIED from LICENSE.md. Strong copyleft: if we expose it as a network service we must release our modifications. |
| Maintenance | Active: v2.0.0-rc.5 (2026-10-14); still release-candidate quality |
| Capabilities | GPU-accelerated massive agent simulation; C++/CUDA + pyflamegpu bindings; multi-GPU via MPI |
| Limitations | NVIDIA CUDA GPU mandatory, **no CPU fallback**; AMD support partial; pyflamegpu not on PyPI; RC status |
| Dependencies | CUDA 12.0/12.4/13.0 toolchain, CMake |
| Integration | pyflamegpu wheel (cp312 available) — future Tier 2 |
| Alternatives | Repast4Py (CPU/MPI), Mesa |
| Reason | No GPU exists in Tier 0/1; AGPL obligations must be assessed before any service exposure. Revisit when GPU hardware exists. |

### 1.3 Repast HPC — Decision: **REJECT** — VERIFIED
- Repo: https://github.com/Repast/repast.hpc · Licence BSD-3-Clause (VERIFIED) · **Last commit 2022-10-28, last release 2021** — dormant for ~4 years. C++ only, no Python API, cluster-oriented (Boost/netCDF/MPI source build). Rejected for dormancy and poor fit.

### 1.4 Repast4Py — Decision: **PROTOTYPE (Tier 1)** — VERIFIED
| Field | Value |
|---|---|
| Repository | https://github.com/Repast/repast4py |
| Docs | https://repast.github.io/repast4py.site/ |
| Licence | BSD-3-Clause — VERIFIED |
| Maintenance | Active: v1.3.1 (2026-10-22); requires Python 3.10–3.14 |
| Capabilities | Distributed ABM in Python over MPI ranks; NumPy/Numba-based |
| Limitations | sdist-only on PyPI (compiles C/C++ on install, needs system MPI); runtime pulls torch; scale bounded by core count |
| Integration | `mpirun -np N python model.py`; 2 ranks possible in sandbox but pointless vs Mesa single-process |
| Reason | Prototype on Tier 1 (multi-core) to validate the region-ownership design (spec §31) before committing. |

### 1.5 GAMA — Decision: **PROTOTYPE (optional)** — VERIFIED
- Repo: https://github.com/gama-platform/gama · Licence **GPL-3.0** (VERIFIED) · Active (stable 2025.06.4; alphas 2026-11) · Java/GAML, headless mode, needs ~540 MB disk + 2 GB RAM. Poor language fit for our Python-centric stack; keep as fallback for GIS-heavy ABM if Mesa-geo proves insufficient.

### 1.6 SUMO (traffic) — Decision: **ADOPT (Tier 1)** — VERIFIED
| Field | Value |
|---|---|
| Repository | https://github.com/eclipse-sumo/sumo |
| Docs | https://sumo.dlr.de/docs/ |
| Licence | EPL-2.0 — VERIFIED from LICENSE |
| Maintenance | Very active: v1_28_0 (2026-10-07), commits same-day as audit |
| Capabilities | Microscopic multi-modal road traffic simulation; TraCI/libsumo Python control; pip-installable wheel (~86–141 MB) |
| Limitations | Traffic domain only; C++ core, Python is control plane |
| Hardware | CPU-only — fits sandbox, but not needed until Phase 4 (transport) |
| Reason | First-class Python interface and permissive licence; adopt at Phase 4, not Phase 1. |

### 1.7 CARLA (vehicles) — Decision: **DEFER (Tier 2)** — VERIFIED
- Repo: https://github.com/carla-simulator/carla · Licence MIT (VERIFIED) · Server requires dedicated GPU ≥8 GB VRAM (RTX 2070+ recommended) and ~20 GB disk — impossible in Tier 0. Python client (`pip install carla`) is usable later against a GPU host.

---

## 2. AI / cognition / training stack

### 2.1 LangGraph — Decision: **ADOPT (Tier 0)** — VERIFIED
| Field | Value |
|---|---|
| Repository | https://github.com/langchain-ai/langgraph (`libs/langgraph`) |
| Docs | https://docs.langchain.com/oss/python/langgraph/overview |
| Licence | MIT — VERIFIED |
| Maintenance | Very active: v1.2.21 (2026-11-12), commits daily |
| Capabilities | Stateful agent orchestration graphs, durable execution, checkpointing (SQLite `SqliteSaver` / Postgres), interrupts, streaming; usable standalone without full LangChain |
| Limitations | Low-level by design; ecosystem nudges to commercial LangSmith/Platform (not required) |
| Hardware | Pure Python, ~1 MB wheel, no GPU |
| Integration | `pip install langgraph`; call hosted OpenAI-compatible LLM endpoints inside nodes |
| Reason | Orchestrates resident cognition + JARVIS + Founder command flows with SQLite persistence that fits Tier 0 disk. |

### 2.2 Graphiti (GetZep) — Decision: **PROTOTYPE (Tier 1)** — VERIFIED
- Repo: https://github.com/getzep/graphiti · Licence Apache-2.0 (VERIFIED) · v0.31.2 (2026-10-20), active.
- Temporal knowledge-graph memory (bi-temporal facts, episodes, provenance; hybrid retrieval). LLM/embedder pluggable via OpenAI-compatible endpoints (fits our hosted-API plan).
- **Limitation:** needs a graph DB. Neo4j (JVM) too heavy for 3.9 GB RAM. Embedded option `graphiti-core[falkordblite]` exists (Python 3.12+) but its RAM footprint is UNKNOWN → requires a memory-footprint spike before adoption (HYPOTHESIS).
- Peer-reviewed architecture paper: arXiv:2501.13956.

### 2.3 vLLM — Decision: **DEFER (Tier 2)** — VERIFIED
- Repo: https://github.com/vllm-project/vllm · Apache-2.0 (VERIFIED) · v0.33.0 (2026-11-01), extremely active.
- High-throughput serving (PagedAttention, continuous batching, quantisation, OpenAI-compatible server). GPU required for main path (NVIDIA cc 7.5+); CPU wheel `vllm-cpu` exists but 2 cores/3.9 GB cannot hold any meaningful model weights + KV cache (HYPOTHESIS, not worth testing at Tier 0). Main PyPI wheel 717 MB + multi-GB torch — would exhaust Tier 0 disk.

### 2.4 SGLang — Decision: **DEFER (Tier 2)** — VERIFIED
- Repo: https://github.com/sgl-project/sglang · Apache-2.0 (VERIFIED) · v0.5.23 (2026-11-02), active. GPU-centric (CUDA 13 driver); CPU path only for Xeon-AMX server-class CPUs. Not viable in Tier 0/1.

### 2.5 Hugging Face TRL — Decision: **DEFER (Tier 2)** — VERIFIED
- Repo: https://github.com/huggingface/trl · Apache-2.0 (VERIFIED) · v1.17.1 (2026-10-30). SFT/DPO/GRPO/KTO trainers, PEFT + DeepSpeed integration. No hard GPU gate in the library, but real training on 2 cores is impractical; torch install costs ~2 GB of 8 GB disk. Used from Tier 2 only.

### 2.6 PEFT — Decision: **PROTOTYPE (Tier 2 only)** — VERIFIED
- Repo: https://github.com/huggingface/peft · Apache-2.0 (VERIFIED) · v0.21.3 (2026-11-13). LoRA/QLoRA/IA³, tiny adapter checkpoints. CPU-runnable in principle but torch disk cost forbids Tier 0 install; adopt when GPU tier exists. QLoRA 7B needs ~16 GB VRAM per upstream docs.

### 2.7 LLaMA-Factory — Decision: **DEFER (Tier 2)** — VERIFIED
- Repo: https://github.com/hiyouga/LLaMA-Factory · Apache-2.0 (VERIFIED) · v0.9.5 (2026-05-30; commits active but releases lag). Unified fine-tuning with Web UI; every documented training path needs GPU (7B QLoRA ≈ 6–10 GB VRAM). No useful Tier 0 role.

### 2.8 DeepSpeed — Decision: **DEFER (Tier 2)** — VERIFIED
- Repo: https://github.com/deepspeedai/DeepSpeed · Apache-2.0 (VERIFIED) · v0.20.0 (2026-11-12). ZeRO/3D-parallelism for multi-GPU/multi-node — irrelevant at 2 cores; would waste ~2 GB disk on torch for zero capability.

### 2.9 Inspect AI — Decision: **ADOPT (Tier 0)** — VERIFIED
| Field | Value |
|---|---|
| Repository | https://github.com/UKGovernmentBEIS/inspect_ai |
| Docs | https://inspect.aisi.org.uk |
| Licence | MIT — VERIFIED ("UK AI Security Institute") |
| Maintenance | Very active: v0.3.289 (2026-11-10), releases every few days |
| Capabilities | Eval framework (task/solver/scorer), agentic + multi-turn solvers, 200+ prebuilt evals (`inspect_evals`), any OpenAI-compatible endpoint via `OPENAI_BASE_URL`, native vLLM/SGLang providers for the future GPU tier |
| Limitations | Evaluation-only (not a runtime); needs API credentials; 43 MB wheel + sizeable dep tree (fits Tier 0) |
| Reason | Implements the mandatory "benchmark suite before training" (spec §21) against our hosted-API cognition models, today, with zero GPU. |

### 2.10 Hosted LLM APIs (cognition, Tier 0) — PROPOSED
- OpenAI-compatible endpoints for resident cognition at LOD-0 decision points and JARVIS assistant mode. API access ≠ weight access: no training of hosted models is claimed or possible (spec §20 distinction honoured). Specific provider selection deferred to Phase 2 benchmark via Inspect AI.

---

## 3. Persistence, events, infrastructure

### 3.1 SQLite (stdlib) — Decision: **ADOPT (Tier 0 persistence core)** — **TESTED**
- Not an external repository: Python 3.12 stdlib, public domain. Our Phase 0 smoke test (`tests/phase0_smoke_test.py`, output in `reports/PHASE0_TEST_OUTPUT.txt`) **executed and passed 11/11 checks** on this hardware: state survives restart, duplicate events rejected idempotently, closed-system ledger sums to zero, full state reconstructible by event replay, deterministic state hash. This is the only TESTED entry in this ledger and forms the Tier 0 persistence contract.

### 3.2 PostgreSQL 18 + PostGIS — Decision: **ADOPT (Tier 1 system of record)** — VERIFIED
- Repo: https://github.com/postgres/postgres + https://github.com/postgis/postgis · PostgreSQL Licence (BSD-style, VERIFIED); PostGIS **GPLv2** (VERIFIED — applies to PostGIS code, not to our data). PG 18.7 announced 2026-11-12; PostGIS 3.7.0 (2026-10-26); Debian 13 ships PG 17.11 + PostGIS 3.5.2.
- Spatial queries, JSONB, replication. Tier 0 cannot run it (not installed, no service manager) → SQLite at Tier 0 with a migration path; Postgres from Tier 1 up.

### 3.3 NATS + JetStream — Decision: **ADOPT (Tier 1 event backbone)** — VERIFIED
- Repo: https://github.com/nats-io/nats-server · Apache-2.0 (VERIFIED) · v2.15.3 (2026-11-11), CNCF graduated.
- JetStream gives durable, replayable, at-least-once streams — the event backbone for spec §30/§31. Runs on "a Raspberry Pi" per README. Python client `nats-py` 2.16.0 (MIT).
- Caveat: at-least-once delivery requires our idempotent apply layer — exactly the pattern TESTED in §3.1.

### 3.4 Temporal — Decision: **PROTOTYPE (Tier 2)** — VERIFIED
- Repo: https://github.com/temporalio/temporal · MIT (VERIFIED) · v1.33.0 (2026-11-11). Durable workflow execution; server+DB operational surface too heavy alongside NATS+Postgres on Tier 0/1; SQLite persistence is dev-only. Prototype with `temporal server start-dev` when multi-service workflows justify it.

### 3.5 Redis — Decision: **ADOPT optional (Tier 1)** — VERIFIED
- Repo: https://github.com/redis/redis · Licence changed: ≤7.2 BSD-3 → 7.4 RSALv2/SSPLv1 → **8.0+ adds AGPLv3** (VERIFIED from blog + repo). Internal use imposes no obligation on our code; Debian 13 ships 8.0.2. Cache/rate-limiter only — durability stays with JetStream+Postgres/SQLite.

### 3.6 OpenTelemetry + Prometheus + Grafana — Decision: **ADOPT (Tier 1)** — VERIFIED
- OTel Python SDK 1.45.2 (Apache-2.0); Prometheus 3.16.0 (2026-11-04, Apache-2.0) with native OTLP ingestion; Grafana 13.3.1 (2026-11-11, **AGPL-3.0** — fine for unmodified internal use). Disk formula verified: 1–2 bytes/sample; retention must be capped on 8 GB disk.

---

## 4. Geography, assets, visual

### 4.1 OpenStreetMap — Decision: **ADOPT with licence obligations (Tier 1)** — VERIFIED
- Data under **ODbL 1.0** (VERIFIED, full text + OSMF summary fetched). Key obligations: attribution ("© OpenStreetMap contributors") on public use; **share-alike** — a Derivative Database (§4.4) that publicly uses OSM-derived contents must itself be offered under ODbL.
- NEXUS consequence (PROPOSED): keep imported OSM data in a **separate, swappable database**, referenced — not merged — by the world store, so the fictional world DB is not a Derivative Database. Planet file ≈ 89 GiB — impossible on 8 GB disk; use Geofabrik city-scale extracts (tens–hundreds of MB) via `osmnx` 2.1.1.

### 4.2 Blender — Decision: **ADOPT (asset factory, Tier 1+)** — VERIFIED
- Repo: https://github.com/blender/blender · **GPL** (VERIFIED: "Blender uses the GNU General Public License... not available under other licenses"). Headless verified from official manual: `--background --python script.py`. Internal use to generate assets imposes nothing on the output assets. v5.3.0 (2026-11-09); `bpy` PyPI wheel available.

### 4.3 OpenUSD — Decision: **PROTOTYPE (scene interchange format)** — VERIFIED
- Repo: https://github.com/PixarAnimationStudios/OpenUSD · Licence **TOST-1.0** (VERIFIED — Apache-2.0-equivalent except trademark section; switch from Apache-2.0 happened 2024-06-04). v26.11 (2026-10-21); `usd-core` PyPI wheel is CPU-only. Canonical interchange between Blender and the future UE5 tier. Not a runtime dependency.

### 4.4 CesiumJS — Decision: **PROTOTYPE (web globe, Tier 1)** — VERIFIED
- Repo: https://github.com/CesiumGS/cesium · Apache-2.0 (VERIFIED) · v1.147 (2026-11-02). Browser-side WebGL rendering (client GPU, not sandbox GPU). **Cesium ion SaaS is commercial**: free tier is personal/non-commercial only and ion-derived content cannot be displayed after subscription ends (ToS VERIFIED) → self-host tiles, avoid ion dependency.

### 4.5 Unreal Engine 5 — Decision: **DEFER (Tier 2/3 rendering)** — PARTIALLY VERIFIED
- Official docs reachable: hardware requirements verified (Linux dev: Ubuntu 22.04, 32 GB RAM, GeForce 2080-class, Vulkan; Windows: 32 GB RAM, 8 GB VRAM). Headless dedicated servers officially supported without rendering.
- **EULA text UNVERIFIED** — unrealengine.com blocked (Cloudflare 403) from this network; royalty terms (secondary source: 5% over US$1M revenue, Wikipedia) must be re-verified from an unrestricted network before any production commitment.
- Rendering cannot run in Tier 0/1 sandbox (no GPU). Sim continues independently of UE (spec §10 honoured by design).

### 4.6 QGIS / Overture Maps — noted as alternatives; Overture permissive layers may replace some OSM uses later (research deferred — UNKNOWN, Phase 1+).

---

## 5. Security and access control (Phase 0 state)

- PROPOSED: role model (Sovereign Founder / JARVIS resident+assistant modes / public observer), audit log as event stream, permission checks in the Command Orchestrator (spec §35–36).
- No external security library research completed yet — **UNKNOWN, scheduled for Phase 1** with the API contract design. Not a blocker: Tier 0 has no network-exposed surface.

---

## 6. Claims register (spec §5 compliance)

| # | Claim | Class |
|---|---|---|
| C1 | SQLite event-sourced persistence with idempotent apply works on Tier 0 hardware | **TESTED** (11/11 checks, `reports/PHASE0_TEST_OUTPUT.txt`) |
| C2 | Mesa/LangGraph/Inspect AI are licence-clean and Python-3.12-compatible | VERIFIED (licence files + PyPI metadata fetched) |
| C3 | All GPU-bound tech (vLLM, SGLang, FLAME GPU 2, CARLA, UE5 rendering, TRL/DeepSpeed/LLaMA-Factory training) is unusable at Tier 0 | VERIFIED (hardware requirements from official docs) |
| C4 | Graphiti embedded FalkorDB fits 3.9 GB RAM | HYPOTHESIS — spike required |
| C5 | OSM-in-separate-DB avoids ODbL share-alike on the world DB | PROPOSED (legal interpretation of ODbL §4.4; not legal advice) |
| C6 | UE5 EULA terms permit our intended simulation use | UNKNOWN — EULA page blocked from this network |
| C7 | The "existing JARVIS NEXUS repository" referenced by the directive exists on this machine | **REFUTED by audit** — no codebase present (see audit report §1) |

## 7. Deferred research areas (honest scope statement)

Not yet researched in Phase 0 (scheduled by phase): ecosystem/wildlife ABM libraries, weather/climate models, procedural terrain generation, physics engines, voice (ASR/TTS), motion capture, digital-twin platforms, distributed consensus beyond NATS, fine-tuning datasets, GPU cloud pricing. The Phase 0 budget was spent on the candidate matrix of spec §29 because those gate the Phase 1 architecture.
