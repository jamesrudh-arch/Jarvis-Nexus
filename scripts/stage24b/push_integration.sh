#!/usr/bin/env bash
# Stage 2.4B Phase Three — guarded push of the integrated main to GitHub.
#
# Authorized by the Stage 2.4B production directive. Mirrors the Stage 2.3B
# seven-gate controlled-push pattern. Requires a GitHub token with contents:write
# for jamesrudh-arch/Jarvis-Nexus in GITHUB_TOKEN (env or /home/z/my-project/.env.local).
# The token is never printed or logged.
#
# Gates (all must pass; any failure aborts BEFORE the push):
#   G1  local main is the expected integrated commit (fast-forward only)
#   G2  working tree clean; no in-progress merge
#   G3  origin/main still at the approved base 6a788348 (no remote drift,
#       no overwrite of production changes)
#   G4  push is a single refspec refs/heads/main, no force, no tags
#   G5  no credentials/secrets in the pushed delta (token-pattern scan)
#   G6  the pushed tree's evidence loop verifies (sha256sum -c)
#   G7  post-push: origin/main == integrated SHA (independent ls-remote)
#
# Usage: bash scripts/stage24b/push_integration.sh <expected-local-sha>
set -euo pipefail

REPO=/home/z/my-project
EXPECTED_SHA="${1:?usage: push_integration.sh <expected-local-sha>}"
#   G3  origin/main still at the approved base (no remote drift,
#       no overwrite of production changes). Base history: 6a78834 (the
#       250ca25 integration push) -> 12f2a33 (after the Stage 2.4B
#       final-execution + CI-qualification pushes, CI runs 43826898376 /
#       43829977870 green) -> 3751c4c (supabase infrastructure, CI run
#       43834983399 green) — the pin tracks the last VERIFIED remote state.
BASE_SHA="3751c4c8993650d73bb13953513dfb0da71a24f8"
cd "$REPO"

# --- token (never printed) ---
TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f .env.local ]; then
  TOKEN="$(grep -E '^(export )?GITHUB_TOKEN=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
if [ -z "$TOKEN" ]; then echo "[FAIL] no GITHUB_TOKEN (env or .env.local) — owner action required"; exit 2; fi
export GITHUB_TOKEN="$TOKEN"

# --- G1 ---
LOCAL_SHA="$(git rev-parse main)"
if [ "$LOCAL_SHA" != "$EXPECTED_SHA" ]; then echo "[FAIL] G1: main ($LOCAL_SHA) != expected ($EXPECTED_SHA)"; exit 1; fi
if ! git merge-base --is-ancestor "$BASE_SHA" main; then echo "[FAIL] G1: approved base $BASE_SHA is not an ancestor — not a fast-forward"; exit 1; fi
echo "[OK] G1: main = $LOCAL_SHA (fast-forward from $BASE_SHA)"

# --- G2 ---
if [ -n "$(git status --porcelain)" ]; then echo "[FAIL] G2: working tree not clean"; exit 1; fi
if [ -f .git/MERGE_HEAD ]; then echo "[FAIL] G2: merge in progress"; exit 1; fi
echo "[OK] G2: tree clean"

# --- G3 ---
REMOTE_SHA="$(git ls-remote origin refs/heads/main | cut -f1)"
if [ "$REMOTE_SHA" != "$BASE_SHA" ]; then echo "[FAIL] G3: origin/main ($REMOTE_SHA) != approved base ($BASE_SHA) — remote drifted; manual reconciliation required"; exit 1; fi
echo "[OK] G3: origin/main still at $BASE_SHA"

# --- G5 (before G4's push) ---
LEAKS="$(git diff "$BASE_SHA"..main | grep -cE '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|rlwy_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)' || true)"
if [ "$LEAKS" != "0" ]; then echo "[FAIL] G5: $LEAKS credential-pattern match(es) in the delta — refusing to push"; exit 1; fi
echo "[OK] G5: no credential patterns in the pushed delta"

# --- G6 ---
for sums in docs/stage2.4b/SHA256SUMS docs/stage2.3/SHA256SUMS docs/stage2.2/SHA256SUMS; do
  if [ -f "$sums" ]; then sha256sum --quiet -c "$sums" || { echo "[FAIL] G6: $sums does not verify"; exit 1; }; fi
done
echo "[OK] G6: evidence checksums verify on the pushed tree"

# --- G4 + push ---
echo "[..] G4: pushing single refspec refs/heads/main (no force, no tags)"
git push origin refs/heads/main:refs/heads/main 2>/tmp/24b_push_err.log \
  || { echo "[FAIL] G4: push failed:"; tail -5 /tmp/24b_push_err.log; exit 1; }
echo "[OK] G4: push executed"

# --- G7 ---
sleep 3
POST_SHA="$(git ls-remote origin refs/heads/main | cut -f1)"
if [ "$POST_SHA" != "$LOCAL_SHA" ]; then echo "[FAIL] G7: origin/main ($POST_SHA) != $LOCAL_SHA after push"; exit 1; fi
echo "[OK] G7: origin/main == $LOCAL_SHA — push verified"

echo ""
echo "PUSH COMPLETE: $LOCAL_SHA"
echo "Next: GitHub Actions ci.yml runs on this push (verify + production-build +"
echo "visual-app-build + advisory osv-scanner). Verify via the Actions API/UI,"
echo "then execute scripts/stage24b/deploy_and_verify.py precheck|deploy|verify."
