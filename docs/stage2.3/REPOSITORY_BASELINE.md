# STAGE 2.3 — REPOSITORY BASELINE
## Independent audit before any modification (directive §1)

**Document ID:** STAGE23-BASELINE-001
**Session:** 2026-11-15 (UTC)
**Method:** every fact below was independently measured this session — no supplied identifier, report or summary was trusted before verification. Gate-critical files were verified at byte level (hex dumps / structured parsers), never through free-text terminal rendering (the standing Stage 2.2 rule).

---

## 1. Git state at session start

| Property | Measured value |
|---|---|
| Current branch | `main` |
| HEAD at start | `b93a879` (Stage 2.2 final verification pass) |
| HEAD after Stage 2.3 remediation | `61a7c5b` (evidence durability repairs, §5) |
| `origin/main` | `41092a33fa13abf5acee64e8f1f3167fe46dadcd` ("acceptance: §22 four-category report…", 2026-11-14 12:58:02 UTC) — confirmed via `git fetch` (read-only) and independently via the unauthenticated GitHub API (`pushed_at: 2026-11-14T12:58:03Z`) |
| Relationship | local main **0 behind / 31 ahead** at session start (32 after the remediation commit); history linear (no merges in range) |
| Working tree | clean at start (`git status --porcelain` empty); no stashes |
| Remote | `origin = https://github.com/jamesrudh-arch/Jarvis-Nexus.git` (public repo, default branch `main`, verified via API: `private: false`) |
| Other branches | `railway-intelligence` @ `60d4fdd`, `stage2-pre-restructure` @ `f4c5a41` (both preserved, untouched) |
| History hygiene | no force-push, no rewrites at any point in the unpushed range (parents verified linear) |

## 2. Stage 2.2 deliverables (all 14 present and located)

`docs/stage2.2/` contains exactly the 14 promised deliverables: STAGE2_2_MASTER_REPORT.md, REMEDIATION_REGISTER.md, CI_REPAIR_AND_VERIFICATION.md, V4_EVIDENCE_RECONSTRUCTION.md, BACKUP_ARCHITECTURE.md, DISASTER_RECOVERY_REPORT.md, SECURITY_VERIFICATION.md, REGRESSION_TEST_REPORT.md, RELEASE_RISK_ASSESSMENT.md, OWNER_DECISION_REGISTER.md, DEPLOYMENT_AUTHORIZATION_PACKAGE.md, MACHINE_READABLE_EVIDENCE_REGISTER.json, RECOVERY_MANIFEST.json, SHA256SUMS — plus `evidence/` (6 machine artifacts) and `recovery/` (2 manifests + 2 committed thin bundles).

## 3. Recovery bundles — existence and integrity (restoration in §RECOVERY_AND_ROLLBACK_REPORT)

| Bundle | Committed path | Bytes | SHA-256 vs manifest | `git bundle verify` |
|---|---|---|---|---|
| RP-2.2-001-T | `docs/stage2.2/recovery/jarvis-nexus-unpushed-delta-20261115-115932.bundle` | 14,669,434 | **MATCH** (`767cb599…f699`) | PASS (provides `main` @ `c6d4b51`; requires `41092a3` — held by GitHub) |
| RP-2.2-002-T | `docs/stage2.2/recovery/jarvis-nexus-unpushed-delta-20261115-122627.bundle` | 29,448,852 | **MATCH** (`12fe669c…94ee`) | PASS (provides `main` @ `396ccaf`; requires `41092a3`) |

**Coverage gap (recorded, closed this stage):** RP-2.2-002's head is `396ccaf`; the Stage 2.2 tail (`fad4c69`, `b93a879`) and everything after are not inside any committed bundle — a bundle cannot contain the commit that commits it. RP-2.3-001 (created at the end of this stage) closes the gap; the only uncovered tail afterwards is the RP-2.3-001 artifact commit itself, which is deterministically reproducible.

## 4. SHA256SUMS validity — DEFECT FOUND (F-2.3-01), then repaired

Initial verification FAILED in two ways, both repaired this session (see §5):
1. **Non-standard format**: the register used three columns (`<hash>  <path> <bytes>`); GNU `sha256sum -c` fails on every line ("No such file or directory"). Verified by normalizing to two columns: 21/22 files OK.
2. **Stale hash**: `docs/stage2.2/evidence/evidence-integrity.json` did not match its recorded hash. Root-caused precisely: in commit `b93a879` the register was recorded at 12:28:18 and the file regenerated at 12:28:22 (only `generatedAt`/`generatedAtHead` fields changed) — an ordering defect, not tampering. All other 21 entries matched.

## 5. Discrepancies vs the Stage 2.2 report — full reconciliation (directive §1: STOP-and-reconcile applied)

| # | Discrepancy | Severity | Disposition |
|---|---|---|---|
| F-2.3-01 | Package SHA256SUMS non-standard + one stale hash (above) | Medium (evidence-verification defect, not product defect) | **REPAIRED** in `61a7c5b`: standard 2-column format; ordering rule documented in the generator; `sha256sum -c docs/stage2.2/SHA256SUMS` now verifies **22/22 OK directly** |
| F-2.3-02 | Evidence integrity claimed 53/53; independent re-run FAILED 51/53 — two registered evidence files (`auth-matrix-gen.log`, `backup-export-verify-gen.log`) were never committable because `*.log` in `.gitignore` silently excluded them; the environment recycle deleted them | Medium (durability defect class N-2.2-01, new instance) | **REPAIRED** in `61a7c5b`: scoped `.gitignore` negation `!docs/stage2/evidence/*.log`; both logs regenerated and committed; validator re-run **53/53 PASS** with durable artifacts |
| F-2.3-03 | `b93a879` commit message claims 907 test assertions; the machine register and two independent re-runs give **905** | Low (documentation only; message immutable without history rewrite — same class as D-2.1-05) | **DOCUMENTED**, never silently corrected; the reproducible number is 905 (206 pass / 12 skip / 0 fail / 27 files) |
| F-2.3-04 | `download/stage2.2/` mirror (promised "complete package mirrored") is gone — the environment recycle wiped `download/` again (third wipe) | Low (mirror is explicitly non-authoritative by design) | **CONFIRMS the durability rule** (only git-tracked files survive); the git-tracked `docs/stage2.2/` tree survived intact — no action |

No discrepancy indicated tampering or lost primary evidence: all 14 deliverables, both durable bundles and the full evidence tree survived in git.

## 6. Production and deployment state (read-only; nothing modified)

- **Production health** (`GET https://jarvis-nexus-production.up.railway.app/health`, anonymous, 2026-11-15T15:11:42Z): HTTP 200, `overall: healthy`; database healthy with **migrations applied: 2**; model fabric healthy (cloudflare/openai/echo; sandbox-egress note is expected per ADR-007); MCP gateway healthy; world simulation healthy (1 world, 8 residents); NAEI healthy (10 agents). Response time 0.25 s.
- **Deployed code is the OLD code**: anonymous `POST /jarvis/objectives` → 401 (fail-closed auth live); `GET /memory`, `POST /models/verify`, `GET /railway/backups` → 404 (candidate-only routes absent) — consistent with the 33-route production inventory vs 58 at HEAD.
- **CORS posture**: deployed code returns `access-control-allow-origin: *` (old permissive posture). The candidate replaces this with a least-privilege allowlist (`CORS_ALLOWED_ORIGINS`, unset = same-origin only) — a deliberate, owner-visible behavior change tied to decision B-02.
- **Deployment mechanism (CRITICAL)**: the Railway service is repo-connected to `jamesrudh-arch/Jarvis-Nexus` branch `main`; deployment history shows pushes auto-triggering deployments (latest recorded SUCCESS `8128960e` at 2026-11-13T17:57Z). **If auto-deploy remains enabled, an authorized push IS the deployment** — this changes the authorization protocol (see the authorization package §"push=deploy").
- **GitHub Actions (observed unauthenticated)**: 5 runs total; `41092a33` → success (2026-11-14T12:58:05Z, run 43597371050, 8/8 steps green, **no adversarial-gate step** — that step enters CI with the candidate); `269d422d` → success; `945a78dd`, `af8bf00f`, `8e58a259` → failure (2026-11-14 morning: real test failures of that era, since fixed — and the runs' existence further confirms CI triggering was never broken, i.e. the refuted BLK-01).
- **Rollback target**: `41092a3` is the known-good commit — pushed, CI-green, currently what production should be running or newer.

## 7. Credential capability of THIS environment (authorization-relevant)

Independently established: **no GitHub push credentials** (no credential helper, no gh CLI, no token embedded in the remote URL, no SSH keys) and **no Railway credentials** (0 `RAILWAY*` env vars, no config). Consequence: even with the owner's authorization, this environment cannot execute the push or trigger a Railway deployment — the owner must either execute those steps personally or provision credentials (itself an owner decision). Unauthenticated GitHub API access works (repo is public; Actions observable at 60 req/hr), so CI observation after an authorized push IS possible from here.

## 8. Baseline verdict

The repository differs from the Stage 2.2 report in exactly four reconciled ways (§5) — none blocking, two repaired with full evidence, two documented. The baseline is **established, clean and protectable**: working tree clean at `61a7c5b`, 32 unpushed commits, both prior recovery bundles intact and restore-proven, production healthy on the old code, and the authorization boundary fully mapped.
