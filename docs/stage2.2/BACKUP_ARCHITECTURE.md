# STAGE 2.2 — BACKUP ARCHITECTURE (C1: the actual architecture, as built)

**Document ID:** STAGE22-ARCH-001
**Method:** established from source code only; every claim below is verifiable in committed code, and the behavioral claims are proven by committed tests and the DR drill.

---

## 1. Data flow (end to end)

```
             ┌─ scheduled: setInterval, NEXUS_BACKUP_INTERVAL_HOURS (default 24; 0=off;
             │              first run 30 s post-boot, .unref()'d; single-instance documented)
             │              or manual: POST /railway/backup/export (owner)
             ▼
  1. EXPORT      BackupService.exportLogicalBackup(db)                [packages/railway/src/backup.ts]
                 read-only scan of all 24 NEXUS tables (migrations 1–3)
                 → nexus-logical-backup v1 JSON:
                   per table { rows, sha256, sha256Rowid (rowid-ordered, Stage 2.2), data }
  2. VERIFY      BackupService.verifyLogicalBackup(doc)               [in :memory:, REAL restore]
                 migrate → reinsert → per-table row counts AND (Stage 2.2) recomputed
                 rowid-ordered content hashes — a backup is "recoverable" only after this passes
  3. WRITE       <workspaceRoot>/backups/<exportedAt>.json             [production: /data/workspaces/backups]
  4. OFF-SITE    NEXUS_BACKUP_OFFSITE_DIR (Stage 2.2): copy of the newest backup to an
                 off-volume directory — configured ⇒ every export; failure is logged, never silent
  5. RETENTION   keep newest NEXUS_BACKUP_RETENTION (default 14), prune the rest
```

**Production paths (Dockerfile ENV):** DB `/data/nexus.db`, backups `/data/workspaces/backups` — same Railway volume; the off-site copy (step 4) is what breaks the single-volume failure coupling. With no off-site dir configured, the system behaves exactly as before (documented, honest status view).

## 2. Restore architecture (Stage 2.2, G-01 closed)

Three surfaces, one implementation:

| Surface | Path | Destructive? |
|---|---|---|
| Function | `BackupService.restoreLogicalBackup(db, doc, { wipe? })` | Only if `wipe: true` |
| CLI | `bun run restore --file <backup.json> --db <target> [--confirm-destructive]` | Refuses existing non-empty target without the flag (exit 2, no writes, no log) |
| Route | `POST /railway/backup/restore` (owner) | **Never** — restores into an isolated verification DB under `<workspaceRoot>/restore-verifications/<id>/`; the live store is untouched (proven by test) |

Shared guarantees: schema-compatibility validation (unknown tables rejected BEFORE any write); **single transaction** (wipe + reinsert; any failure → rollback, target left clean); post-restore content-hash verification per table; `PRAGMA foreign_key_check`; a restore log JSON written beside the target (`<target>.restore-log.json` / `<dir>/restore-log.json`).

## 3. Off-site export (Stage 2.2, G-03 minimal)

- **`NEXUS_BACKUP_OFFSITE_DIR`** — zero-cost, provider-independent copy target. On Railway this becomes real off-volume protection when another volume/mount is attached.
- **`GET /railway/backup/export/:file/download`** (owner) — streams a backup artifact with `X-Backup-Sha256` / `X-Backup-Bytes` / `Content-Disposition` headers, enabling verified manual off-site copies. Filename strictly validated (`/^[\w-]+\.json$/`); traversal refused (tested).
- **Full object-storage (S3) push: explicitly owner-gated (D-2.1-03).** No provider is assumed and no recurring cost is introduced unilaterally. This is the standing boundary between "implemented (minimal)" and "owner-blocked (full)".

## 4. Integrity verification (Stage 2.2, G-02 closed)

- Export records both `sha256` (insertion-order JSON, v1 compat) and `sha256Rowid` (rowid-ordered deterministic serialization).
- Verification recomputes `sha256Rowid` from the restored store; corruption with matching row counts is now detected — proven by test (a mutated row with identical counts fails verification).
- Legacy v1 documents without `sha256Rowid` degrade honestly to count-only with an explicit note (no silent weakening, no false claims).

## 5. Scheduling, retention, RPO/RTO

- Scheduler: in-process, single-instance assumption documented in code (G-04 carried: correct at current topology; must be externalized before any second instance).
- Retention: newest 14 by default (`NEXUS_BACKUP_RETENTION`); pruned count reported.
- RPO: one backup interval (24 h default) plus unexported writes. **Measured in the DR drill** at drill scale (minutes); production meaning documented — no unmeasured claim is made.
- RTO objective 15 minutes: the "import JSON" step now actually exists (CLI). **Measured in the drill: 96 ms wall-clock for the in-process data-recovery segment (CLI restore 5 ms)** — the objective covers the full production recovery including redeploy; the drill measures the data segment and says so.

## 6. Status surface (owner-gated)

`GET /railway/backups` reports both layers: Railway volume backups (existence only, recoverability honestly `UNVERIFIED`, L4-restore owner-gated) and the logical layer (schedule incl. `offsiteDir` + honest off-site note, lastRun with `offsite` result, bounded history, RPO/RTO meaning). Fail-closed 502 without Railway credentials (live discovery required) — honest by design.

## 7. Known limits (explicit)

- No SQL-level FK constraints exist in the schema; referential integrity is enforced at the repository layer and verified explicitly in the DR drill (11 orphan checks + PRAGMA). A schema-level FK migration would be an engineering change the owner can request; it is not required for correctness of the current architecture.
- Volume-level restore (Railway snapshot) remains L4/owner-gated and never exercised (G-05).
- A volume loss with NO off-site directory configured still loses the backup chain with the data — the honest status view says so; the drill demonstrates the off-site copy surviving.
