# STAGE 2.4B — REGRESSION TEST EVIDENCE

**Machine evidence:** `evidence/suite-output.txt` (full run transcript), `evidence/e2e-matrix.json` (35 cases), `evidence/repro-f24a01-pre.json`, `evidence/repro-f24a01-post.json`.

---

## 1. Full automated suite (the CI set)

Command: `bun test tests/unit tests/integration tests/scenarios tests/persistence tests/adversarial`
Environment: `stage2.4b-remediation` worktree post-fix, bun 1.3.14, offline providers (echo), no credentials.

| Metric | Stage 2.4A (main 6a788348) | Stage 2.4B (this branch) | Delta |
|---|---|---|---|
| pass | 206 | **239** | +33 (12 lockout + 21 backup-hardening; zero pre-existing tests lost) |
| skip | 12 | **12** | unchanged — same identities, see §3 |
| fail | 0 | **0** | — |
| expect() calls | 907 | **1194** | +287 |

## 2. New regression files (both deterministic; no real-time sleeps in the logic under test)

### tests/integration/auth-lockout.test.ts — 12 tests (F-2.4A-01)
Deterministic clock via the `nowFn` seam; window boundaries are crossed by ticking the clock. Covers: lockout activation (fail-closed, valid token refused in-window); public routes during lockout; boundary timestamps (Retry-After exactly 30 at +30 s, exactly 1 at +59 999 ms; unlock at exactly +60 000 ms — the pre-fix-forever-429 point); the Stage 2.4A 70 s-equivalent scenario without restart; invalid credentials after expiry (fresh window, honest 401, re-lock at limit); multi-identity isolation + the global backstop (a fresh identity with a valid token is refused while the shared budget is live, `x-lockout-scope: global`, recovers at window expiry); 20-request parallel lockout (all 429, none leak); 30-request parallel flood (exactly 3×401 + 27×429 — atomic, no over-counting); restart behaviour (fresh instance unlocked; the same instance recovers by expiry); 12 000-identity memory flood (map grows past the sweep trigger, then reclaims to ≤ 100 after 130 s staleness + one request; expired locked bucket deleted by the fix path).

### tests/integration/backup-hardening.test.ts — 21 tests (F-2.4A-06)
Codec: encrypt/decrypt round-trip preserving verifiability; canary row never leaks into the encrypted artifact (and DOES appear in the plaintext doc — sanity of the check); tamper ×3 (ciphertext byte, GCM tag with valid ciphertext hash, wrong key) each fail closed with distinct causes; `peekBackupFormat` three-shape discrimination; `parseBackupEncryptionKey` unset/invalid/valid. Scheduler (key configured): export 201 with verified encrypted on-volume + off-volume artifacts (byte-identical, no `.tmp` residue); honest listing (encrypted history, off-volume RPO state, zero alerts); download route with `x-backup-encrypted: true`; restore route decrypts + verifies in isolation without touching the live store (content hashes compared before/after); CLI restores the off-volume encrypted artifact and fails closed without the key (exit 2, no target written); tampered on-volume artifact rejected by the restore route (400 before any write); stale `*.json.tmp` junk swept on the next run; two-sided retention (both dirs converge to retention 3; every survivor parses as an encrypted envelope). No-key fail-visible: off-volume refused (dir never even created), on-volume continues as plaintext v1, alert recorded, webhook delivered with a sanitized payload (no key material, no URL echo); invalid key shape visible at boot. Snapshot transaction: SAVEPOINT/RELEASE wrap observed structurally; uncommitted rows from a second connection never exported (WAL isolation) and appear only after COMMIT.

### Updated existing test (contract change is the fix working)
`tests/integration/backup-restore.test.ts` G-03: off-volume copies now REQUIRE a valid encryption key — a plaintext artifact must never leave the volume. The test configures a runtime-generated key and asserts the copy is encrypted and byte-identical. This is a hardening change, not a weakening: the old assertion (plaintext copy) asserted the behaviour this stage deliberately removes.

## 3. Every skip investigated (directive §6)

All 12 skips are `skipIf`-gated environmental skips, identical in identity to Stage 2.4A's 12; none is new, none is a silent drop:

| Skip | Gate | Status |
|---|---|---|
| railway LIVE ×8 (credentials, discovery, monitoring, usage, contract, rotation, read-only, rate-limit headers) | `RAILWAY_API_TOKEN` absent | Expected — no credentials this session (token loss recorded in the Stage 2.4A→2.4B transition); live-API behaviour is covered by the checksum-verified 2.3B evidence instead |
| JARVIS live objective (1) | live model credentials absent | Expected — echo-provider paths run instead |
| NAEI Scenario B (1) | live model credentials absent | Expected — documented in the test file header |
| cloudflare LIVE ×2 | `CLOUDFLARE_API_TOKEN` absent | Expected |

No unexpected failure occurred at any point in the stage; every command whose output is cited in the reports is reproduced in the evidence files or the session record.

## 4. End-to-end verification matrix

`scripts/stage24b/e2e_matrix.ts` → `evidence/e2e-matrix.json`: **35/35 PASS** — all 29 Stage 2.4A cases replicated with identical expected semantics (APP-01..07, AUTH-01..06, SEC-01..11, DB-01..04) plus the 6 new Stage 2.4B cases (SEC-12 lockout-expiry recovery through real HTTP, SEC-13 global backstop, DR-01..04). One matrix-construction correction during the stage: AUTH-06's route list initially included `GET /railway/monitor` (does not exist → 404) and the public-by-design routes; corrected to the genuinely owner-gated GET set — the route surface itself was never at fault.

## 5. Reproduction probes (time-real, both directions)

- `evidence/repro-f24a01-pre.json` — pre-fix tree (worktree pinned to main `6a788348`): valid key 429 after 70 s; fresh instance 200 (restart was the only recovery). **DEFECT REPRODUCED.**
- `evidence/repro-f24a01-post.json` — remediated tree, identical scenario: valid key **200** after 70 s; wrong key 401; public routes 200. **DEFECT NOT REPRODUCED.**

## 6. Suites NOT modified (regression guard by absence)

`phase3-security.test.ts` (lockout activation semantics), `phase4-backups.test.ts` (export/retention/listing contracts), `backup-restore.test.ts` G-01/G-02 blocks, adversarial `verifier.test.ts` V1–V5, `security.test.ts`, `api.test.ts`, `railway-exercises.test.ts`, persistence suite — all pass unmodified, proving the remediation preserved the existing contracts rather than bending tests around the fix.
