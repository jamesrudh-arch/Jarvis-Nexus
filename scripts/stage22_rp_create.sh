#!/bin/bash
# STAGE 2.2 / R0 — Recovery point RP-2.2-001.
# Purpose: give the 22 unpushed commits a DURABLE recovery point before any
# remediation begins. The Stage 2.1 lesson (twice learned): artifacts left in
# gitignored download/ are wiped by the environment; only git-tracked files
# survive. Therefore the PRIMARY artifact here is a THIN bundle (main minus
# origin/main) small enough to be COMMITTED TO GIT.
# Full-state bundle + legacy /tmp bundles are mirrored to download/ (user-visible,
# NON-DURABLE, labeled as such) — their durable preservation is owner decision
# D-2.1-04 (168 MB in git is a real cost the engineer will not impose unilaterally).
set -euo pipefail
cd /home/z/my-project

RP_ID=${1:?usage: bash scripts/stage22_rp_create.sh <RP-ID e.g. RP-2.2-00N> [purpose]}
# Stage 2.3 fix: purpose (arg 2, default below) and unpushedCommits are now
# DYNAMIC — the Stage 2.2 version hardcoded "22 unpushed commits" and a
# Stage-2.2-specific purpose into every manifest it wrote.
PURPOSE=${2:-"Durable protection for the unpushed series at ${RP_ID} creation (Stage 2.1 lesson: only git-tracked files survive environment wipes)"}
UNPUSHED=$(git rev-list --count origin/main..main)
TS=$(date -u +%Y%m%d-%H%M%S)
DL=download/stage2.2/recovery
DOCS=docs/stage2.2/recovery
# RP-2.2-001 keeps its original manifest name; later points write manifest-<id>.json
MANIFEST="$DOCS/manifest-${RP_ID}.json"
mkdir -p "$DL" "$DOCS" download/stage2.2/recovery/legacy

THIN="$DOCS/jarvis-nexus-unpushed-delta-${TS}.bundle"
FULL="$DL/jarvis-nexus-full-${TS}.bundle"

echo "[1/7] thin bundle (main ^origin/main -> committed to git)"
git bundle create "$THIN" main ^origin/main
git bundle verify "$THIN"

echo "[2/7] full-state bundle (mirror only — non-durable)"
git bundle create "$FULL" --all
git bundle verify "$FULL"

echo "[3/7] legacy /tmp bundles -> download mirror (non-durable; skipped when originals are gone)"
cp -n /tmp/my-project/download/backups/lineA_production.bundle download/stage2.2/recovery/legacy/ 2>/dev/null || true
cp -n /tmp/my-project/download/backups/lineB_NEXUS_WORLD_V2.bundle download/stage2.2/recovery/legacy/ 2>/dev/null || true
# Stage 2.3 fix: legacy entries enter the manifest ONLY when the mirror file
# actually exists (the /tmp originals were wiped by the environment recycle —
# recording sha256 "" for missing files would be fabricated metadata).
# LEGACY_ENTRIES is a comma-prefixed JSON fragment with REAL newlines; the
# heredoc expands it directly (no printf/sed gymnastics).
LEGACY_ENTRIES=""
if [ -f download/stage2.2/recovery/legacy/lineA_production.bundle ]; then
  LEGACY_A_SHA=$(sha256sum download/stage2.2/recovery/legacy/lineA_production.bundle | awk '{print $1}')
  LEGACY_ENTRIES="$LEGACY_ENTRIES,
    {
      \"id\": \"LEGACY-A\", \"kind\": \"legacy bundle lineA_production (1 unreachable smart-failover commit)\",
      \"path\": \"download/stage2.2/recovery/legacy/lineA_production.bundle\", \"sha256\": \"$LEGACY_A_SHA\",
      \"durability\": \"NON-DURABLE mirror; durable preservation = owner decision D-2.1-04\"
    }"
fi
if [ -f download/stage2.2/recovery/legacy/lineB_NEXUS_WORLD_V2.bundle ]; then
  LEGACY_B_SHA=$(sha256sum download/stage2.2/recovery/legacy/lineB_NEXUS_WORLD_V2.bundle | awk '{print $1}')
  LEGACY_ENTRIES="$LEGACY_ENTRIES,
    {
      \"id\": \"LEGACY-B\", \"kind\": \"legacy bundle lineB_NEXUS_WORLD_V2 (18 unreachable commits)\",
      \"path\": \"download/stage2.2/recovery/legacy/lineB_NEXUS_WORLD_V2.bundle\", \"sha256\": \"$LEGACY_B_SHA\",
      \"durability\": \"NON-DURABLE mirror; durable preservation = owner decision D-2.1-04\"
    }"
fi

echo "[4/7] checksums"
THIN_SHA=$(sha256sum "$THIN" | awk '{print $1}')
THIN_BYTES=$(stat -c%s "$THIN")
FULL_SHA=$(sha256sum "$FULL" | awk '{print $1}')
FULL_BYTES=$(stat -c%s "$FULL")

echo "[5/7] independent restore-proof of the thin bundle (base = origin/main objects ONLY)"
PROOF=/tmp/rp22_clone_proof_$$
rm -rf "$PROOF"; mkdir -p "$PROOF"
REPO=$(pwd)
THIN_ABS="$REPO/$THIN"
# Base simulates GitHub: a repository holding exactly origin/main (41092a3).
git init --quiet "$PROOF/base"
git -C "$PROOF/base" fetch --quiet "$REPO" refs/remotes/origin/main:refs/heads/base-main
# sanity: base must NOT contain the unpushed tip before the bundle is applied
if git -C "$PROOF/base" cat-file -e "$(git rev-parse main)" 2>/dev/null; then
  echo "FAIL: base unexpectedly already contains the unpushed tip — proof invalid"; exit 1
fi
# apply the thin bundle: prerequisites (41092a3) satisfied by base
git -C "$PROOF/base" fetch --quiet "$THIN_ABS" main:restored-main
GOT=$(git -C "$PROOF/base" rev-parse restored-main)
WANT=$(git rev-parse main)
[ "$GOT" = "$WANT" ] || { echo "FAIL: thin bundle restore mismatch $GOT != $WANT"; exit 1; }
FILES=$(git -C "$PROOF/base" ls-tree -r restored-main --name-only | wc -l)
# tree-level completeness: every path at main must exist at restored-main
DIFF_N=$(diff <(git ls-tree -r main --name-only) <(git -C "$PROOF/base" ls-tree -r restored-main --name-only) | wc -l)
[ "$DIFF_N" -eq 0 ] || { echo "FAIL: restored tree differs from main ($DIFF_N diff lines)"; exit 1; }
echo "  restore-proof PASS: base(origin/main only) + thin bundle -> restored-main == main ($GOT), $FILES files, tree identical"
rm -rf "$PROOF"

echo "[6/7] manifest"
HEAD_SHA=$(git rev-parse HEAD)
ORIGIN_SHA=$(git rev-parse origin/main)
cat > "$MANIFEST" <<EOF
{
  "recoveryPointId": "${RP_ID}",
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "purpose": "$PURPOSE",
  "durableArtifacts": [
    {
      "id": "${RP_ID}-T",
      "kind": "git bundle (thin: main minus origin/main; prerequisite 41092a3 = origin/main, which GitHub already holds)",
      "path": "docs/stage2.2/recovery/$(basename "$THIN")",
      "bytes": $THIN_BYTES,
      "sha256": "$THIN_SHA",
      "head": "$HEAD_SHA",
      "restoreProof": "fetch into base clone -> restored-main == main, $FILES files"
    }
  ],
  "mirrorOnlyArtifacts": [
    {
      "id": "${RP_ID}-F",
      "kind": "git bundle (full state, all refs)",
      "path": "download/stage2.2/recovery/$(basename "$FULL")",
      "bytes": $FULL_BYTES,
      "sha256": "$FULL_SHA",
      "durability": "NON-DURABLE (gitignored download/; wiped by environment repeatedly — see Stage 2.1/2.2/2.3 records)"
    }${LEGACY_ENTRIES}
  ],
  "coveredState": { "main": "$HEAD_SHA", "originMain": "$ORIGIN_SHA", "unpushedCommits": $UNPUSHED },
  "priorPoints": {
    "RP-2.2-001": "valid for the pre-remediation state (c6d4b51); manifest in this directory",
    "RP-2.2-002": "valid for the Stage 2.2 documentation-package state (396ccaf); manifest in this directory",
    "RP-2.1-001 / RP-2.1-002": "artifacts lost to download/ wipes (finding N-2.2-01)",
    "RP-FC-001 / RP-STAGE2-001": "untraceable / lost (Stage 2.1 findings, stand)"
  }
}
EOF
cp "$MANIFEST" "$DL/manifest-$(basename "$MANIFEST")"

echo "[7/7] summary"
echo "thin bundle : $THIN_BYTES bytes  sha256=$THIN_SHA"
echo "full mirror : $FULL_BYTES bytes  sha256=$FULL_SHA (non-durable)"
echo "manifest    : $MANIFEST"
