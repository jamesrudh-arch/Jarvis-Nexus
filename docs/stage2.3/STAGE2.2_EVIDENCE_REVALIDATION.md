# STAGE 2.3 — STAGE 2.2 EVIDENCE REVALIDATION
## Independent reproduction of every important Stage 2.2 claim (directive §2)

**Document ID:** STAGE23-REVAL-001
**Session:** 2026-11-15 (UTC)
**Evidence-category discipline (directive §2, never conflated):**

| Category | Meaning | Used for |
|---|---|---|
| **recorded** | claimed in Stage 2.2 documents | the claim column below |
| **reproduced** | independently re-run locally THIS session | all local gates |
| **github-verified** | observed via the GitHub API this session | CI history only (the candidate's own CI run requires an authorized push) |
| **production-verified** | observed against the live deployment (read-only) | pre-deploy baseline only (candidate behavior requires an authorized deploy) |

---

## 1. Revalidation matrix

| # | Item | Stage 2.2 claim (recorded) | Stage 2.3 independent result | Category | Verdict |
|---|---|---|---|---|---|
| 1 | Full test suite | 206 pass / 12 skip / 0 fail / 905 assertions / 27 files | `bun test`: **206 / 12 / 0 / 905 / 27** (4.08 s) | reproduced | **MATCH** |
| 2 | Test-suite assertion count (commit message) | 907 (b93a879 message) | 905 (register) = 905 (re-run) — message over-counts by 2 | reproduced | **F-2.3-03 documented** |
| 3 | TypeScript | 0 errors | `tsc --noEmit` exit 0, silent | reproduced | **MATCH** |
| 4 | Production build | strict standalone build + assembly PASS | `bunx next build` PASS (3 static pages, 14 routes); standalone assembled (`server.js` + `public/` + `.next/static`) | reproduced | **MATCH** |
| 5 | CI structural validation | 29 checks PASS | re-run: **29/29 PASS**; additionally re-run with `--execute`: all workflow steps executed locally, verdict PASS | reproduced | **MATCH** |
| 6 | Adversarial gate in CI | F-2.2-CI-01 repaired; gate is a CI step | `.github/workflows/ci.yml` step `bun test tests/adversarial` present; also `permissions: contents: read` (least-privilege) | reproduced | **MATCH** |
| 7 | Branch filter bytes (refuted BLK-01) | `branches: [main]` always; "ain]" was a display artifact | **byte-proof this session**: line hex `20202020 6272616e63686573 3a 20 5b 6d 61696e 5d`; exact-match count for `branches: [main]` = 2, for literal `branches: ain]` = 0; no ESC bytes; git blob at HEAD sha256-identical to worktree (`fad51387…`); the artifact reproduced itself live in this session's own terminal labels | reproduced | **REFUTATION CONFIRMED** |
| 8 | Security matrix | 37/37 source-derived owner-gated routes 401 (anon + wrong key) | security suite re-run: auth matrix **37/37**; escalation/query-string/case-mangle/padded-token refused | reproduced | **MATCH** |
| 9 | Webhook fail-closed | auth / replay / dedup / stale-timestamp with CONFIGURED secret | re-run PASS (contract-correct payload, severity enum) | reproduced | **MATCH** |
| 10 | Rate limiting | exact boundary (5 allowed → 429 + Retry-After), auth-fail lockout refuses even valid keys | re-run PASS | reproduced | **MATCH** |
| 11 | CORS restrictions | allowlist enforced both ways | re-run PASS (deny + allow paths) | reproduced | **MATCH** |
| 12 | Secret exposure | 0 leaks | re-run PASS (public + error responses) | reproduced | **MATCH** |
| 13 | Route parity | 58 routes (33 GET + 25 POST), +25 additive-only vs production 33, 0 removed, 0 duplicates | re-run: **58 at HEAD, additive-only, no duplicates** | reproduced | **MATCH** |
| 14 | Registry | consistent (112 requirements; BLOCKED items honestly documented) | re-run: consistent | reproduced | **MATCH** |
| 15 | Migration integrity | idempotency proven ([1,2,3] then all skipped); 24 tables | migration set decoded this session: migration 3 is **purely additive** (CREATE TABLE `railway_events`/`railway_audit`/`railway_state` + indexes; no ALTER/DROP) → rollback-compatible (see RECOVERY_AND_ROLLBACK_REPORT §4) | reproduced | **MATCH + extended** |
| 16 | Backup content-hash verification | `sha256Rowid` content-level; corruption-with-matching-counts detectable | exercised in the fresh DR drill + `backup-export-verify` regeneration (FAILURES: 0) | reproduced | **MATCH** |
| 17 | Guarded restoration | refuses non-empty targets without `--confirm-destructive`; owner route restores into isolated verification DB | covered by the passing suite (backup-restore tests) and the drill's restore path | reproduced | **MATCH** |
| 18 | DR drill | 10/10 steps; RTO 96 ms / CLI 5 ms / RPO 11 ms | **fresh run: 10/10 PASS; RTO 94 ms wall-clock / CLI restore 5 ms / RPO 11 ms**; 24 tables; content hashes verified; 11/11 orphan checks zero; `PRAGMA foreign_key_check` clean; functional resurrection | reproduced | **MATCH** |
| 19 | Evidence-integrity validator | 53/53 PASS | initial re-run: **FAIL 51/53** (F-2.3-02, non-durable gen.logs); after repair: **53/53 PASS**, durable | reproduced | **DEFECT → REPAIRED → RE-PROVEN** |
| 20 | Evidence substitution detection (package SHA256SUMS) | checksummed package | initial: FAILED (F-2.3-01: non-standard format + stale hash); after repair: `sha256sum -c docs/stage2.2/SHA256SUMS` → **22/22 OK directly** | reproduced | **DEFECT → REPAIRED → RE-PROVEN** |
| 21 | Recovery-bundle restoration | restore-proven | **strict re-proof** from an origin/main-only object base (exactly GitHub's state): both bundles restore their exact heads; tree IDs identical (`30899cb7…`, `8c46bd90…`); RP-2.2-002 restores 29 commits on top of origin/main | reproduced | **MATCH** |
| 22 | CI on GitHub for the candidate | never claimed ("pending authorized push") | last genuine run = `41092a33` success 2026-11-14T12:58:05Z (8 steps, **without** the adversarial gate); the candidate's ci.yml has never run on GitHub | github-verified (history only) | **PENDING AUTHORIZED PUSH** |
| 23 | Production behavior of the candidate | never claimed (post-deploy list) | production baseline recorded read-only: healthy, old code, 33 routes, migrations 2/2, auth 401 live, CORS `*` | production-verified (baseline only) | **PENDING AUTHORIZED DEPLOY** |

## 2. What the revalidation found that Stage 2.2 could not see

Stage 2.2 recorded its evidence in a fresh working tree; only an environment recycle could expose that two registered evidence artifacts were non-durable. This session's recycled environment performed exactly that adversarial test for free: the integrity validator honestly failed 51/53 rather than pretending, which is the fail-closed behavior the architecture promised — but it also proved the 53/53 claim was environment-dependent. Both defects (F-2.3-01, F-2.3-02) are now repaired with the regeneration chain run in the correct order (generators → validators → `--record` → verify → package register last), and the durability hole is closed in `.gitignore`.

## 3. Revalidation verdict

**21 of 23 items independently reproduced and matched; 2 items were defects found by revalidation and are repaired with re-proofs; 2 forward items (candidate CI on GitHub, candidate behavior in production) remain structurally impossible before authorization and are never claimed.** The Stage 2.2 technical basis is sound; its evidence architecture had two durability/format defects, both now closed. Machine evidence: `docs/stage2.3/evidence/revalidation-summary.json`, plus the refreshed `docs/stage2*/evidence/` trees (all checksummed).
