# STAGE 2.4B — CI REMEDIATION REVIEW (qualification of `stage2.4a-ci` @ 773ab14)

**Machine evidence:** `evidence/ci-qualification.json` (item-by-item results of this review).
**Branch under review:** `stage2.4a-ci` = `773ab14d2c77a320ff3af3f03fc3cd1768a61bcf`, verified byte-identical to its reference before any work began (baseline revalidation, this session). Diff vs main: exactly one file, `.github/workflows/ci.yml`, +78 lines. Inspected in a dedicated isolated worktree; **not merged, not pushed** (directive §4/§7).

---

## 1. The 13-item directive checklist

| Item | Verdict | Evidence |
|---|---|---|
| Docker production build | DESIGNED; locally UNVERIFIED (sandbox has no docker binary) | the workflow builds the exact deploy artifact; the identical tree (branch changes only ci.yml, which is outside the Docker context) is independently build-verified in Stage 2.4A PRODUCTION_BUILD_VERIFICATION |
| Container startup smoke test | PASS (equivalent) | image entrypoint `bun apps/nexus-api/src/main.ts` booted on a temp data dir; /health 200; the Docker layer itself is the only locally unverifiable piece — stated, not hand-waved |
| Health endpoint verification | PASS | HTTP 200 on /health; `overall` present; `migrations applied: 3` asserted in /health/detailed; 200+degraded accepted by design (fail-visible when secrets absent — asserting "healthy" would make CI fail on missing optional secrets, the wrong contract) |
| Next.js visual build | PASS | `bunx next build` clean; `.next/standalone/server.js` and `.next/static` asserted present |
| TypeScript validation | PASS | `tsc --noEmit`, 0 errors |
| Unit tests | PASS | 100/100 |
| Integration tests | PASS | 89 pass + 10 credential-gated skips (the known environmental set), 0 fail |
| Adversarial tests (V1–V5) | PASS | 19/19 |
| Evidence integrity | PASS | the workflow's own loop executed: stage2.3 + stage2.2 verified OK; stage2.4a + stage2.3b correctly "skip (not present)" — those packages live on their evidence branches; presence-tolerant by design |
| Dependency integrity | PASS | `bun install --frozen-lockfile` 902 packages; no lockfile change on the branch; `bun audit` clean |
| Correct workflow triggers | PASS | `on.push.branches: [main]`, `on.pull_request.branches: [main]`, `permissions: contents: read` — verified from the raw file (the shell's `cat` had earlier mangled the display; the Read tool shows the true `branches: [main]`) |
| Correct branch filters | PASS | as above; evidence branches deliberately do not consume CI |
| Failure propagation / no skipped critical jobs | PASS | `set -eu` in multi-line steps; explicit `exit 1` on the health/migrations/standalone assertions; **zero** `continue-on-error` anywhere (grep-verified); three unconditional jobs |

## 2. Findings (recorded, neither is a gate)

- **F-2.4B-CI-01 (LOW, documentation):** the Stage 2.4A design doc (`CI_BUILD_GAP_REMEDIATION.md` §1/§4) claims an *advisory osv-scanner step*; the committed workflow contains none (125 lines; zero matches for osv/scan/continue-on-error). The 2.4A document overstates the implemented workflow. Recommended: add the advisory step (or correct the doc) in the same commit that merges this branch. Independently: `bun audit` (npm advisory DB) ran clean on the remediation tree this stage, so no known vulnerability is being waved through meanwhile.
- **F-2.4B-CI-02 (INFO):** the evidence-integrity loop is a hard-coded list of the packages existing at design time; each future stage package extends it by one line. When merging `stage2.4b-remediation`, add `docs/stage2.4b/SHA256SUMS`.

## 3. Genuine GitHub Actions execution

**Not performed — by design.** The workflow triggers only on push/PR to `main`; running it for real requires an authorized push, which this stage explicitly forbids. The qualification above is code review + local execution of every locally executable step; the first genuine Actions run happens after the owner's separate merge authorization (at which point the pipeline guards every subsequent push).

## 4. Verdict

**QUALIFIED** for the owner's merge decision, with findings F-2.4B-CI-01/02 recorded and the Docker layer's local non-execution stated honestly (covered for the identical tree by Stage 2.4A's independent build verification). This stage does not merge or push it.
