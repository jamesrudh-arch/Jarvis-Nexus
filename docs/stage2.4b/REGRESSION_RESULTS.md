# STAGE 2.4B — REGRESSION RESULTS (consolidated verification vs the Stage 2.4A baseline)

**Tree under test:** `stage2.4b-remediation` (main `6a788348` + this stage's remediation), isolated worktree, `bun install --frozen-lockfile` 902 packages, bun 1.3.14. **The full battery was executed twice** — first pass 2026-11-15T18:13Z, independent re-verification pass 2026-11-15T20:36Z on a fresh checkout — with identical results. Command record with exit codes: `evidence/reverify/SESSION_RECORD.md`; transcripts `evidence/suite-output.txt` (first pass) and `evidence/reverify/suite-output.txt` (re-verification pass). First-pass detail: `appendix/first-pass/FULL_REGRESSION_REPORT.md`, `appendix/first-pass/REGRESSION_TESTS.md`.

---

## 1. Results vs the Stage 2.4A baseline (every numerical difference explained)

| Check | Stage 2.4A | Stage 2.4B (both passes identical) | Difference explained |
|---|---|---|---|
| TypeScript (`tsc --noEmit`) | 0 errors | **0 errors** | none |
| Full suite (CI set) | 206 pass / 12 skip / 0 fail / 907 expects | **239 pass / 12 skip / 0 fail / 1194 expects** | +33 pass = exactly the 12 new lockout tests + 21 new backup-hardening tests; +287 expects = the same two files; **zero pre-existing tests lost** (0 fail); skip set identical (all 12 enumerated below) |
| Adversarial V1–V5 | 19/19 | **19/19** (129 expects) | unchanged gate, unmodified |
| Security suites (phase3, security.test.ts) | pass | **pass unmodified** | the remediation did not bend any existing test |
| Authn/authz matrix | 29/29 E2E | **35/35 E2E** (29 replicated verbatim + 6 new: SEC-12, SEC-13, DR-01..04) | one matrix-script route-list correction during the stage (AUTH-06 list), not a product change |
| Rate-limit tests | in phase3 | **pass unmodified** (boundary exact: 5 allowed then 429 + Retry-After; auth-fail boundary exact) | unchanged |
| Next.js production build | 14 routes, clean | **clean; standalone server.js + static present** (re-verified on both trees) | same surface |
| Production boot smoke | boots, serves | **/health 200; `migrations applied: 3`** (entrypoint equivalent; both trees) | same |
| Docker-context build | verified (2.4A, main tree) | **not locally executable — no docker binary in this sandbox; every Dockerfile step verified individually** (see §3) | honest correction, below |
| Migration compatibility | additive-only audit (2.4A) | **MIGRATIONS untouched this stage** — `git diff main..stage2.4b-remediation -- packages/db prisma` is empty; the 2.4A audit stands for the identical array | n/a |
| Backup & restore | 2.2-era G-01..G-03 | **G-01/G-02 unmodified-green; G-03 updated to the new encrypted-off-volume contract (a hardening change, documented); +21 hardening tests; drill PASS twice** | the single intentional contract change this stage |
| Lockout regression | none existed (the blind spot) | **+12 deterministic tests, zero real sleeps** | new |
| Git integrity & evidence checksums | 2.4A package | **branch pointers re-verified; evidence loop re-executed (stage2.3 OK, stage2.2 OK); SHA256SUMS regenerated over the final package** | this document set |

## 2. Every skip investigated (none silently dropped, none converted)

All 12 skips are `skipIf`-gated environmental skips, identical in identity to Stage 2.4A's 12 — none new, none a disguised failure:

| Skip | Gate | Status |
|---|---|---|
| railway LIVE ×8 (credentials, discovery, monitoring, usage, contract, rotation, read-only, rate-limit headers) | `RAILWAY_API_TOKEN` absent | Expected — no credentials this session (token loss recorded in the Stage 2.4A→2.4B transition; live-API behaviour is covered by the checksum-verified 2.3B evidence instead |
| JARVIS live objective (1) | live model credentials absent | Expected — echo-provider paths run instead |
| NAEI Scenario B (1) | live model credentials absent | Expected — documented in the test file header |
| cloudflare LIVE ×2 | `CLOUDFLARE_API_TOKEN` absent | Expected |

**Zero unexpected failures at any point in either pass.** No failing test was excluded or converted to a skip; no expensive test was rerun without a reason (the full suite re-ran because the environment was recycled — that is the reason, recorded in SESSION_RECORD).

## 3. Docker layer — honest statement (corrects a first-pass imprecision)

No docker binary exists in this sandbox (re-verified this pass). The image build itself is therefore locally UNVERIFIED for both trees and is covered for the **main tree** by Stage 2.4A's independent build verification. The first-pass report's phrase "identical tree for the Docker context" is **corrected here**: the remediation branch changes `packages/railway/src/backup.ts` and `apps/nexus-api/src/*`, which ARE copied into the image — so this branch's image content is NOT byte-identical to main's. What is actually true, and what the qualification rests on: (a) for the **CI branch** (`stage2.4a-ci`), the only change is `ci.yml`, which is outside the Docker context — that image IS byte-identical to main's, whose build Stage 2.4A verified; (b) for the **remediation branch**, the changed sources carry their own complete verification chain on this tree: typecheck 0 errors, the 239-test suite, and the entrypoint boot smoke (health 200, migrations 3) — i.e. every step the Dockerfile executes, verified on the exact sources that would be assembled. The layer-assembly step itself is the only untested-locally piece and is stated as such. No claim beyond this is made.

## 4. New regression files (deterministic; the clock is injected, never slept)

- `tests/integration/auth-lockout.test.ts` — 12 tests: activation; public routes during lockout; boundary timestamps (Retry-After exactly 30 at +30 s, exactly 1 at +59 999 ms; unlock at exactly +60 000 ms — the pre-fix-forever-429 point); the 70 s-equivalent scenario without restart; invalid-after-expiry (fresh window, honest 401, re-lock at limit); multi-identity isolation + global backstop (scope `global`, recovers at expiry); 20-parallel lockout (all 429, none leak); 30-parallel flood (exactly 3×401 + 27×429 — atomic); restart behaviour (fresh instance unlocked; same instance recovers by expiry); 12 000-identity memory flood (map grows past the sweep trigger, reclaims to ≤ tiny size after 130 s staleness + one request).
- `tests/integration/backup-hardening.test.ts` — 21 tests: codec round-trips; canary non-leakage into encrypted artifacts (positive and negative sanity); three tamper modes with distinct failure causes; key parsing (unset/invalid/valid); scheduler with key (encrypted verified on-volume + off-volume, byte-identical, no `.tmp` residue); honest listing; download with `x-backup-encrypted`; restore route decrypts + verifies in isolation without touching the live store; CLI success and fail-closed (exit 2, nothing written); tampered on-volume artifact rejected 400 before any write; stale `*.json.tmp` junk swept; two-sided retention (both dirs converge; every survivor parses as an encrypted envelope); no-key fail-visible (off-volume refused, dir never created, on-volume plaintext v1 continues, alert recorded, webhook payload sanitized); invalid key visible at boot; snapshot SAVEPOINT/RELEASE observed structurally; WAL isolation (a second connection's uncommitted rows never exported; appear only after COMMIT).
- Updated existing test (the only contract change, in the hardening direction, documented): `backup-restore.test.ts` G-03 — off-volume copies now REQUIRE a valid encryption key; the old assertion (plaintext copy) asserted the behaviour this stage deliberately removes.

## 5. Suites NOT modified (regression guard by absence)

`phase3-security.test.ts`, `phase4-backups.test.ts`, `backup-restore.test.ts` G-01/G-02 blocks, adversarial `verifier.test.ts` V1–V5, `security.test.ts`, `api.test.ts`, `railway-exercises.test.ts`, the persistence suite — all pass **unmodified**, proving the remediation preserved the existing contracts rather than bending tests around the fix. 206 (2.4A) + 33 (new) = 239 exactly; no number was massaged.

## 6. Adversarial self-challenge (condensed from the first pass, re-examined this pass)

(a) *Lockout tests might test the fix rather than the contract* — refuted by the twin time-real probes (defect reproduced pre-fix, dead post-fix, same scenario, same clock) plus unmodified 2.4A tests passing; (b) *the drill might prove the wrong thing* — it destroys volume A and recovers ONLY via volume B with content verification against a pre-loss reference; boundaries stated; (c) *encrypted artifacts might leak plaintext* — canary non-leakage tested both ways; (d) *the verification gate might be dead code* — three tamper modes trip it with distinct causes; CLI refusal asserted to write nothing; (e) *239 might hide a lost test* — 206 + 33 = 239 exactly, 12 skips the identical set, 0 fail; (f) *bigger numbers might mask a weakened test* — exactly one existing test modified (G-03), in the hardening direction, with the rationale documented. UNVERIFIED items were never converted to PASS anywhere.
