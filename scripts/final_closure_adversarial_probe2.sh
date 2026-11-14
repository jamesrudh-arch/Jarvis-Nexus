#!/bin/bash
# FINAL CLOSURE — corrected adversarial probes (round 2)
set -u
cd /home/z/my-project
DIR=/tmp/nexus-adv2
rm -rf "$DIR"; mkdir -p "$DIR"
OUT=/home/z/my-project/download/stage2/final-closure/evidence/adversarial-probe2.txt
BASE=http://127.0.0.1:4503
KEY=adv-test-key-12345
WHSEC=adv-webhook-secret-abcdef

NEXUS_DB_PATH=$DIR/nexus.db NEXUS_WORKSPACE_ROOT=$DIR/ws OWNER_KEY=$KEY \
RAILWAY_WEBHOOK_SECRET=$WHSEC CORS_ALLOWED_ORIGINS=https://allowed.example \
NEXUS_BACKUP_INTERVAL_HOURS=0 PORT=4503 \
  nohup bun apps/nexus-api/src/main.ts > "$DIR/api.log" 2>&1 &
API_PID=$!
echo "$API_PID" > "$DIR/api.pid"
sleep 3

{
echo "=== ADVERSARIAL PROBE ROUND 2 — $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo
echo "--- [B1] Clean auth matrix: owner-gated routes without key (expect 401) ---"
PASS=0; FAIL=0
check() { # method path
  local M=$1 P=$2 C
  if [ "$M" = GET ]; then C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$P")
  else C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "$BASE$P"); fi
  if [ "$C" = 401 ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  !! $M $P → $C"; fi
}
check POST /jarvis/objectives
check POST /jarvis/tasks/x/approve
check POST /naei/tasks
check POST /naei/execute
check POST /naei/tasks/x/approve
check POST /naei/tasks/x/commit
check POST /world/advance
check POST /world/snapshot
check POST /world/construct
check POST /mcp/register
check POST /mcp/invoke
check GET  /mcp/audit
check GET  /memory/global
check POST /memory
check POST /memory/global/consolidate
check POST /models/verify
check GET  /railway/credentials/status
check POST /railway/monitor
check GET  /railway/events
check GET  /railway/audit
check GET  /railway/backups
check POST /railway/backup/export
check POST /railway/reconcile
check GET  /railway/reconciliation
check POST /railway/diagnose
check GET  /railway/operations
check POST /railway/recovery/plan
check GET  /railway/recovery/plans/x
check POST /railway/recovery/authorize
check POST /railway/recovery/execute
echo "B1 result: $PASS correct-401 / $FAIL unexpected"

echo
echo "--- [B2] POST /world/construct with empty body → 200? (validation gap check) ---"
echo "  response:"; curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{}' "$BASE/world/construct" | head -c 400; echo
echo "  world events count before/after:"; curl -s "$BASE/world/events?limit=1000" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))"

echo
echo "--- [B3] Read-only mode guard with valid planId (recovery ladder) ---"
PLAN=$(curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"kind":"restart_service","target":"api","justification":"adversarial probe"}' "$BASE/railway/recovery/plan")
echo "  plan response: $(echo $PLAN | head -c 250)"
PLAN_ID=$(echo "$PLAN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id','') if isinstance(d.get('data'),dict) else '')" 2>/dev/null)
echo "  planId=$PLAN_ID"
if [ -n "$PLAN_ID" ]; then
  echo -n "  authorize L1: "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d "{\"planId\":\"$PLAN_ID\",\"level\":1}" "$BASE/railway/recovery/authorize"
  echo -n "  execute (read-only mode → must REFUSE): "; curl -s -w " http=%{http_code}\n" -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d "{\"planId\":\"$PLAN_ID\"}" "$BASE/railway/recovery/execute" | head -c 300
fi

echo
echo "--- [B4] Webhook with VALID schema (severity included) ---"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
OLD=2020-01-01T00:00:00Z
mkbody() { echo "{\"type\":\"DEPLOYMENT_STARTED\",\"severity\":\"INFO\",\"timestamp\":\"$1\",\"resource\":{\"deployment\":{\"id\":\"adv-dep-2\"}},\"details\":{\"status\":\"STARTED\"}}"; }
echo -n "  valid fresh event (expect 202):      "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "X-Webhook-Secret: $WHSEC" -H "Content-Type: application/json" -d "$(mkbody $NOW)" "$BASE/railway/webhook"
echo -n "  exact duplicate (expect 200 dup):    "; curl -s -X POST -H "X-Webhook-Secret: $WHSEC" -H "Content-Type: application/json" -d "$(mkbody $NOW)" "$BASE/railway/webhook" | head -c 120; echo
echo -n "  stale-timestamp valid schema (401):  "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "X-Webhook-Secret: $WHSEC" -H "Content-Type: application/json" -d "$(mkbody $OLD)" "$BASE/railway/webhook"

echo
echo "--- [B5] rate limiter boundary (fixed IP: burst 245 → expect 429 at 241) ---"
CODES=""
for i in $(seq 1 245); do C=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Forwarded-For: 10.88.1.1" "$BASE/health"); CODES="$CODES$C "; done
echo "  429 count: $(echo $CODES | grep -o 429 | wc -l), 200 count: $(echo $CODES | grep -o 200 | wc -l)"

echo
echo "=== ROUND 2 COMPLETE ==="
} | tee "$OUT"
kill "$API_PID" 2>/dev/null
echo "evidence saved: $OUT"
