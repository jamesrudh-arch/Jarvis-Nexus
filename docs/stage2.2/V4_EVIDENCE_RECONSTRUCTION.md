# STAGE 2.2 — V4 EVIDENCE RECONSTRUCTION

**Document ID:** STAGE22-V4-001
**Scope:** directive §6 (V4 evidence-gate remediation).

---

## 1. The defective architecture (as inherited)

- The entire Stage 2 evidence set (evidence artifacts, 7 phase reports, recovery manifest and RP-STAGE2-001 artifacts) was written only to `download/` — **gitignored** (`.gitignore:34`), wiped by the environment.
- The V4 evidence-provenance tests (`tests/adversarial/verifier.test.ts`, added at `a4f8b79`) hard-depended on those paths → 3 failures: measured suite 188 pass / 12 skip / **3 fail** / 776 assertions; the claimed 191/0/805 baseline was unreproducible.
- The original artifact-generation process: session-authored reports and session-run probe outputs written directly into `download/` — **no committed generator** for the reports (the root durability defect); some data generators were committed (e.g. `scripts/stage2_recovery_manifest.py`) but their outputs still went to the volatile tree.

## 2. The corrected architecture

**Durability rule (twice proven empirically): only git-tracked files survive environment wipes.** Applied as:

1. **Evidence tree moved to git-tracked locations:** `docs/stage2/evidence/` + `docs/stage2/reports/` (+ `docs/stage2.2/…` for Stage 2.2). `download/` is a non-authoritative mirror only, never counted as protection.
2. **V4 gate repointed at unchanged assertion strength:** ≥6 non-empty evidence files; the 7 named phase reports each >500 bytes; every `recovery_manifest.json` artifact exists and >1000 bytes. Only the location changed — the gate is not weaker.
3. **Deterministic generation:** every machine artifact is produced by a committed generator (`scripts/stage22_evidence_generate.sh` and friends), stamped with `generatedAt` + `generatedAtHead`, re-runnable.
4. **Substitution guard:** `docs/stage2/evidence/SHA256SUMS` (recorded via `--record`, verified by default). Any post-recording mutation → validator FAILS. Proven adversarially: a one-line tamper was detected (FAIL), restoration verified (PASS).

## 3. Honest regeneration — never backdated, never fabricated

Every regenerated report carries a `REGENERATED 2026-11-15` banner, states its reconstruction inputs, and explicitly classifies the unrecoverable. The evidence-integrity validator asserts the banner on all 7 reports (guards against regenerated documents silently posing as originals).

- **Reproducible and regenerated:** route parity (58 routes, +25 additive vs production), registry consistency (112 requirements), typecheck (0 errors), git state, auth matrix (37/37 source-derived), backup export + product verify through the real application path, security suite, DR drill.
- **Explicitly classified as unrecoverable:** the original reports' bytes and timestamps; RP-STAGE2-001 and RP-FC-001 artifacts (permanent loss — regeneration would create NEW artifacts, not recover the originals); the original 191/0/805 measurement (its evidence substrate no longer exists — the honest current measurement is authoritative).

## 4. Evidence-integrity validator

`scripts/stage22_evidence_validate.ts` — per the directive's required properties:

| Requirement | Implementation |
|---|---|
| Required files exist | 7 reports + manifest + ≥6 evidence files asserted |
| JSON schemas valid | per-format required fields (`format`, `generatedAt`, `generatedAtHead`, `verdict`) |
| Manifest references resolve | `artifacts[].path` exists with exact byte count; sha256 recomputed and compared |
| SHA-256 checksums match | SHA256SUMS register; mismatch = substitution detected |
| Timestamps consistent | parseable, not future-dated (5 min skew) |
| Git commit references exist | `git cat-file -e` on every `generatedAtHead` |
| Recovery artifacts complete | bundle exists with exact bytes + sha256 |
| No silent substitution | verify mode fails on ANY divergence; missing registered file also fails |

Latest run: **50/50 checks PASS** (verify mode). Tamper self-test: detection FAIL then restore PASS — the guard is real.

## 5. Result

- V4: **green** (19/19 adversarial tests; the full suite is 206 pass / 12 skip / 0 fail / 905 assertions / 27 files).
- The claimed-vs-measured assertion count is recorded honestly: the lost baseline claimed 805 assertions at 191 pass; the current true state is 905 assertions at 206 pass (the +15 delta is the new backup-restore adversarial tests; V4 itself passes at unchanged strength). No false equivalence is drawn with the unreproducible historical number.

**Acceptance criterion (directive §6): "V4 passes using genuine, reproducible evidence. Any unrecoverable historical evidence remains explicitly classified as unavailable." — MET.**
