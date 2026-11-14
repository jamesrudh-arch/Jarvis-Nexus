# ADR-001: Three-tier hardware strategy

Status: ACCEPTED · Date: 2026-11-13 · Phase: 0

## Context
The spec (§34) forbids assuming hardware and demands measuring actual infrastructure. The audit found the current environment is a 2-core / 3.9 GB RAM / 8 GB disk / no-GPU sandbox, while the vision ultimately needs GPU rendering (UE5), local model serving (vLLM) and distributed simulation.

## Decision
Define three deployment tiers with identical architectural boundaries and swappable runtime bindings:
- Tier 0 (sandbox, current): Python + SQLite + FastAPI + Mesa + LangGraph + hosted LLM APIs + Inspect AI. No torch, no GPU-bound packages.
- Tier 1 (min viable production): + PostgreSQL/PostGIS, NATS JetStream, Redis optional, Prometheus/Grafana, Blender headless, CesiumJS, OSM extracts.
- Tier 2 (high-scale/GPU): + vLLM/SGLang, TRL/PEFT training stack, UE5 rendering host, Repast4Py/FLAME GPU 2, CARLA.

## Consequences
- Code written at Tier 0 must run unchanged at Tier 1 (repository and event-bus interfaces isolate SQLite→Postgres and in-process→NATS swaps).
- Disk discipline at Tier 0: each torch-dependent install costs ~2 GB of the 8 GB budget → prohibited until Tier 2.
- All GPU-bound research findings are DEFERRED, not rejected; re-evaluated when hardware exists.

## Alternatives rejected
- Building for the maximal environment first: violates spec §34 and produces untestable code on the only hardware we actually have.
- Waiting for better hardware: no evidence Tier 0 work would be wasted — the persistence pattern, event contracts, geography model and cognition budgets are tier-independent.
