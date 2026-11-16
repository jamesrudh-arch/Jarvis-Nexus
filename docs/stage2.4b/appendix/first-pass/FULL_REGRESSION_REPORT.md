# STAGE 2.4B — FULL REGRESSION REPORT

Tree under test: `stage2.4b-remediation` (main `6a788348` + this stage's remediation), isolated worktree, frozen-lockfile install (902 packages), bun 1.3.14. Every command's output is preserved in `evidence/` or the session record; nothing is claimed from memory.

---

## 1. Results vs Stage 2.4A (directive §6: compare and investigate every deviation)

| Check | Stage 2.4A | Stage 2.4B | Investigated? |
|---|---|---|---|
| TypeScript validation (`tsc --noEmit`) | 0 errors | **0 errors** | n/a |
| Full suite (CI set) | 206 pass / 12 skip / 0 fail / 907 expects | **239 pass / 12 skip / 0 fail / 1194 expects** | the +33 = exactly the 12 lockout + 21 backup-hardening additions; zero pre-existing tests lost (0 fail); skip set identical — all 12 enumerated and accounted in REGRESSION_TESTS §3 (credential-gated: no tokens this session; live-API behaviour covered by the checksum-verified 2.3B evidence) |
| Next.js visual build | 14 routes | **compiled clean; standalone server.js + static present** | same surface |
| Production boot smoke (image entrypoint equivalent) | boots, serves | **/health 200; `migrations applied: 3`** | same |
| Docker-context build | verified (Stage 2.4A report) | identical tree for the Docker context (this stage changes no Dockerfile, no lockfile, no `packages/db`); 902-pkg frozen install re-verified | n/a |
| Adversarial V1–V5 | 19/19 | **19/19** | unchanged gate |
| Security suites (phase3, security.test.ts) | pass | **pass unmodified** — the remediation did not bend any existing test |
| Database migration tests | additive-only audit (2.4A) | **MIGRATIONS untouched this stage** (no new migration; the 2.4A audit stands for the identical array); restart-persistence suite green; drill exercises migrate-on-restore (24 tables, FK clean) | n/a |
| Backup & restore tests | 2.2-era G-01..G-03 | **G-01/G-02 unmodified-green; G-03 updated to the new encrypted-off-volume contract (a hardening change, documented); +21 new hardening tests** | the single intentional contract change this stage |
| Authentication lockout regression | none existed (the blind spot) | **+12 deterministic tests, zero real sleeps** | new |
| E2E matrix | 29/29 | **35/35** (29 replicated + 6 new; one matrix-script route-list correction, not a product change) | AUTH-06 list fixed |
| Independent off-volume restore drill | not possible (pre-remediation) | **PASS** (OFFVOLUME_RESTORE_EVIDENCE) | new |

## 2. Unexpected failures or skips

**None.** Zero unexpected failures across the entire stage (every suite, build, drill, matrix). All 12 skips are the pre-existing credential-gated set — individually listed in REGRESSION_TESTS §3; none newly introduced; none silently dropped.

## 3. Commands and their preserved outputs

- `bun run typecheck` → 0 errors (twice: mid-stage after each fix batch; final).
- `bun test tests/unit tests/integration tests/scenarios tests/persistence tests/adversarial` → `evidence/suite-output.txt` (239/12/0/1194).
- `bun test tests/integration/auth-lockout.test.ts` → 12/12 (transcript; re-run as part of the full suite).
- `bun test tests/integration/backup-hardening.test.ts` → 21/21 (transcript; re-run as part of the full suite).
- `bun scripts/stage24b/repro_f24a01.ts` (pre-fix worktree at `6a788348`, post-fix branch) → `evidence/repro-f24a01-{pre,post}.json`.
- `bun scripts/stage24b/drill_offvolume_restore.ts` → `evidence/drill-offvolume-restore.json` (PASS).
- `bun scripts/stage24b/e2e_matrix.ts` → `evidence/e2e-matrix.json` (35/35).
- `bun scripts/stage24b/probe_xff_edge.ts` → `evidence/xff-edge-probe.json` (with the corrected, source-verified interpretation).
- `bunx next build` (remediation tree and ci-branch tree) → clean, standalone + static asserted.
- Boot smoke on both trees → `/health` 200, `migrations applied: 3`.
- `bun install --frozen-lockfile` on both trees → 902 packages, no lockfile drift; `bun audit` → no vulnerabilities.
- CI verify-job steps on the `stage2.4a-ci` worktree → `evidence/ci-qualification.json`.

## 4. Adversarial self-challenge (summary; full reasoning embedded across the reports)

(a) *"The lockout tests could be testing the fix rather than the contract"* — refuted by running the identical scenario time-real against the pre-fix tree (DEFECT REPRODUCED) and the post-fix tree (NOT REPRODUCED), plus 35/35 E2E with unchanged pre-existing cases; (b) *"the drill might prove the wrong thing"* — it destroys volume A and recovers ONLY via volume B, with content verified against a pre-loss reference, and its boundaries are stated (sandbox FS ≠ production volume topology); (c) *"encrypted artifacts might still leak plaintext"* — canary non-leakage tested positively and negatively; (d) *"verification gate might be dead code"* — tamper tests prove each of the three integrity checks trips with a distinct cause; the CLI-refusal path is asserted to write nothing; (e) *"the XFF probe's inconclusive verdict might hide a finding"* — the source-level explanation is committed alongside the raw run output; no edge behaviour is claimed; (f) *"the 239-pass suite might hide a weakened test"* — only ONE existing test was modified (G-03), in the hardening direction, with the rationale documented; everything else is unmodified-green; (g) *"bigger numbers might mask a lost test"* — 206 + 33 = 239 exactly, and the 12 skips are the identical set. UNVERIFIED items were never converted to PASS anywhere in this stage.
