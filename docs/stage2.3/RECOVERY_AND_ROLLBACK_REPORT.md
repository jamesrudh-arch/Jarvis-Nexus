# STAGE 2.3 — RECOVERY AND ROLLBACK REPORT
## Recovery readiness proven before any authorization is requested (directive §3)

**Document ID:** STAGE23-RECOVERY-001
**Session:** 2026-11-15 (UTC)
**Machine evidence:** `docs/stage2.3/evidence/bundle-restore-proof.json`, `docs/stage2.2/evidence/dr-drill.json` (fresh 2026-11-15 run)

---

## 1. Recovery bundles: strict restoration proof (reproduced this session)

**Method (stricter than Stage 2.2's):** a fresh repository was initialized and populated with ONLY what is reachable from `41092a33` (origin/main) — byte-for-byte the state GitHub actually holds (independently confirmed: `pushed_at: 2026-11-14T12:58:03Z` via the GitHub API). Each committed thin bundle was then fetched into that base with no other object source available. A restore that succeeds there succeeds from GitHub alone.

| Recovery point | Restored head | Expected head | Tree ID restored vs repo | Commits restored atop origin/main | Verdict |
|---|---|---|---|---|---|
| RP-2.2-001-T (14.7 MB bundle, sha256 `767cb599…`) | `c6d4b519…` | `c6d4b519…` | `30899cb7…` = `30899cb7…` **identical** | 22 (through the Stage 2.1 state) | **PASS** |
| RP-2.2-002-T (29.4 MB bundle, sha256 `12fe669c…`) | `396ccaf4…` | `396ccaf4…` | `8c46bd90…` = `8c46bd90…` **identical** | 29 (through the Stage 2.2 documentation package) | **PASS** |

Both bundles' file checksums match their manifests; `git bundle verify` passes for both (prerequisite `41092a3` satisfied by GitHub). Manifests: `docs/stage2.2/recovery/manifest-rp-2.2-{001,002}.json`.

**Coverage gap and its closure:** RP-2.2-002 covers through `396ccaf`. The Stage 2.2 tail (`fad4c69`, `b93a879`) and Stage 2.3's commits followed it. **RP-2.3-001** is created at the end of this stage (thin bundle, same script, explicit RP id, committed to git), covering the final tip; the only commit outside any bundle afterwards is the RP-2.3-001 artifact commit itself — which is deterministically reproducible (`bash scripts/stage22_rp_create.sh RP-2.3-001`) and whose loss would sacrifice nothing but the belt-and-suspenders copy of already-committed history.

## 2. Database backup availability and restoration procedure

**Productized backup (in the candidate):** scheduled logical backups (`NEXUS_BACKUP_INTERVAL_HOURS`, default 24 h; first run shortly after boot; retention `NEXUS_BACKUP_RETENTION`, default 14) export all 24 tables with per-row `sha256Rowid` content hashes into `NEXUS_WORKSPACE_ROOT/backups` (production: `/data/workspaces/backups` on the Railway volume). Each backup is content-verified at export; every restore re-verifies the hashes — corruption with matching row counts is detectable (proven by test).

**Restoration paths (all productized, none ad-hoc):**
1. `BackupService.restoreLogicalBackup` — schema validation, single transaction, automatic rollback on failure, restore log.
2. CLI `bun run restore -- <file> [--confirm-destructive]` — **refuses non-empty targets** without the explicit destructive flag (guard proven by test).
3. Owner route `POST /railway/backup/restore` — restores into an **isolated verification DB, never the live store** (non-destructive by construction, proven by test).

**Recovery drill (fresh run this session, 2026-11-15):** 10/10 steps PASS — volume-loss scenario; recovery from the off-volume export through the product CLI; 24 tables restored; content hashes verified; 11/11 orphan checks zero; `PRAGMA foreign_key_check` clean; functional resurrection (world state, residents, events, JARVIS tasks, memory marker, NAEI task all survived). Measured: **RTO 94 ms** wall-clock (data segment, in-process), **CLI restore 5 ms**, **RPO 11 ms** at drill scale. Production-scale meaning: these measure the data-path segment; full production RTO adds image pull + boot + migration time (Railway healthcheck timeout budget: 180 s).

**Off-volume copy:** `NEXUS_BACKUP_OFFSITE_DIR` (env, unset by default) copies the newest backup off-volume at each run; the owner-gated download route serves it with integrity headers. Full object-storage push remains owner-gated (D-2.1-03).

## 3. Rollback procedures (Git, application, database — they are NOT one operation)

- **Git rollback (local):** `git reset --hard <known-good>` or checkout of any recovery-point ref; all unpushed history is additionally protected by the committed bundles (§1).
- **Application rollback (Railway):** Railway keeps deployment history; the owner can redeploy a previous deployment (or the repo at `41092a3`) from the dashboard. **This environment has no Railway credentials**, so this step is owner-executed by necessity.
- **Database rollback — explicit warning (directive §3):** rolling back application code does NOT roll back migrations. Migration 3 is additive-only, so the old application ignores the extra `railway_*` tables safely (§4). There is no down-migration, by design; database state is instead recovered via backup restore (§2) if ever needed. **Automatic destructive database recovery is never performed** (directive §11).
- **Do-not-blindly-rollback rule:** a failed deploy is triaged first (logs, health, impact) — see the decision tree.

## 4. Data-compatibility analysis between application versions and migrations

| Scenario | Compatibility | Evidence |
|---|---|---|
| Forward: deploy candidate (migration 3 applies at boot) | **Safe** — `migrate(db)` runs transactionally at startup before serving; idempotency proven ([1,2,3] then all skipped); healthcheck gates traffic on `/health` (503 when unhealthy) | migration set + boot path in source; Stage 2.2 evidence; fresh drill |
| Rollback: old app (migrations 1-2) on a DB with migration 3 applied | **Safe** — migration 3 is CREATE-TABLE/INDEX only; old code never queries `railway_*` tables; `schema_migrations` simply holds one extra applied id the old runner ignores | migration 3 decoded this session (byte-exact DDL list in REVALIDATION §1 item 15) |
| Restore: backup from candidate into old-app database | **Safe** — logical export/restore is table-driven with schema validation; restoring into a pre-migration-3 DB is refused by schema validation rather than corrupting | BackupService schema validation (proven by test) |

**Known-good commit (rollback target):** `41092a33` — pushed, genuinely CI-green on GitHub (run 43597371050, 2026-11-14T12:58:05Z), and the newest commit production's lineage is known to run. The currently running production deployment is healthy (baseline PB-01) and is the immediate rollback deployment in Railway's history.

## 5. Recovery decision tree (post-deployment incident protocol, directive §11 aligned)

```
Incident detected (health red / regression / deploy failure)
├─ 1. STOP: no further changes; preserve logs + evidence (timestamps, screenshots, run ids)
├─ 2. Identify: which layer? (build | boot | migration | runtime | data)
│    ├─ build failed          → Railway keeps previous deployment live; triage logs; fix forward; redeploy. No data impact.
│    ├─ boot/health failed    → Railway restarts (ON_FAILURE, 5 retries); if still failing, owner redeploys 41092a3 deployment (app rollback; data-safe per §4).
│    ├─ migration failed      → migrate() is transactional: DB unchanged; app rollback safe; fix forward.
│    └─ runtime/data regress  → assess customer/data impact (§11.4):
│         ├─ no data impact   → app rollback to 41092a3; verify /health + 33-route surface; document.
│         └─ data impact      → DO NOT auto-recover destructively: present rollback decision + consequences to owner;
│                               only an explicitly authorized BackupService restore (isolated verification first,
│                               then --confirm-destructive onto the live store if owner approves) may run.
├─ 3. Authorize: rollback/data operations are owner-gated where destructive (directive §5/§11)
├─ 4. Execute the approved procedure (above); 5. Verify restored health (/health 200, migrations, routes);
└─ 6. Document incident + corrective action (INCIDENT_AND_BLOCKER_REGISTER.md); never conceal failures.
```

## 6. Recovery readiness verdict

**DEMONSTRATED.** Both committed recovery bundles reconstruct their intended Git states from GitHub's exact object base (strict re-proof, tree-identical); the database backup/restore mechanism is productized, guarded, content-verified and freshly re-drilled 10/10 with measured timings; migration 3's additive-only shape makes application rollback data-safe; the decision tree covers every failure layer with owner-gated destructive steps. Recovery capability is proven — the authorization package can now be issued on a sound basis.
