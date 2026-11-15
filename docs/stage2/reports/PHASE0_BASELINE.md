# PHASE 0 BASELINE — route parity & engineering baseline

> **REGENERATED 2026-11-15 (Stage 2.2, Workstream B).** The original Phase 0
> baseline report was written to gitignored `download/stage2/reports/` during
> the Stage 2 session and was wiped (Stage 2.1 finding BLK-07a — permanent
> loss; see `docs/stage2.1/`). This document is a reconstruction from
> **committed, reproducible sources only**. It is NOT the original document
> and does not claim its original timestamps.

## Original scope (from surviving committed evidence)

Phase 0 of Stage 2 established the engineering baseline against production
(`origin/main` @ `41092a3`, 33 routes: 20 GET + 13 POST) using the committed
generators `scripts/stage2_phase0_baseline.py` and
`scripts/stage2_phase0_route_parity.py`. The original numeric output is
unrecoverable; the committed generators survive and were re-executed for this
regeneration (see `docs/stage2/evidence/route-parity.json`, generated this
session by `scripts/stage21_route_parity.py` — the Stage 2.1-audited successor
of the phase-0 parity script).

## Re-verified now (2026-11-15, this session, repo @ HEAD before Stage 2.2 commits)

- Route inventory at `apps/nexus-api/src/index.ts`: **56 registered routes
  (32 GET + 24 POST)** — count performed by source scan and cross-checked by
  the committed parity script.
- Route delta vs production (`origin/main` @ `41092a3`, 33 routes):
  **+23 additive, 0 removed, 0 duplicate registrations** (two independent
  methods: script + manual hand-count).
- Known register accuracy defect carried from Stage 2.1 (BLK-09): the
  committed Stage 2 register records `missingRoutes: 21`; the actual delta is
  23. Recorded, not silently corrected in history; the Stage 2.2 register
  supersedes it.
- Test baseline re-measured this session before remediation:
  **188 pass / 12 skip / 3 fail / 776 assertions / 26 files** — reproducing
  the Stage 2.1 measured baseline exactly; the 3 failures are the V4
  evidence-provenance gate this workstream repairs.

## Unrecoverable (explicit classification)

- The original Phase 0 report bytes and its original measurement timestamps.
- The original `download/stage2/evidence/` artifact set (≥6 files) whose
  existence the V4 gate asserts.

## Provenance

Regeneration inputs: `git show` of phase-0 commits, `registry/requirements.json`
(112 requirements, committed), `scripts/stage2_phase0_*.py` (committed),
fresh parity run this session. Generator: this document is authored (not
machine-generated); its numeric claims are machine-generated in
`docs/stage2/evidence/route-parity.json`.
