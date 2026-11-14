# NEXUS WORLD — System Requirements (hardware-aware, spec §34)

Version 0.1.0 · 2026-11-13. Based on measured Tier 0 audit (`reports/PHASE0_HARDWARE_AUDIT.txt`) and verified technology requirements (research ledger).

## Configuration 1 — Minimum viable development environment (Tier 0, MEASURED, CURRENT)

| Property | Requirement | Current sandbox |
|---|---|---|
| CPU | 2+ cores x86-64 | 2 × Xeon — OK |
| RAM | 4 GB (3 GB usable for sim) | 3.9 GB — OK (tight) |
| Disk | 8 GB free | 8.0 GB — OK, budgeted |
| GPU | Not required | None — OK |
| OS | Linux, Python 3.12, Node 24 | Debian 13 — OK |
| Software | Python stdlib (SQLite), FastAPI, Mesa, LangGraph, Inspect AI; hosted LLM API access (OpenAI-compatible endpoint + credentials) | stdlib present; Mesa/LangGraph/Inspect to install at Phase 1/2; **hosted LLM credentials required from Founder** |
| Prohibited | torch or CUDA-dependent packages (disk), background daemons (ephemeral sandbox) | Enforced |

Runs: authoritative simulation core, event store, tests, API server on demand. Does NOT run: 24/7 daemon (L-03), GPU workloads, UE5, large datasets.

## Configuration 2 — Recommended production environment (Tier 1)

| Property | Requirement | Purpose |
|---|---|---|
| CPU | 8+ cores | Postgres + NATS + sim + workers |
| RAM | 32 GB | Postgres/PostGIS + NATS JetStream + Redis + Prometheus/Grafana + Blender headless |
| Disk | 500 GB SSD | event history growth, OSM extracts, tiles, Prometheus TSDB |
| GPU | Not required | — |
| OS | Debian 12/13 or Ubuntu 22.04 LTS | native packages verified in ledger |
| Services | PostgreSQL 17/18 + PostGIS 3.5+, NATS Server 2.15+ (JetStream, file storage), Prometheus 3.x, Grafana, optional Redis 8 | all ADOPT-grade in ledger |
| Network | static address or domain; TLS | Founder remote access, web observation via CesiumJS |
| Power | UPS or cloud restart policy | world continuity across restarts is designed-in, but power stability reduces replay load |

## Configuration 3 — High-scale expansion environment (Tier 2)

| Property | Requirement | Purpose |
|---|---|---|
| CPU/RAM | 32+ cores, 64–128 GB (or 2–3 nodes) | multi-region distributed simulation, Repast4Py MPI ranks |
| GPU | ≥1 × 24 GB VRAM (e.g. RTX 4090/A6000 class); 8×GPU node optional | vLLM/SGLang local serving (7B–70B), TRL/PEFT fine-tuning, QLoRA (7B ≈ 16 GB VRAM per upstream docs) |
| Disk | 2+ TB NVMe | model weights, checkpoints, datasets, UE5 projects (~20 GB CARLA, UE5 much larger) |
| Rendering host | separate workstation: 32 GB RAM, 8 GB+ VRAM GPU, Ubuntu 22.04/Windows 11 | Unreal Engine 5.8+ rendering client + editor (VERIFIED requirements); Blender asset factory may live here |
| Software | Docker/Podman orchestration, Kubernetes optional at multi-node | service isolation, scaling |
| Licensing gate | UE5 EULA verification (L-04); AGPL review for FLAME GPU 2 if service-exposed | before adoption |

## Resource budget rules (all tiers)

1. Tier 0 disk budget: ≤1 GB for Python packages (excluding torch entirely), ≤1 GB scratch, remainder for repos, events and reports.
2. Every external service adopted at Tier 1+ must appear in the acquisition manifest with an owner, interface contract and test (spec §9).
3. LLM API spend is capped per resident-day by the cognition budget contract (ADR-003); token counts are logged per call.
