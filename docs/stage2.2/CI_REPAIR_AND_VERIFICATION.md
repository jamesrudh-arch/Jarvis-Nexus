# STAGE 2.2 — CI REPAIR AND VERIFICATION

**Document ID:** STAGE22-CI-001
**Scope:** directive §5 (GitHub Actions CI remediation workstream).

---

## 1. The claimed defect — and its refutation

**Stage 2.1 claimed (F-COM-03 / BLK-01 / D-2.1-01):** `.github/workflows/ci.yml` contained a corrupted branch filter `branches: ain]` (both `push` and `pull_request`), introduced at already-pushed `945a78d`, leaving "CI silently dead on GitHub", with a "byte-exact `cat -A` proof".

**Stage 2.2 finding: the claim is FALSE.** Evidence, in order of strength:

1. `git show 945a78d:.github/workflows/ci.yml | od -c` → the blob contains the bytes `b r a n c h e s : [ m a i n ]` — the filter was **always correct** in the pushed commit.
2. `git log --all -S 'branches: ain]' -- .github/workflows/ci.yml` → **empty**: no commit in any ref ever contained the corrupted string.
3. `git show cd46b69 -- .github/workflows/ci.yml | od -c` → the final-closure diff context also shows the correct filter.
4. The current working tree matches HEAD exactly (`git status` clean; `od -c` of the file shows `branches: [main]`).

**Root cause of the false finding — a display artifact, twice reproduced:** in this environment, free-text bash output (`cat`, `cat -A`, plain `git show`) loses the two characters `[m` from a contiguous `branches: [main]` string in transit to the reader — rendering `branches: ain]`. The Stage 2.1 audit read that rendering as bytes, then "confirmed" it with `cat -A` — the same lossy channel. Byte-level channels (`od -c`, Python byte counts, structured parsers) preserve the truth. The Stage 2.2 reconstruction initially REPEATED the same error (confirming BLK-01 from the same display); the independent re-challenge caught it.

**Standing rule adopted (engineering + verification):** gate-critical files are verified with `od -c` / structured parsers, never free-text `cat` output. The Stage 2.1 documents were left unedited as historical records; this document is the correction of record.

## 2. The real defect that WAS found (F-2.2-CI-01)

While validating the workflow locally, the execution evidence exposed a genuine defect the Stage 2.1 audit missed:

- The CI test step ran `bun test tests/integration tests/scenarios tests/persistence` — **`tests/adversarial` was omitted**.
- Proof: at a moment when the adversarial suite had 3 failures (V4 red), the CI integration step exited **0** — CI would have been green on GitHub while the repository's own independent verifier was red.
- Consequence: the "green CI" signal would not have represented the release gate it claims to be.

**Repair:** an explicit CI step now runs the adversarial gate (`bun test tests/adversarial`), with an in-file comment recording the defect. From this commit on, CI fails whenever the repository's own V1–V5 gate fails.

## 3. Independent validation (not "the YAML parses")

`scripts/stage22_ci_validate.py` (committed; PyYAML-based) — 29 checks, all passing:

- YAML parses; the YAML-1.1 `on`→`True` quirk is handled explicitly.
- Workflow structure: name, least-privilege permissions (`contents: read`), one job, pinned runner image, bounded timeout.
- **TRIGGER PROOF** with GitHub's branch-filter semantics (fnmatch): push to `refs/heads/main` fires; push to any other branch does not; PR targeting main fires; PR targeting develop does not.
- Action refs pinned to major-version tags (`actions/checkout@v4`, `oven-sh/setup-bun@v2`); no floating refs.
- No `secrets.*` references (CI is credential-less by design); the live-credential tests self-skip by three real mechanisms (conditional `test.skip` helper in railway-live; `test.skipIf(!process.env.CLOUDFLARE_API_TOKEN)` guards in api/model-fabric) — each asserted.
- No conditionally-skipping steps; every run-step target exists in the repository (package.json scripts, tool files, test directories, `bun.lock` for `--frozen-lockfile`).
- **SELF-TEST:** a synthetic corrupt filter `branches: ain]` is proven NON-matching — the validator would have caught a REAL corruption; combined with §1 this closes the loop on the phantom finding.
- dependabot.yml structurally validated.

## 4. Local validation vs GitHub execution — the honest boundary

| Claim | Status |
|---|---|
| Workflow structurally valid, correctly triggered for push/PR on main | **VERIFIED locally** (validator, 29 checks) |
| Workflow steps execute correctly (install → typecheck → registry → unit → integration+scenario → adversarial) | **VERIFIED locally** with recorded exit codes (adversarial step was honestly RED before Workstream B; GREEN after) |
| A real GitHub Actions run has occurred for the current push set | **NOT VERIFIED — cannot be triggered without pushing, which is owner-gated (B-01). This is a standing, explicit limitation, not a claim.** |

If the owner authorizes the push, the first genuine GitHub Actions run closes the last item; until then, "CI is green on GitHub" must never be claimed.

## 5. Acceptance criteria (directive §5) — disposition

**"The repaired workflow is structurally valid, correctly triggered and locally validated, with GitHub execution still awaiting authorized push."** — MET (with the correction that no repair to the trigger was ever needed; the repair that landed was the adversarial-gate omission).
