#!/usr/bin/env bash
# Final full regression — all 8 suites, outputs recorded to reports/.
set -u
cd /home/z/my-project/NEXUS_WORLD
mkdir -p reports

run() {
  local name="$1"; shift
  echo "===== $name ====="
  "$@" > "reports/${name}" 2>&1
  local rc=$?
  tail -2 "reports/${name}"
  echo "[exit=$rc]"
}

run PHASE0_TEST_OUTPUT.txt python3 tests/phase0_smoke_test.py
run PHASE1_TEST_OUTPUT.txt python3 tests/phase1_acceptance.py
run PHASE2_TEST_OUTPUT.txt python3 tests/phase2_acceptance.py
run RENDER3D_TEST_OUTPUT.txt python3 tests/render3d_acceptance.py
run UNREAL_MCP_TEST_OUTPUT.txt python3 tests/unreal_mcp_acceptance.py
run AUTONOMY_TEST_OUTPUT.txt python3 tests/autonomy_acceptance.py
run NEXUS3D_TEST_OUTPUT.txt python3 tests/nexus3d_acceptance.py
run INTEGRATION_TEST_OUTPUT.txt python3 tests/integration_acceptance.py

echo ""
echo "===== SUITE SUMMARY ====="
for f in PHASE0 PHASE1 PHASE2 RENDER3D UNREAL_MCP AUTONOMY NEXUS3D INTEGRATION; do
  grep -hE "RESULT|ACCEPTANCE" "reports/${f}_TEST_OUTPUT.txt" | tail -1
done
