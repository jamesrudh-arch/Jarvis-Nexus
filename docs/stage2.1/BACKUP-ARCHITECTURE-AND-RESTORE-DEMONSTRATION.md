# STAGE 2.1 — ACTUAL LOGICAL-BACKUP ARCHITECTURE & ISOLATED RESTORATION DEMONSTRATION

**Document ID:** STAGE21-BKP-001
**Generated:** 2026-11-15T05:40Z (UTC)
**Method:** architecture established from source code only (`packages/railway/src/backup.ts`, `apps/nexus-api/src/index.ts` §"BACKUP SCHEDULER", `apps/nexus-api/src/main.ts`, `Dockerfile`, `railway.json`); restoration demonstrated by execution in isolated sandboxes under `/tmp`. Production was not read or written beyond one unauthenticated `GET /health`.

---

## 1. The architecture as built (not as claimed)

### 1.1 Two distinct layers, deliberately never conflated

**Layer 1 — Railway volume backups (infrastructure level).**
`BackupService.report()` (packages/railway/src/backup.ts:69) reads volume backup *existence and metadata* from a Railway infrastructure snapshot and renders each backup with `verified: false, recoverability: "UNVERIFIED"` — the code itself states "existence is NOT recoverability" and "restoring one is an L4 destructive operation requiring explicit owner authorization" (blocked in the integration's read-only mode). If any volume has no backups, the report appends the honest note "at least one volume has NO backups — data-loss exposure if the volume is lost".

- Known state at Stage 2 time (committed register): **zero Railway volume backups**.
- Current state: **cannot be re-verified from this session** — `GET /railway/backups` is owner-bearer-gated and no owner key exists here. Treated as *unknown, presumed unchanged*; flagged for verification at deployment time.

**Layer 2 — application-level logical backups (the "actual logical-backup architecture").**
Implemented in `BackupService.exportLogicalBackup` / `verifyLogicalBackup` (backup.ts:94–153) and the scheduler in `apps/nexus-api/src/index.ts:750–818`:

1. **Export** — read-only scan of all 24 NEXUS tables (`NEXUS_TABLES`, migrations 1–3: `schema_migrations`, `kv`, `jarvis_tasks`, `naei_agents`, `naei_tasks`, `memories`, `world_events`, `world_snapshots`, `worlds`, `residents`, `vehicles`, `properties`, `businesses`, `accounts`, `transactions`, `mcp_servers`, `mcp_audit`, `requirements`, `ledger`, `technologies`, `metrics`, `railway_events`, `railway_audit`, `railway_state`) into a versioned JSON document: `format: "nexus-logical-backup", version: 1`, with per-table `rows` count and `sha256` of `JSON.stringify(rows)`.
2. **Restore verification (real, in-memory)** — opens a fresh `:memory:` SQLite DB, runs the real migrations, reinserts every row (boolean normalization 0/1), compares per-table row counts. A backup is only called "recoverable" after this passes.
3. **Volume write** — `JSON.stringify(doc)` to `<workspaceRoot>/backups/<exportedAt>.json`. In production (Dockerfile): `ENV NEXUS_DB_PATH=/data/nexus.db`, `NEXUS_WORKSPACE_ROOT=/data/workspaces` → **both the database and the backups live on the same Railway volume** (`/data`).
4. **Retention prune** — keep newest `NEXUS_BACKUP_RETENTION` (default 14) files, delete the rest.

**Scheduler:** in-process `setInterval`, `NEXUS_BACKUP_INTERVAL_HOURS` (default 24, `0` disables), first run 30 s after boot (staggered), `.unref()`'d. Comment in code: correct for single-instance; a multi-instance topology must externalize the schedule.

**Surface:** `POST /railway/backup/export` (owner) — export + verify + write + prune, same semantics as the scheduled path. `GET /railway/backups` (owner) — volume layer + logical layer (schedule config, lastRun with `rowsMatched`/`pruned`, bounded history of 20, RPO = one interval, RTO objective 15 min).

### 1.2 RPO / RTO as documented in the product

- **RPO:** one backup interval (24 h default) plus any unexported writes.
- **RTO (objective 15 min):** "logical restore = redeploy image + mount volume + import JSON; verified by isolated restore in CI and at every backup run."

---

## 2. Architecture gaps (audit findings, each with evidence)

| ID | Gap | Evidence | Consequence |
|---|---|---|---|
| **G-01** | **No restore/import path exists in product code.** The RTO text promises "import JSON", but there is no route, CLI or package function that loads a backup document into a database. Grep for import/restore across `apps/`, `packages/`, `scripts/` finds only the export path and the in-memory verifier. | `apps/nexus-api/src/index.ts:807` (RTO text); absence verified by search | A real recovery requires an operator to write ad-hoc restore code under incident pressure. This challenge wrote and validated one (§4) — it should be productized. |
| **G-02** | **Restore-verify is count-only.** `verifyLogicalBackup` compares `t.rows === restoredRows` per table; the exported SHA-256s are never re-checked post-restore. | `backup.ts:138` | A backup whose row *contents* are corrupted (but counts match) would pass verification. Demonstrated closed by this audit's stronger check (§4.4). |
| **G-03** | **Single point of failure: backups on the same volume as the database**, with zero Railway volume backups (Layer 1 empty at last verified state) and no off-site export route (`GET /railway/backups` returns metadata only; no download/offload endpoint). | Dockerfile ENV; index.ts:755; backup.ts report | Volume loss destroys the database **and** the entire backup chain simultaneously. Worst-case loss = all data. This is the single largest resilience gap in the system. |
| **G-04** | In-process scheduler assumes single instance (documented in code). | index.ts:751–754 | Acceptable today (single Railway service); must be externalized before any scale-out. |
| **G-05** | Railway volume backups remain at zero (last verified) and their restore is an L4 owner-gated destructive operation that has never been exercised. | backup.ts:5–9; committed register | Volume-level recovery is unproven by design; all real recoverability currently rests on Layer 2 — which has gap G-03. |

---

## 3. Isolated restoration demonstration — design

Objective: prove (or refute) that the logical-backup architecture can actually recover a destroyed deployment, using the **real production code path** for export and an **independent, stronger** verification for restore.

Phases (script: `scripts/stage21_isolated_restore_demo.ts`, executed 2026-11-15T05:31Z):

- **A — SEED + EXPORT:** boot the real app (`createApp`) on a fresh isolated DB (`/tmp/stage21_restore_demo_*/A_live/nexus.db`), owner key set, echo model allowed, scheduler off. Bootstrap auto-creates the default world. Drive real owner-authenticated routes: `POST /jarvis/objectives`, `POST /world/advance` (12 ticks), `POST /memory`. Then `POST /railway/backup/export` — the same code path production uses.
- **B — DESTROY:** close the app, **delete the database file**, assert it no longer exists. (The backup JSON survives — as it would if copied off-volume; in a true volume loss it would not, which is exactly gap G-03.)
- **C — INDEPENDENT RESTORE:** open a fresh `NexusDb` at a new path, apply real migrations 1–3, reinsert every row from the backup document, and verify **per-table row counts AND recomputed content SHA-256** against the hashes recorded in the backup (stronger than the product's count-only check).
- **D — FUNCTIONAL RESURRECTION:** boot a brand-new app instance on the restored DB and query the normal GET routes — the world ID, resident count, properties, businesses, event count, the JARVIS task and the memory marker must all match the pre-export state.

## 4. Results — 22/22 checks PASS

```
=== PHASE A ===
PASS  GET /world/state after bootstrap
PASS  default world bootstrapped with residents — nexus_world_993b55b6-…, 8 residents, 8 properties
PASS  POST /jarvis/objectives — 201
PASS  POST /world/advance (12 ticks) — 200
PASS  POST /memory — 201
PASS  POST /railway/backup/export (owner) — 201
PASS  app's own restore-verify passed — 24 tables, 61 rows, file …/backups/2026-11-15T05-31-42-878Z.json
PASS  backup document format (nexus-logical-backup v1)
PASS  backup contains all 24 NEXUS tables — 24, 61 rows total
=== PHASE B ===
PASS  source database file destroyed
=== PHASE C ===
PASS  migrations applied to the fresh target — [1,2,3]
PASS  per-table row counts match — 24/24
PASS  per-table CONTENT SHA-256 match (stronger than product verify) — 24/24
      non-empty tables: schema_migrations:3, jarvis_tasks:1, naei_agents:10, memories:2,
      world_events:1, world_snapshots:1, worlds:1, residents:8, properties:8, businesses:1,
      accounts:9, mcp_servers:1, metrics:15
=== PHASE D ===
PASS  GET /world/state on restored DB — 200
PASS  world id survived — nexus_world_993b55b6… == nexus_world_993b55b6…
PASS  resident count survived — 8 == 8
PASS  world event count survived (>= pre-export) — 1 >= 1
PASS  properties + businesses survived — 8→8, 1→1
PASS  JARVIS task survived — 1→1, objective text matched
PASS  memory marker survived
```

**Verdict: PASS — logical backup restored in isolation with content-hash verification and functional resurrection.**

Evidence artifacts:
- Backup document: `download/stage2.1/evidence/restored-demo-backup.json` — 53,636 bytes, sha256 `3434240ca538f65bdff80a92a6072272e0929113d06de7e97b7971d96abaee03`
- Script (reproducible): `scripts/stage21_isolated_restore_demo.ts` (exit 0; re-run regenerates fresh evidence)

**Conclusion on the challenge question:** the logical-backup architecture is *real and genuinely restorable* — export → destroy → independent restore → functional resurrection works, with content-level integrity proven. Its weaknesses are operational, not fictional: no productized import path (G-01), weaker-than-possible self-verification (G-02, closed by this audit's method), and the same-volume single point of failure (G-03), which no restore demo can paper over.

## 5. Repository-level recovery: RP-2.1-001 (new) and the legacy bundles

**Context:** the previously claimed recovery points are gone — RP-FC-001 has no traceable reference anywhere; RP-STAGE2-001's two artifacts (git bundle + worktree tarball, defined in committed `scripts/stage2_recovery_manifest.py`) lived in the wiped gitignored `download/` tree. Until this session, the 20 unpushed commits had **zero durable protection**.

**RP-2.1-001 (created this session):**

- Artifact: `download/stage2.1/recovery/jarvis-nexus-full-20261115-053253.bundle`
- Size: 99,819,242 bytes · sha256 `cad3fa846c836c8e5758cc056033825a89ff1f68badb67ddfb20b1fbf69fb490`
- Contents: all 5 refs (`main@35ae593`, `railway-intelligence@60d4fdd`, `stage2-pre-restructure@f4c5a41`, `origin/main@41092a3`, HEAD) — `git bundle verify`: "okay … records a complete history".
- **Restoration demonstrated in isolation:** `git clone` from the bundle → HEAD `35ae593`, 504 tracked files, clean status, all 3 branches present, 5/5 key-file spot-checks PASS (`package.json`, `apps/nexus-api/src/index.ts`, `packages/railway/src/backup.ts`, `prisma/schema.prisma`, `NEXUS_WORLD/README.md`).

**Legacy bundles (restored and audited in isolation this session):**

- `/tmp/my-project/download/backups/lineA_production.bundle` — valid; `refs/remotes/github/main@535bfc3` (reachable from current history) and `refs/heads/feat/smart-failover@84a1831` — **1 commit unreachable from any current ref** (smart-failover: circuit breakers, exponential backoff, failure classification; 879 insertions, 7 files).
- `/tmp/my-project/download/backups/lineB_NEXUS_WORLD_V2.bundle` — valid; `refs/heads/main@bc3f3a1` — **18 commits unreachable** (the V2 visual-product lineage).
- Both live in `/tmp` **outside the protected project directory** and will be lost with the sandbox. Disposition requires an owner decision (D-2.1-04).
- `workingtree_snapshot_20261114.tar.gz` (320,599,385 B) — pre-Stage-2 working-tree snapshot (07:07Z, before the restructure commits); contains no Stage 2 reports (verified by listing).

## 6. Recommendation

1. Before any deploy: implement an off-volume backup export (scheduled push of the newest backup JSON to object storage, or at minimum an owner-gated download route) — closes G-03.
2. Productize the restore path (`bun run restore --file <backup.json>`) using the validated logic of `scripts/stage21_isolated_restore_demo.ts` — closes G-01.
3. Upgrade `verifyLogicalBackup` to re-hash restored rows (this audit's method) — closes G-02.
4. At deployment verification: confirm Railway volume backup state via `GET /railway/backups` with the owner key (B-03 dependency), and exercise one real export in production.
