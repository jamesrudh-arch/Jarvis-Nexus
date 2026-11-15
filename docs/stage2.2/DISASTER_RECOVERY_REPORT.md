# STAGE 2.2 — DISASTER RECOVERY REPORT (C5: the drill, as executed)

**Document ID:** STAGE22-DR-001
**Drill ID:** DR-20261115T12151
**Script (reproducible):** `scripts/stage22_disaster_recovery_drill.ts` — committed; re-runnable.
**Machine evidence:** `docs/stage2.2/evidence/dr-drill.json` (git-tracked).

---

## Scenario

The source **volume** is lost — database file, workspace root, and the entire on-volume backup chain are destroyed together (the exact coupling G-03 warned about). Recovery succeeds **only because the newest backup was exported off-volume** (`NEXUS_BACKUP_OFFSITE_DIR`), and is performed **through the product CLI**, not an ad-hoc script.

## The 10 steps (directive §7 C5), as executed

| Step | What happened | Result |
|---|---|---|
| 1. Representative data | Real owner routes on a live app instance: 2 JARVIS objectives, 12 world ticks, a memory record, a NAEI workforce task (contract-correct payload) | 8 residents, 8 properties, 1 business, seeded world |
| 2. Backup via the actual path | `POST /railway/backup/export` (owner) → export + app's own isolated restore-verify + **off-volume copy** | 24 tables, 73 rows; off-site copy byte-identical to the on-volume artifact |
| 3. Backup validated | Content-level verification on the **off-site** artifact (the one that will be used) | rows + content hashes verified |
| 4. Destroy only the source | `rm -rf` of the entire source volume (db + workspaceRoot + on-volume backups); off-site copy survives | volume gone; artifact alive |
| 5. Restore into an independent isolated DB | `bun run restore --file <offsite> --db <fresh target>` (product CLI) | exit 0; single committed transaction; restore log written |
| 6. All expected tables | CLI report + independent count | 24/24 tables, 73 rows |
| 7. Content integrity | Product verify (per-table `sha256Rowid`) + independent recheck straight from the restored file | all tables match, zero exceptions |
| 8. Relationships + foreign keys | `PRAGMA foreign_key_check` (clean — schema carries no SQL FK constraints, honest note) + 11 explicit orphan checks (residents/vehicles/properties/businesses/accounts/transactions → worlds/residents/accounts) | 0 orphans on every pair |
| 9. Functional verification | New app instance booted on the restored DB; `GET /world/state`, `/jarvis/tasks`, `/memory/jarvis`, `/naei/tasks` | world id, 8 residents, 8 properties, 1 business, events, both JARVIS objectives (incl. drill text), memory marker, NAEI task — all survived |
| 10. Signed-off report | Machine evidence written with verdict + signature block | this document + dr-drill.json |

## Measured recovery times (no unmeasured claims)

- **RTO (wall-clock, destroy → functional verification): 96 ms** for the in-process data-recovery segment, of which **CLI restore 5 ms** (73 rows). The drill measures the DATA segment; a real production recovery adds redeploy time (image pull + boot + migration). The 15-minute RTO objective covers the full production recovery and remains the objective — the drill proves the data segment is not the bottleneck.
- **RPO (measured): 11 ms** at drill scale (export moments before destruction). Production meaning: one backup interval (default 24 h) plus unexported writes — documented, not claimed as 11 ms in production.

## What this proves (and does not)

**Proven:** off-volume export + product CLI restore + content-level integrity + referential integrity + functional resurrection, end to end, through the product's own code paths.

**Not claimed:** Railway volume-backup restore (L4, owner-gated, never exercised — G-05 stands); production-scale RTO (deploy overhead not measured here); multi-instance scheduler behavior (G-04 stands).
