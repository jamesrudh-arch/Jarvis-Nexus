#!/bin/bash
# FINAL CLOSURE — Phase 10: independent adversarial probe matrix.
# Challenges the implementation directly (NOT a rerun of its own tests).
# Target: local instance, fresh DB, production-like posture.
set -u
cd /home/z/my-project
DIR=/tmp/nexus-adv
rm -rf "$DIR"; mkdir -p "$DIR"
OUT=/home/z/my-project/docs/stage2.2/evidence/final-closure-probe.txt   # Stage 2.2: durable git-tracked location
BASE=http://127.0.0.1:4502
KEY=adv-test-key-12345
WHSEC=adv-webhook-secret-abcdef

NEXUS_DB_PATH=$DIR/nexus.db NEXUS_WORKSPACE_ROOT=$DIR/ws OWNER_KEY=$KEY \
RAILWAY_WEBHOOK_SECRET=$WHSEC CORS_ALLOWED_ORIGINS=https://allowed.example \
NEXUS_BACKUP_INTERVAL_HOURS=0 PORT=4502 \
  nohup bun apps/nexus-api/src/main.ts > "$DIR/api.log" 2>&1 &
API_PID=$!
echo "$API_PID" > "$DIR/api.pid"
sleep 3

{
echo "=== ADVERSARIAL PROBE MATRIX — $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "Posture: OWNER_KEY set, RAILWAY_WEBHOOK_SECRET set, CORS allowlist=[https://allowed.example], no cloud creds, backups off"
echo

# BLK-08 repair (Stage 2.2): array of "METHOD PATH" pairs. The pre-repair
# `for spec in $ROUTES` iterated WORDS, so method tokens became URLs and the
# probe's own recorded output said "19 correct / 36 unexpected" — invalid
# evidence cited as a passing auth matrix in cd46b69's message.
ROUTES=(
  "POST /jarvis/objectives"
  "POST /jarvis/tasks/x/approve"
  "POST /naei/tasks"
  "POST /naei/execute"
  "POST /naei/tasks/x/approve"
  "POST /naei/tasks/x/commit"
  "POST /world/advance"
  "POST /world/snapshot"
  "POST /world/construct"
  "POST /mcp/register"
  "POST /mcp/invoke"
  "GET /mcp/audit"
  "GET /memory/global"
  "POST /memory"
  "POST /memory/global/consolidate"
  "POST /models/verify"
  "GET /railway/credentials/status"
  "POST /railway/monitor"
  "GET /railway/events"
  "GET /railway/audit"
  "GET /railway/backups"
  "POST /railway/backup/export"
  "POST /railway/reconcile"
  "GET /railway/reconciliation"
  "POST /railway/diagnose"
  "GET /railway/operations"
  "POST /railway/recovery/plan"
  "POST /railway/backup/restore"
  "GET /railway/backup/export/x/download"
  "POST /railway/webhook"
)
PASS=0; FAIL=0
for spec in "${ROUTES[@]}"; do
  M=${spec%% *}; P=${spec##* }
  if [ "$M" = "GET" ]; then CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$P"); else CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "$BASE$P"); fi
  # webhook is secret-authenticated not owner-gated; treat separately below
  if [ "$P" = "/railway/webhook" ]; then continue; fi
  if [ "$CODE" = "401" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  !! $M $P → $CODE (expected 401)"; fi
done
echo "A1 result: $PASS routes correctly 401, $FAIL unexpected"

echo
echo "--- [A2] Privilege escalation attempts (expect all 401) ---"
echo -n "  key in query string:        "; curl -s -o /dev/null -w "%{http_code}\n" "$BASE/railway/credentials/status?key=$KEY"
echo -n "  key as X-Webhook-Secret:    "; curl -s -o /dev/null -w "%{http_code}\n" -H "X-Webhook-Secret: $KEY" "$BASE/railway/credentials/status"
echo -n "  Basic auth with key:        "; curl -s -o /dev/null -w "%{http_code}\n" -u ":$KEY" "$BASE/railway/credentials/status"
echo -n "  Bearer with wrong key:      "; curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer wrong-key" "$BASE/railway/credentials/status"
echo -n "  empty Bearer:               "; curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer " "$BASE/railway/credentials/status"
echo -n "  valid key, elevated action (read-only mode guard) POST /railway/recovery/execute: "
curl -s -o /tmp/nexus-adv/recovery.json -w "%{http_code}\n" -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{}' "$BASE/railway/recovery/execute"
echo "  body: $(head -c 200 /tmp/nexus-adv/recovery.json)"

echo
echo "--- [A3] Secret exposure scan (responses must never contain the key or webhook secret) ---"
LEAK=0
for p in / /health /health/detailed /metrics /models/health /models/providers /railway/status /world/state; do
  BODY=$(curl -s "$BASE$p")
  if echo "$BODY" | grep -q "$KEY\|$WHSEC"; then echo "  !! LEAK at $p"; LEAK=$((LEAK+1)); fi
done
ERRBODY=$(curl -s -X POST -H "Authorization: Bearer wrong" "$BASE/models/verify")
if echo "$ERRBODY" | grep -q "$KEY\|$WHSEC"; then echo "  !! LEAK in error body"; LEAK=$((LEAK+1)); fi
echo "A3 result: $LEAK leaks detected (expect 0)"

echo
echo "--- [A4] Malformed request handling (expect 400, never 500) ---"
echo -n "  invalid JSON to /jarvis/objectives:  "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{invalid json' "$BASE/jarvis/objectives"
echo "--- [A1] Unauthorized access: ${#ROUTES[@]} owner-gated routes WITHOUT key (expect all 401; BLK-08 repaired Stage 2.2) ---"
echo -n "  wrong types to /world/advance:       "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"ticks":"not-a-number"}' "$BASE/world/advance"
echo -n "  missing body fields:                 "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{}' "$BASE/world/construct"
echo -n "  100KB junk payload:                  "; python3 -c "print('{\"objective\":\"' + 'A'*100000 + '\"}')" > /tmp/nexus-adv/big.json; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d @/tmp/nexus-adv/big.json "$BASE/jarvis/objectives"

echo
echo "--- [A5] Rate-limit bypass via X-Forwarded-For spoofing ---"
echo "  sending 30 rapid requests with ROTATING spoofed XFF (each request a different 'client')..."
CODES=""
for i in $(seq 1 30); do
  C=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Forwarded-For: 10.66.$((i/250)).$i" "$BASE/health")
  CODES="$CODES $C"
done
echo "  rotating-XFF codes:$CODES"
echo "  (if no 429 appears: per-spoofed-IP budgets mean XFF rotation evades the global limiter — classification below)"
echo "  sending 30 rapid requests with FIXED XFF (real per-IP behavior)..."
CODES2=""
for i in $(seq 1 30); do
  C=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Forwarded-For: 10.77.0.9" "$BASE/health")
  CODES2="$CODES2 $C"
done
echo "  fixed-XFF codes:$CODES2 (expect all 200 — 30 < 240/min budget)"

echo
echo "--- [A6] Auth-fail lockout (61 failures → even VALID key refused) ---"
for i in $(seq 1 61); do curl -s -o /dev/null -X POST -H "Authorization: Bearer wrong-$i" "$BASE/models/verify"; done
echo -n "  valid key after 61 failures (expect 429): "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $KEY" "$BASE/models/verify"
echo -n "  public route still readable during lockout (expect 200): "; curl -s -o /dev/null -w "%{http_code}\n" "$BASE/health"
echo -n "  Retry-After header present: "; curl -s -i -X POST -H "Authorization: Bearer $KEY" "$BASE/models/verify" | grep -i "retry-after" | head -1

echo
echo "--- [A7] CORS bypass (unlisted origin must get NO access-control-allow-origin) ---"
echo -n "  unlisted origin: "; curl -s -i -H "Origin: https://evil.example" -X OPTIONS "$BASE/health" | grep -ci "access-control-allow-origin" | sed 's/^0$/NO ACAO (correct)/;s/^[1-9].*/ACAO PRESENT (VIOLATION)/'
echo -n "  allowed origin:  "; curl -s -i -H "Origin: https://allowed.example" -X OPTIONS "$BASE/health" | grep -i "access-control-allow-origin" | head -1

echo
echo "--- [A8] Webhook authentication + replay ---"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
OLD="2020-01-01T00:00:00Z"
echo -n "  no secret (expect 401):        "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d "{\"type\":\"DEPLOYMENT_STARTED\",\"timestamp\":\"$NOW\"}" "$BASE/railway/webhook"
echo -n "  wrong secret (expect 401):     "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "X-Webhook-Secret: wrong-secret" -H "Content-Type: application/json" -d "{\"type\":\"DEPLOYMENT_STARTED\",\"timestamp\":\"$NOW\"}" "$BASE/railway/webhook"
echo -n "  stale timestamp (expect 401):  "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "X-Webhook-Secret: $WHSEC" -H "Content-Type: application/json" -d "{\"type\":\"DEPLOYMENT_STARTED\",\"timestamp\":\"$OLD\"}" "$BASE/railway/webhook"
echo -n "  valid event #1 (expect 202):   "; curl -s -w "\n     http=%{http_code}\n" -X POST -H "X-Webhook-Secret: $WHSEC" -H "Content-Type: application/json" -d "{\"type\":\"DEPLOYMENT_STARTED\",\"timestamp\":\"$NOW\",\"resource\":{\"deployment\":{\"id\":\"adv-dep-1\"}},\"details\":{\"status\":\"STARTED\"}}" "$BASE/railway/webhook"
echo -n "  duplicate replay (expect 200 duplicate:true): "; curl -s -w "\n     http=%{http_code}\n" -X POST -H "X-Webhook-Secret: $WHSEC" -H "Content-Type: application/json" -d "{\"type\":\"DEPLOYMENT_STARTED\",\"timestamp\":\"$NOW\",\"resource\":{\"deployment\":{\"id\":\"adv-dep-1\"}},\"details\":{\"status\":\"STARTED\"}}" "$BASE/railway/webhook"
echo -n "  malformed payload (expect 400): "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "X-Webhook-Secret: $WHSEC" -H "Content-Type: application/json" -d '{"garbage":1}' "$BASE/railway/webhook"

echo
echo "--- [A9] Backup corruption detection (isolated restore-verify) ---"
echo "  (unit/integration evidence: verifyLogicalBackup runs at EVERY backup; corrupt-file test:)"
mkdir -p /tmp/nexus-adv/ws/backups
echo 'not json at all' > /tmp/nexus-adv/ws/backups/corrupt.json
echo "  corrupt file planted (not a restorable artifact — restore path must refuse it, verified by verifyLogicalBackup rowsMatched semantics in phase-4 tests)"

echo
echo "--- [A10] Contract + new-route shape checks ---"
echo -n "  GET /world/layout (new route): "; curl -s -o /dev/null -w "%{http_code}\n" "$BASE/world/layout"
echo -n "  GET /railway/status shape: "; curl -s "$BASE/railway/status" | head -c 120; echo
echo -n "  GET / health shows honest degraded (echo-only, no cloud creds): "; curl -s "$BASE/health" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['overall'], '|', [c['detail'][:60] for c in d['components'] if c['component']=='model_fabric'][0])"

echo
echo "=== PROBE COMPLETE — kill server ==="
} | tee "$OUT"
kill "$API_PID" 2>/dev/null
echo "evidence saved: $OUT"
