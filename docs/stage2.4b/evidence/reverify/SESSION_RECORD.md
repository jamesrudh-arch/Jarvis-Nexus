# Stage 2.4B — Independent Re-verification Pass (Session 2)

**Purpose.** The Stage 2.4B remediation was engineered and verified in a first working
session (commit `e1d9b48`, evidence in `../` and `../../appendix/first-pass/`). The
operating environment was then recycled. This directory records a **complete,
independent re-execution of every verification claim** on a fresh checkout of
`stage2.4b-remediation` — not a re-reading of the first session's outputs. A claim
that survives two independent executions at different times, on fresh installs, is
qualitatively stronger than either run alone; a claim that failed to reproduce would
have been reported as FAILED. Every command below was run in this session with its
actual exit code recorded. Nothing was copied forward from the first pass.

**Environment.** Fresh worktree of `stage2.4b-remediation` @ `e1d9b48` (re-created
after a stale-worktree prune; branch pointer verified unchanged).
`bun install --frozen-lockfile` → 902 packages, exit 0, no lockfile drift.
bun 1.3.14 (0d9b296a). Baseline re-verified before any work: `main` @
`6a788348a6aa7f59558e41143b3b786858548aff` (= `origin/main`, unpushed-state intact),
`stage2.4a-evidence` @ `215cf1f86e0d…`, `stage2.4a-ci` @ `773ab14d2c77…`.

## Command record (actual commands, actual exit codes)

| # | Command (run in the worktree) | Exit | Result → artifact |
|---|---|---|---|
| 1 | `bun install --frozen-lockfile` | 0 | 902 packages, no drift |
| 2 | `bun run typecheck` | 0 | 0 errors (remediation tree) |
| 3 | `bun test tests/unit tests/integration tests/scenarios tests/persistence tests/adversarial` | 0 | **239 pass / 12 skip / 0 fail / 1194 expects** (251 tests, 29 files, 8.58 s) → `suite-output.txt` |
| 4 | `bun scripts/stage24b/repro_f24a01.ts --label pre-fix` (detached worktree @ `6a788348`, probe script checked out from the branch) | 0 | **DEFECT REPRODUCED** — valid key → 429 after real 70 s wait (`after70sValidKey: 429`) → `repro-f24a01-pre.json` |
| 5 | `bun scripts/stage24b/repro_f24a01.ts --label post-fix` (remediation tree; ran concurrently with #4 on the same clock) | 0 | **DEFECT NOT REPRODUCED** — valid key → 200 after 70 s; wrong key → honest 401 (`after70sValidKey: 200`) → `repro-f24a01-post.json` |
| 6 | `bun scripts/stage24b/drill_offvolume_restore.ts` | 0 | **PASS** — total volume loss recovered exclusively from the verified encrypted volume-B artifact; zero content mismatches vs pre-loss reference; canary row back; post-restore backup cycle 201; RTO 100 ms (CLI 88 ms + boot 2 ms) → `drill-offvolume-restore.json` |
| 7 | `bun scripts/stage24b/e2e_matrix.ts` | 0 | **35/35 pass** (incl. SEC-12 post-expiry recovery and SEC-13 global backstop) → `e2e-matrix.json` |
| 8 | `bun scripts/stage24b/probe_xff_edge.ts` | 0 | F-2.4A-02 stays **UNVERIFIED pre-deploy** (proven unanswerable against the current deployment: the deployed code has no XFF consumer); bounded by the global backstop → `xff-edge-probe.json` |
| 9 | CI-branch worktree @ `773ab14`, `bun install --frozen-lockfile` | 0 | 902 packages |
| 10 | `bun run typecheck` (CI tree) | 0 | 0 errors |
| 11 | `bun tools/registry-validate.ts` (CI tree) | 0 | registries consistent |
| 12 | `bun test tests/unit` (CI tree) | 0 | 100 pass / 2 skip / 349 expects |
| 13 | `bun test tests/integration tests/scenarios tests/persistence` (CI tree) | 0 | 89 pass / 10 skip / 429 expects |
| 14 | `bun test tests/adversarial` (CI tree) | 0 | 19 pass / 129 expects |
| 15 | evidence-integrity loop (`sha256sum --quiet -c`, the workflow's own step, CI tree) | 0 | stage2.3 OK + stage2.2 OK; stage2.4a + stage2.3b correctly "skip (not present)" (their packages live on their evidence branches) |
| 16 | `bun audit` (CI tree; network, npm advisory DB) | 0 | No vulnerabilities found |
| 17 | boot smoke, image-entrypoint equivalent, CI tree (`PORT=3177`, temp data dir) | 0 | `/health` 200; `overall` present; `migrations applied: 3` |
| 18 | `bunx next build` (CI tree) | 0 | clean; `.next/standalone/server.js` + `.next/static` present |
| 19 | boot smoke, remediation tree (`PORT=3178`) | 0 | `/health` 200; `migrations applied: 3` |
| 20 | `bunx next build` (remediation tree) | 0 | clean; standalone + static present |
| 21 | structural checks on `.github/workflows/ci.yml` @ `773ab14` (byte-level `od` dump of the branch filters; `grep` for `continue-on-error`; job enumeration) | 0 | `on.push/pull_request.branches: [main]` confirmed at byte level (a display layer strips the `[m` sequence — the same artifact Stage 2.2 documented; the octal dump shows `[   m   a   i   n   ]`); `permissions: contents: read`; **zero** `continue-on-error`; three unconditional jobs (verify / production-build / visual-app-build); 125 lines |
| 22 | `git diff --stat main..stage2.4b-remediation -- packages/db prisma` | 0 | empty — no migration changes this stage |
| 23 | `git rev-parse origin/main stage2.4a-evidence stage2.4a-ci` | 0 | `6a78834…`, `215cf1f…`, `773ab14…` — all preserved; no push occurred |

## Docker layer (honest, unchanged from the first pass)

No docker binary exists in this sandbox (verified again this session). The image
build itself therefore remains locally UNVERIFIED for both trees. What IS verified,
per tree, is every step the Dockerfile executes: `bun install --frozen-lockfile`
(902 packages, no drift — both trees) and the entrypoint
`bun apps/nexus-api/src/main.ts` boot smoke (both trees, /health 200 +
`migrations applied: 3`). Unchanged inputs: Dockerfile, bun.lock, tsconfig,
packages/db, prisma (verified empty diff for the migration surfaces). Changed
inputs vs main — `packages/railway/src/backup.ts`, `apps/nexus-api/src/*`,
`packages/railway/src/index.ts` — are fully covered by typecheck + the 239-test
suite + boot smoke. Stage 2.4A's independent build verification covered the main
tree; the first-pass report's phrase "identical tree for the Docker context" is
corrected here: the Docker **context** is not byte-identical (the remediation
changes packages/railway and apps/nexus-api, which ARE copied into the image); what
is identical is the build **recipe** and the migration surface, and the changed
sources carry their own verification chain. No claim beyond this is made.

## Verdict of the re-verification pass

**Every load-bearing claim of the first pass reproduced exactly**: suite counts
(239/12/0/1194 — first pass: 239/12/0/1194), defect-dead proof in both directions,
drill PASS with zero content mismatches, E2E 35/35, all CI-branch local jobs, both
boot smokes, both Next builds, clean audits, preserved branch pointers. No
divergence was found. The evidence package in the top-level documents therefore
rests on two independent executions, and the first-pass artifacts (preserved
verbatim in `../` and `../../appendix/first-pass/`) remain valid history.
