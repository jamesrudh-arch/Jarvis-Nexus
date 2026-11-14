# ADR-003: Mesa as the Tier-0/1 civilisation simulation core; LLM cognition only at bounded decision points

Status: ACCEPTED (Mesa adoption); PROPOSED (cognition budgets, final at Phase 2) · Date: 2026-11-13

## Context
Spec §13 mandates hierarchical intelligence — "Do not run an expensive LLM call for every resident every simulation tick" — and requires an ABM foundation. Ledger §1–2 evidence: Mesa is Apache-2.0, pure Python, Python 3.12 support verified, v3.5.2 actively maintained, no GPU. LangGraph (MIT, v1.2.21) orchestrates stateful agent graphs with SQLite checkpointing. GPU simulators (FLAME GPU 2) and local inference (vLLM/SGLang) are unusable at Tier 0 (VERIFIED hardware requirements).

## Decision
1. Mesa provides the simulation substrate (scheduler, grids/networks, agent base classes) inside our own `simulation/` package; NEXUS owns the tick loop, world clock and LOD policy.
2. Cognition follows the hierarchy: deterministic rules → utility scoring → behaviour trees/FSM → memory retrieval → hosted-LLM reasoning only for difficult decisions at LOD-0, under per-resident-per-day budgets (≤1 LLM call default), token/time caps, and mandatory utility-fallback on failure.
3. Inspect AI benchmarks candidate hosted models before any model is trusted for resident decisions (spec §21: benchmark suite before training/selection).

## Consequences
- Simulation cost is dominated by cheap deterministic logic; LLM spend is bounded and measurable per resident.
- Tier 2 can swap the hosted API for local vLLM serving behind the same router interface.
- Residents' decision quality is measured by goal-achievement metrics, not fluency (spec §14).

## Alternatives rejected
- Repast HPC: dormant since 2022 (REJECT). GAMA: GPL/Java/GAML poor fit (fallback only). FLAME GPU 2: GPU+AGPL, deferred. Custom scheduler from scratch: unnecessary duplication of maintained functionality (spec §9.1).
