# ADR-002: Event-sourced world state with idempotent apply (SQLite at Tier 0)

Status: ACCEPTED · Date: 2026-11-13 · Phase: 0

## Context
Spec §30 requires: state survives restarts, events replayable, at-least-once delivery must not double-apply transactions, entity identity preserved across recovery. Spec §40 makes these acceptance tests. The Tier 0 sandbox has no message broker or external database installed.

## Decision
World state is event-sourced: every state change is an event row with a client-supplied `idempotency_key` (event_id, PRIMARY KEY), a total-order sequence number, tick, type and JSON payload. State tables (residents, balances, geography) are materialised by an idempotent apply layer. Financial operations use double-entry balance rows; the closed-system invariant (sum of all balances = 0) is asserted in tests.

Tier 0 store: SQLite in WAL mode (stdlib, zero service dependencies). Tier 1: same schema behind a repository interface on PostgreSQL; event bus moves from the SQLite table to NATS JetStream with the same idempotent apply.

## Evidence
TESTED — `tests/phase0_smoke_test.py` executed 2026-11-13 on the audit hardware: 11/11 checks passed in 6.6 ms (restart persistence, duplicate-payment rejection, ledger zero-sum, replay reconstruction, deterministic state hash). Output: `reports/PHASE0_TEST_OUTPUT.txt`.

## Consequences
- Replay is the crash-recovery and migration mechanism; projections can be rebuilt at any time.
- Schema evolution needs event versioning discipline (spec §30) — version field is in the schema from day one.
- SQLite single-writer is acceptable at Tier 0 (one simulation process); NATS+Postgres remove the constraint at Tier 1.
