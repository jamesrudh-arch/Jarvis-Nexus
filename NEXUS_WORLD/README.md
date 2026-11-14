# NEXUS WORLD

Persistent autonomous simulated civilisation — engineering repository.

- **Specifications:** NEXUS WORLD Master Specification v4 + JARVIS NEXUS audit/dependency directive v5 (Sovereign Founder, 2026). The two are converged into ONE repository/platform (ADR-006): one FastAPI backend, one central orchestrator, one persistence core.
- **Phase:** 1B (System-Wide Integration Directive) — COMPLETE, 39/39 integration acceptance checks + 48/48 Phase 1 + 11/11 Phase 0 regressions, all on the security-patched stack. 13 technologies OPERATIONAL with real-operation evidence; 77-entry live integration register. Phase 2 (Living resident vertical slice) is next.
- **Start here:**
  1. `reports/INTEGRATION_DIRECTIVE_REPORT.md` — Phase 1B mandatory report (real integrations, evidence, blockers).
  2. `integration/INTEGRATION_REGISTER.md` — the live register (15 fields × 77 technologies; OPERATIONAL only with evidence).
  3. `reports/PHASE1_REPORT.md` — Phase 1 mandatory report (what was built and tested).
  4. `reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md` — audit deliverables A–G (inventory, gap analysis, repository evaluation matrix, dependency decision: zero new dependencies, verification report).
  5. `reports/PHASE0_TECHNICAL_AUDIT.md` — Phase 0 audit.
  6. `docs/MASTER_ARCHITECTURE.md` — validated architecture, three-tier hardware strategy, diagrams.
  7. `research/RESEARCH_EVIDENCE_LEDGER.md` + `research/TECHNOLOGY_DISCOVERY_SWEEP.md` — every technology decision with evidence.
  8. `docs/KNOWN_LIMITATIONS.md` — what does NOT work and why (read before trusting anything).

## Directory map (spec §44)

| Path | Purpose | Status |
|---|---|---|
| `research/` | evidence ledger | Phase 0 deliverable |
| `repositories/` | acquisition manifest | Phase 0 deliverable |
| `docs/`, `docs/DECISIONS/` | architecture, requirements, limitations, ADRs | Phase 0 deliverable |
| `reports/` | phase reports, audit outputs, test output | Phase 0 deliverable |
| `scripts/` | hardware audit + future tooling | Phase 0 deliverable |
| `tests/` | acceptance suites | Phase 0: 11/11 · Phase 1: 48/48 · Phase 2: 27/27 · 3D: 17/17 · Integration: 47/47 — all PASS (Continuation, 2026-11-13) |
| `integration/` | MCP layer + 2 MCP servers (filesystem + blender), browser/vision/voice services, live register | Phase 1B + Continuation (18 OPERATIONAL, 82 entries) |
| `residents/` | living population: needs, schedules, movement, memory, meetings, LLM-optional cognition | Phase 2 OPERATIONAL (27/27) |
| `render3d/`, `mcp_servers/` | 3D world generation on Blender 5.3 (bpy sidecar venv), Cycles renders, USD/glTF/FBX exports, inspection + auto-correction, headless Blender MCP server | Continuation OPERATIONAL (17/17) |
| `contracts/`, `simulation/`, `residents/`, `cognition/`, `memory/`, `social/`, `economy/`, `ecology/`, `geography/`, `infrastructure/`, `transport/`, `models/`, `training/`, `inference/`, `orchestration/`, `jarvis/`, `unreal/`, `assets/`, `persistence/`, `security/`, `observability/`, `benchmarks/`, `deployment/` | phase implementation areas | scaffolding, Phases 1–10 |

## Reproduce the evidence

```bash
python3 tests/integration_acceptance.py   # Phase 1B: 39/39 (real MCP/browser/vision/voice operations)
python3 tests/phase1_acceptance.py       # Phase 1: 48/48 acceptance checks
python3 tests/phase0_smoke_test.py       # Phase 0 regression: 11/11
bash scripts/hardware_audit.sh           # environment audit
python3 scripts/run_world.py --fresh --ticks 288   # CLI world demo
NEXUS_DB=/tmp/w.db PORT=8791 python3 scripts/serve_world.py   # live API server (now incl. /metrics, /integrations)
python3 -m integration.mcp_server_expose --db /tmp/w.db --token <secret>   # JARVIS as an MCP server (stdio)
python3 scripts/gen_register.py          # regenerate the integration register
```

## Security posture (Phase 1B)

bandit SAST + pip-audit CVE scan are part of the evidence loop: this phase
FOUND 5 known CVEs in starlette 0.50.0, remediated them (fastapi 0.162.6 /
starlette 1.10.0), and re-ran every suite on the patched stack — the full
found→fixed→verified record is `reports/SECURITY_SCAN_OUTPUT.txt`.

## Engineering rules (binding)

No false completion claims. A repository is not integrated because it was downloaded; a feature does not work because a script was generated; every claim carries evidence or an explicit UNKNOWN. All results labelled SIMULATED are simulated.
