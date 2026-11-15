# BACKUP VERIFICATION — phase 4 logical backups (state of record)

> **REGENERATED 2026-11-15 (Stage 2.2, Workstream B).** The original Phase 4
> backup-verification report was lost with the wiped gitignored `download/`
> tree (Stage 2.1 finding BLK-07a). Reconstruction from committed code and
> fresh execution; NOT the original document.

## Original scope (from surviving committed evidence)

Phase 4 (commit `e22f7d9`, "phase4: scheduled logical backups with retention,
honest status view and RPO/RTO") shipped — all verifiable in committed code:

- `BackupService.exportLogicalBackup` — read-only export of all 24 NEXUS
  tables into `nexus-logical-backup` v1 JSON with per-table SHA-256.
- `BackupService.verifyLogicalBackup` — REAL isolated in-memory restore
  (migrate → reinsert → row-count compare) before any backup is called
  recoverable.
- In-process scheduler (`NEXUS_BACKUP_INTERVAL_HOURS`, default 24; `0` off;
  first run 30 s post-boot) with retention pruning (default 14 files).
- Owner-gated surface: `POST /railway/backup/export`, `GET /railway/backups`.

## Re-verified now (2026-11-15, this session — machine-generated evidence)

- A fresh export + product verify through the real application path was
  executed this session for this regeneration; recorded in
  `docs/stage2/evidence/backup-export-verify.json`.
- Stage 2.1's isolated restoration demonstration (22/22 PASS, content
  SHA-256 match on all 24 tables, functional resurrection) was executed
  through the real code path; its method survives in the committed script
  `scripts/stage21_isolated_restore_demo.ts` (re-runnable; the Stage 2.1
  output artifacts themselves were lost with `download/` — N-2.2-01).

## Known architecture gaps (carried; dispositioned in Stage 2.2 Workstream C)

G-01 no productized restore path; G-02 verify is count-only (content hashes
not rechecked); G-03 backups share the volume with the DB (no off-site
export); G-04 single-instance scheduler; G-05 volume-level restore never
exercised. **Stage 2.2 Workstream C repairs G-01/G-02 and implements the
minimal G-03 remediation** — see `docs/stage2.2/BACKUP_ARCHITECTURE.md` and
`docs/stage2.2/DISASTER_RECOVERY_REPORT.md` (authoritative).

## Unrecoverable (explicit classification)

Original report bytes; the original phase-4 verification transcripts; the
Stage 2.1 demo backup JSON (lost with `download/`, N-2.2-01 — the method and
script survive and were re-executed in Stage 2.2 Workstream C's drill).

## Provenance

Regeneration inputs: commit `e22f7d9` (code, committed), committed test
`tests/integration/phase4-backups.test.ts`, fresh execution this session.
Authored document; numeric claims machine-generated.
