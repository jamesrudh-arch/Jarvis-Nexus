# ADR-006: JARVIS NEXUS + NEXUS WORLD convergence and the zero-new-dependency decision

Status: ACCEPTED · Date: 2026-11-13 · Phase: 1

## Context

Two directives govern this repository: the NEXUS WORLD civilisation specification (v4) and the JARVIS NEXUS audit/dependency directive (v5, this run). The JARVIS NEXUS directive establishes an architecture (Python + FastAPI + SQLite + model-provider abstraction + central orchestrator + agent registration + WebSockets + Docker/Railway/PC/Kaggle/iPhone deployment targets) and demands: audit before change, minimum dependencies, no competing orchestrators, evidence-based integration only.

Phase 0 had already established that no prior JARVIS NEXUS codebase exists in this environment.

## Decision

1. **One repository, two subsystems.** JARVIS NEXUS (assistant platform) and NEXUS WORLD (civilisation) share a single tree, a single FastAPI backend, a single central orchestrator (`orchestration/command.py`), a single persistence core (`persistence/world_store.py`) and a single model router (`models/provider_registry.py`). The world simulation is a subsystem coordinated by the orchestrator — never a second orchestrator.
2. **Zero new dependencies in Phase 1.** All five directive candidates (RunAnywhere, Stagehand, CUT3R, Frigate, H2O LLM Studio) resolved to REJECT or DEFER on fetched evidence (audit Part C). Phase 1 was built entirely on Python stdlib + already-installed FastAPI/uvicorn/httpx/pydantic.
3. **Established architecture = target architecture.** Each component's ACTUAL status is tracked in the audit Part A table and updated per phase; "planned" is never conflated with "operational".
4. **Blocked deployment targets stay blocked, honestly.** Docker (no daemon in sandbox), Railway (no account/credentials), remote PC runtime (no machine), are recorded as blockers, not faked.

## Consequences

- Future agents (browser, voice, vision, residents) register capabilities with the single orchestrator; specialist services integrate behind the provider/tool contracts with isolation (proven by the event-bus fault-isolation test).
- Stagehand is the designated browser-automation upgrade path (trigger: semantic browsing requirement; direct Playwright is the baseline).
- Local inference, when hardware exists, enters through the model-provider abstraction via an OpenAI-compatible local runner (Ollama/llama.cpp — MIT), not a new framework.
- Any future dependency must pass the directive's 10-question decision sequence and land in the acquisition manifest with evidence.

## Alternatives rejected

- Parallel JARVIS NEXUS + NEXUS WORLD codebases: violates "no competing orchestrators" and duplicates persistence/auth/API.
- Integrating Stagehand/Frigate/H2O now: violates minimum-dependency principle (no requirement/hardware).
- Waiting for the "real" prior repository: nothing to wait on locally; convergence documented; if the Founder supplies the original repo later, its functionality maps onto these same subsystem boundaries.
