#!/bin/bash
# STAGE 2.2 / WORKSTREAM B — deterministic evidence generation.
# Every artifact is produced by a committed generator, carries its generation
# timestamp + git HEAD, and is written to a GIT-TRACKED location
# (docs/stage2/evidence/) per the twice-proven durability rule.
set -uo pipefail
cd /home/z/my-project
E=docs/stage2/evidence
mkdir -p "$E"
FAIL=0
step() { echo "--- $1 ---"; }

step "route parity (committed stage2.1 script, wrapped with metadata)"
{
  python3 scripts/stage21_route_parity.py 2>&1
  echo
  echo "generatedAt: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "generatedAtHead: $(git rev-parse HEAD)"
  echo "generator: scripts/stage21_route_parity.py (committed Stage 2.1 successor of the phase-0 parity script)"
} > "$E/route-parity.txt"
python3 scripts/stage21_route_parity.py >/dev/null 2>&1 || FAIL=$((FAIL+1))

step "registry consistency"
{ bun tools/registry-validate.ts 2>&1; echo "exitCode=$?"; echo "generatedAt: $(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo "generatedAtHead: $(git rev-parse HEAD)"; } > "$E/registry-validation.txt"
[ $? -eq 0 ] || FAIL=$((FAIL+1))

step "typecheck"
{ bun run typecheck 2>&1; echo "exitCode=$?"; echo "generatedAt: $(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo "generatedAtHead: $(git rev-parse HEAD)"; } > "$E/typecheck.txt"
bun run typecheck >/dev/null 2>&1 || FAIL=$((FAIL+1))

step "git state"
python3 - > "$E/git-state.json" <<'PYEOF'
import json, subprocess
def run(*a): return subprocess.run(a, capture_output=True, text=True).stdout.strip()
doc = {
  "format": "stage2-git-state",
  "generatedAt": run("date", "-u", "+%Y-%m-%dT%H:%M:%SZ"),
  "generatedAtHead": run("git", "rev-parse", "HEAD"),
  "generator": "inline in scripts/stage22_evidence_generate.sh (git is the primary source)",
  "head": run("git", "rev-parse", "HEAD"),
  "branches": {b: run("git", "rev-parse", b) for b in ["main", "railway-intelligence", "stage2-pre-restructure"]},
  "originMain": run("git", "rev-parse", "origin/main"),
  "unpushedCount": run("git", "rev-list", "--count", "origin/main..main"),
  "workingTreeClean": run("git", "status", "--porcelain") == "",
  "stashCount": run("git", "stash", "list").count("\n") + (1 if run("git", "stash", "list") else 0),
  "mergesInRange": run("git", "rev-list", "--merges", "origin/main..main"),
  "linearHistory": run("git", "rev-list", "--merges", "origin/main..main") == "",
  "authors": sorted(set(run("git", "log", "--format=%an <%ae>", "origin/main..main").splitlines())),
}
print(json.dumps(doc, indent=2))
PYEOF

step "auth matrix (source-derived, isolated instance)"
bun run scripts/stage22_auth_matrix.ts > "$E/auth-matrix-gen.log" 2>&1 || FAIL=$((FAIL+1))
# the generator itself writes docs/stage2/evidence/auth-matrix.json

step "backup export + product verify (real application path)"
bun run scripts/stage22_backup_verify.ts > "$E/backup-export-verify-gen.log" 2>&1 || FAIL=$((FAIL+1))
# the generator writes docs/stage2/evidence/backup-export-verify.json

echo
echo "evidence tree:"
ls -la "$E"
echo "FAILURES: $FAIL"
exit $FAIL
