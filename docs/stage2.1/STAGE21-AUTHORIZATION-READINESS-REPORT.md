# STAGE 2.1 — AUTHORIZATION-READINESS CHALLENGE REPORT

**Document ID:** STAGE21-AUTH-READY-001
**Generated:** 2026-11-15T05:40:00Z (all times UTC)
**Audited range:** `origin/main` (`41092a3`) → local `main` (`35ae593`) — 20 commits, 2026-11-14 13:03–23:48
**Prepared for:** Owner authorization decision — production deployment of JARVIS NEXUS
**Constraints honored:** No deploy. No push. No production modification. Read-only diagnostics + local isolated testing only.
**Companion documents:** `COMMIT-AUDIT.md` · `BACKUP-ARCHITECTURE-AND-RESTORE-DEMONSTRATION.md` · `RELEASE-RISK-ASSESSMENT.md` · `OWNER-DECISION-REGISTER.md` · `UNRESOLVED-BLOCKERS.md` · `stage21_register.json`

---

## 1. Executive verdict

**NOT READY FOR UNCONDITIONAL DEPLOYMENT AUTHORIZATION.**

The engineering substance of the deployment candidate is strong and largely reproduces: the codebase typechecks clean, the registry is consistent, the route surface is additive-only, the auth matrix passes a correct adversarial re-probe (30/30), and — demonstrated fresh in this challenge — the logical-backup architecture genuinely round-trips through a destroyed-and-restored database with full content-hash verification.

However, the authorization package as previously claimed **does not survive independent audit**:

1. The claimed test baseline (191 pass / 0 fail) **does not reproduce** — 3 tests fail because the entire Stage 2 evidence set was persisted only in a gitignored directory that the environment has since wiped.
2. The claimed closure documents (`FINAL-CLOSURE-REPORT.md`, `DEPLOYMENT-READINESS.md`) **do not exist** — not in the working tree, not in any commit, not in any surviving snapshot.
3. The claimed recovery point **RP-FC-001 has no traceable existence**, and the artifacts of **RP-STAGE2-001 are lost**.
4. A **pre-existing CI defect** (corrupted branch filter, already pushed to GitHub) means CI has been silently dead — pushing would run no CI at all.
5. One of the committed "adversarial verification" scripts is **broken** (shell word-splitting bug); its recorded output actually says `36 unexpected`, contradicting the commit message that cites it as evidence.

Every item above is documented with primary evidence in the companion documents, together with the exact commands, hashes and exit codes that expose it. Nothing in this report is inferred from memory; every claim was re-measured in this session.

**What was verified positively (this session, fresh evidence):**

| Check | Result |
|---|---|
| Working tree clean, no stashes | PASS |
| History linear (0 merges), single day, 2 author identities | PASS (noted) |
| Secret scan of unpushed diff (444 files, +55,924 lines) | CLEAN (1 documented dev token, self-flagged LOW) |
| Route parity: 56 routes (32 GET + 24 POST) vs production 33 | PASS — +23 additive, 0 removed, 0 duplicates |
| Typecheck (`tsc --noEmit`) | PASS — 0 errors |
| Registry consistency (112 requirements) | PASS |
| Auth matrix (corrected probe, 30 owner-gated routes) | PASS — 30×401, 0 unexpected |
| Webhook auth / replay / dedup / stale-timestamp | PASS |
| Rate-limit boundary (fixed-IP burst) | PASS — 240 allowed, 5×429 at limit |
| Secret-exposure scan (responses leak no keys) | PASS — 0 leaks |
| Logical backup export → **destroy → isolated restore** → functional resurrection | **PASS — 22/22 checks, content SHA-256 match on all 24 tables** |
| New recovery point RP-2.1-001 (git bundle, all refs) + clone verification | PASS — see §5 |
| Production endpoint (read-only GET /health) | HTTP 200, overall healthy, migrations 2/3 |

**What does NOT reproduce:**

| Claimed (Stage 2 final closure) | Measured (this session) |
|---|---|
| 191 pass / 12 skip / 0 fail / 805 assertions | **188 pass / 12 skip / 3 FAIL / 776 assertions** (26 files — matches) |
| `FINAL-CLOSURE-REPORT.md` exists | **Nonexistent** (working tree, full git history, /tmp snapshot all searched) |
| `DEPLOYMENT-READINESS.md` exists | **Nonexistent** |
| Recovery point RP-FC-001 + checksum | **No reference anywhere in the repo** |
| RP-STAGE2-001 artifacts (bundle + tarball) | **Lost** with the wiped gitignored `download/` directory |
| "19 unpushed commits" | **20** (the 20th, `35ae593`, post-dates the claim; see COMMIT-AUDIT) |
| "full suite 191 pass / 0 fail (805 assertions)" at `cd46b69` | Was true **only** while the now-lost evidence files existed on disk |

---

## 2. Scope and method

Ordered per the owner directive:

1. **Independent audit of the unpushed commits** (claimed 19, actual 20) — lineage, content, integrity, secret exposure, message-vs-content honesty. → `COMMIT-AUDIT.md`
2. **Establish the actual logical-backup architecture** from source, not from claims. → `BACKUP-ARCHITECTURE-AND-RESTORE-DEMONSTRATION.md`
3. **Demonstrate restoration in isolation** — a real export through the production code path, real destruction of the source database, independent restore into a fresh isolated database with verification *stronger* than the product's own, and functional resurrection on the restored database. → same document, §4
4. **Release-risk assessment** with a full risk register. → `RELEASE-RISK-ASSESSMENT.md`
5. **Every unresolved blocker identified**, no omissions, no softening. → `UNRESOLVED-BLOCKERS.md`
6. **Owner decision register** — the nine pre-existing decisions plus the new decisions this audit forces. → `OWNER-DECISION-REGISTER.md`

Everything ran locally against the repository at `/home/z/my-project` and ephemeral `/tmp` sandboxes. Production was touched only by one unauthenticated `GET /health` (HTTP 200). No `git push`, no Railway API mutation, no environment variable changes, no database writes against production.

---

## 3. Baseline discrepancies (claimed vs measured)

| # | Baseline item (per directive) | Claimed | Measured | Disposition |
|---|---|---|---|---|
| 1 | Unpushed commits | 19 | **20** (`git rev-list --count origin/main..main`) | The 20th commit `35ae593` (UUID message, adds `scripts/stage21_route_parity.py`) was created 2026-11-14 23:48:49 — after the final-closure report was drafted. It is benign in content but has an unacceptable commit message. See F-COM-01/02. |
| 2 | Working tree clean | yes | **yes** (`git status` clean, 0 stashes) | Matches. |
| 3 | Test baseline | 191/12/0/805 | **188/12/3 FAIL/776** | The 3 failures are `V4 evidence provenance` tests in `tests/adversarial/verifier.test.ts` — they require `download/stage2/evidence/` (≥6 files), `download/stage2/reports/*.md` (7 reports >500 B) and `download/stage2/reports/recovery_manifest.json` with artifacts >1000 B. That entire tree is gone. Root cause: `download/` is **gitignored** and was wiped by the environment; the evidence was never committed. |
| 4 | Registered routes | 56 | **56** (32 GET + 24 POST; production 33) | Matches; additive-only delta +23, no duplicates (re-verified by script and by hand). Note: the committed register claims `missingRoutes: 21` — actual delta is 23 (minor honesty defect in the register script, F-COM-04). |
| 5 | Database migrations | 3 in repo | **3 in repo; production has 2** (per `GET /health`: "migrations applied: 2") | Matches known deploy-gated state; migration 3 (`railway_intelligence`, INSERT-only tables) is pending deployment. |
| 6 | RP-FC-001 + checksum | exists | **No reference exists anywhere** | Unverifiable claim. The verifiable predecessor RP-STAGE2-001 is defined in the committed script `scripts/stage2_recovery_manifest.py`, but both of its artifacts are lost. |
| 7 | `FINAL-CLOSURE-REPORT.md` | exists | **Nonexistent** | The final-closure session's deliverables were written to the gitignored `download/` tree and lost. Only their titles survive inside commit messages and test code. |
| 8 | `DEPLOYMENT-READINESS.md` | exists | **Nonexistent** | Same as above. |

---

## 4. Independent audit of the unpushed commits (summary)

Full per-commit analysis in `COMMIT-AUDIT.md`. Headline findings:

- **F-COM-01 (count):** 20 unpushed commits, not 19. The extra commit `35ae593` post-dates the directive's baseline.
- **F-COM-02 (traceability):** two commits carry UUID placeholder messages — `0f9986a` ("ced79372-…") and `35ae593` ("b944b55e-…"). Content is benign (audit scripts), but release history should not ship unexplained commit messages.
- **F-COM-03 (CI already broken on origin):** `.github/workflows/ci.yml` contains `branches: ain]` (should be `[main]`) in **both** `push` and `pull_request` filters. Introduced at `945a78d`, which is **already pushed** — GitHub CI has therefore been silently dead on this repository. None of the 20 unpushed commits fixes it (the final-closure commit `cd46b69` edited the same file for token permissions and left the trigger broken).
- **F-COM-04 (message overstates content):** `623da7b`'s message announces `stage2_execution_register.json` as a deliverable; the commit contains only the generating script — the output went to the gitignored `download/` and is lost.
- **F-COM-05 (cited evidence invalid):** `cd46b69`'s message cites a "30-route auth matrix" among its adversarial probes. The committed probe script has a shell word-splitting bug (`for spec in $ROUTES` splits method and path); its recorded result line is "19 routes correctly 401, **36 unexpected**". The corrected matrix (probe round 2, and this session's re-run) passes 30/30 — the *product* is fine; the *evidence artifact* was never valid.
- **F-COM-06 (secrets):** no real credentials in the range. One dev token `nexus-tier0-dev-token` (legacy Python subsystem, env-overridable, self-flagged LOW in the repo's own security scan). Binary additions are PNG evidence screenshots.

---

## 5. Logical-backup architecture and restoration (summary)

Full detail in `BACKUP-ARCHITECTURE-AND-RESTORE-DEMONSTRATION.md`.

**The actual architecture (from source, `packages/railway/src/backup.ts` + `apps/nexus-api/src/index.ts`):**

- Layer 1 — Railway volume backups: **reported, not taken**. Restoring one is an L4 destructive operation, blocked in read-only mode; recoverability honestly labelled `UNVERIFIED`. The register recorded **zero** Railway volume backups at Stage 2 time; current state cannot be re-verified from here (the status route is owner-gated).
- Layer 2 — application-level logical backups: full read-only export of all 24 NEXUS tables into a versioned JSON document (`nexus-logical-backup` v1) with per-table SHA-256 of the row data, followed by a **real isolated in-memory restore-verify** (fresh DB → migrate → reinsert → row-count compare), then file write to `/data/workspaces/backups/` and retention pruning (default 14 files). Scheduler: in-process, default 24 h (env-tunable, 0=off), first run 30 s after boot. Owner-gated endpoints `POST /railway/backup/export` and `GET /railway/backups` (schedule, last run, history, RPO = one interval, RTO = 15 min objective).

**Architecture gaps found (all documented with line references):**

- **G-01:** No import/restore path exists in product code. The RTO text promises "import JSON" — there is no route, CLI or package function that performs a restore. Restoration today requires an external script (this challenge wrote and used one).
- **G-02:** The product's restore-verify compares **row counts only**; the exported SHA-256s are never re-checked against restored content.
- **G-03:** Backups are written **to the same volume** as the database, with zero Railway volume backups and no off-site export route — a volume loss destroys both the data and the backup chain (single point of failure; worst-case RPO = all data).
- **G-04:** Scheduler is in-process and single-instance (documented assumption in code).

**Isolated restoration demonstration (executed 2026-11-15T05:31Z, all 22 checks PASS):**

1. Booted the real app on an isolated DB; seeded through real owner-authenticated routes (JARVIS objective, 12 world ticks, memory record) — world `nexus_world_993b55b6…`, 8 residents, 8 properties, 1 business, 61 rows total.
2. Exported through the real production path (`POST /railway/backup/export`); app's own verify passed (24 tables, 61 rows).
3. **Deleted the source database file.**
4. Independently restored into a fresh isolated database (real migrations 1–3, full reinsert) and verified **per-table row counts AND recomputed content SHA-256 — all 24 tables match** (stronger than the product's own check).
5. Booted a brand-new app instance on the restored database: world ID, resident count, properties, businesses, event count, JARVIS task and the memory marker all survived. Functional resurrection confirmed.

Evidence: `download/stage2.1/evidence/restored-demo-backup.json` (53,636 B, sha256 `3434240c…`), script `scripts/stage21_isolated_restore_demo.ts`.

**New recovery point RP-2.1-001 (created this session because the unpushed work had zero durable protection):**

- `download/stage2.1/recovery/jarvis-nexus-full-20261115-053253.bundle` — 99,819,242 bytes, sha256 `cad3fa846c836c8e5758cc056033825a89ff1f68badb67ddfb20b1fbf69fb490`, all 5 refs, complete history (`git bundle verify`: okay).
- Restoration demonstrated: cloned from the bundle into an isolated directory → HEAD `35ae593`, 504 files, clean status, all 3 branches, 5/5 key-file spot checks PASS.

---

## 6. What happens on deployment (if authorized later)

Deploying local `main` to the Railway service (builder Dockerfile, start `bun apps/nexus-api/src/main.ts`) would, relative to the running production at `41092a3`:

- Add **23 routes** (all owner-gated except `GET /world/layout`), remove none.
- Apply **migration 3** (`railway_intelligence`: `railway_events`, `railway_audit`, `railway_state` — INSERT-only by convention).
- Activate the phase-3 security hardening (CORS allowlist, rate limiting + auth-fail lockout, honest model health), the phase-4 backup scheduler (24 h / 14 files), the phase-7 voice adapters, and the final-closure repairs (honesty, accessibility, per-request timeouts).
- The frontend visual application is **not** deployed by this service (hosting decision B-02 outstanding).

---

## 7. Authorization boundary — decisions requested

Nine pre-existing owner decisions (B-01…B-07, FC-05, FC-06) plus five new decisions forced by this audit (D-2.1-01…D-2.1-05) are specified in `OWNER-DECISION-REGISTER.md`, each with options, recommendation, and exactly what it unblocks. Deployment-blocking at minimum:

- **B-01** — the push/deploy authorization itself (now 20 commits, not 16 as originally scoped).
- **D-2.1-01** — CI trigger repair **before** push (pushing today would run no CI).
- **D-2.1-02** — evidence-durability remediation and the disposition of the 3 failing V4 tests (the repo's own gate is red).
- **D-2.1-03** — off-site backup export path (accept or remediate the backup single point of failure).

**No deployment, push or production mutation has been performed. Awaiting explicit owner approval.**
