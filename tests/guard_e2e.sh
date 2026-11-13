#!/usr/bin/env bash
# Gate 0 E2E — owner-key guard matrix against the REAL standalone production
# server. Proves every guarded route rejects anonymous + wrong-key callers and
# accepts the correct key, while the public status surface stays open.
#
# Usage: bash tests/guard_e2e.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${GUARD_E2E_PORT:-3111}"
KEY="e2e-owner-key-7c1d"
BASE="http://127.0.0.1:${PORT}"
DB="/tmp/guard_e2e_$$.db"

cleanup() {
  [ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null
  wait 2>/dev/null
  rm -f "$DB" "$DB-journal"
}
trap cleanup EXIT

cp "$ROOT/db/custom.db" "$DB"

# --- boot the standalone production server with a test owner key -------------
cd "$ROOT"
DATABASE_URL="file:$DB" OWNER_KEY="$KEY" PORT="$PORT" HOSTNAME=127.0.0.1 \
  node .next/standalone/server.js >/tmp/guard_e2e_server_$$.log 2>&1 &
SRV_PID=$!

for i in $(seq 1 40); do
  if curl -sf --max-time 2 "$BASE/api/v1/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
if ! curl -sf --max-time 2 "$BASE/api/v1/health" >/dev/null 2>&1; then
  echo "FAIL: server did not boot"; tail -5 "/tmp/guard_e2e_server_$$.log"; exit 1
fi

PASS=0; FAIL=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1 -> $3"
  else FAIL=$((FAIL+1)); echo "FAIL  $1 -> got $3, want $2"; fi
}
code() { curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$@"; }

# --- 1. public status surface stays open --------------------------------------
check "GET  /health                public" 200 "$(code "$BASE/api/v1/health")"
check "GET  /world                 public" 200 "$(code "$BASE/api/v1/world")"
check "GET  /switches              public" 200 "$(code "$BASE/api/v1/switches")"
check "GET  /scenarios             public" 200 "$(code "$BASE/api/v1/scenarios")"
check "GET  /telemetry             public" 200 "$(code "$BASE/api/v1/telemetry")"

# --- 2. guarded routes reject ANONYMOUS callers (403 + X-Auth-Required) -------
ANON=()
anon() { # name method path [data]
  local c h
  if [ -n "${4:-}" ]; then
    c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -X "$2" "$BASE$3" -H 'Content-Type: application/json' -d "$4")
  else
    c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -X "$2" "$BASE$3")
  fi
  h=$(curl -s -D - -o /dev/null --max-time 20 -X "$2" "$BASE$3" -H 'Content-Type: application/json' -d "${4:-{}}" | tr -d '\r' | grep -i '^x-auth-required:' | head -1 | tr 'A-Z' 'a-z')
  check "ANON $1 $2" 403 "$c"
  if [ "$c" = "403" ] && [ "$h" = "x-auth-required: owner-key" ]; then
    PASS=$((PASS+1)); echo "PASS  $1 carries X-Auth-Required: owner-key"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $1 missing X-Auth-Required header (got: '$h')"
  fi
}
anon "/memories GET            " GET  /api/v1/memories
anon "/memories POST           " POST /api/v1/memories '{"title":"x","content":"y"}'
anon "/memories/:id PATCH      " PATCH /api/v1/memories/00000000-0000-0000-0000-000000000000 '{"title":"x"}'
anon "/memories/:id DELETE     " DELETE /api/v1/memories/00000000-0000-0000-0000-000000000000
anon "/goals GET               " GET  /api/v1/goals
anon "/goals POST              " POST /api/v1/goals '{"title":"x","description":"y"}'
anon "/goals/:id/status PATCH  " PATCH /api/v1/goals/00000000-0000-0000-0000-000000000000/status '{"status":"active"}'
anon "/agents GET              " GET  /api/v1/agents
anon "/agents/:id/dispatch POST" POST /api/v1/agents/qa_director/dispatch '{"objective":"x"}'
anon "/conversations/send POST " POST /api/v1/conversations/send '{"content":"hello"}'
anon "/integrations GET        " GET  /api/v1/integrations
anon "/integrations POST       " POST /api/v1/integrations '{"action":"verify"}'
anon "/security/events GET     " GET  /api/v1/security/events
anon "/storage PUT             " PUT  "/api/v1/storage?key=e2e/anon.txt"
anon "/switches/:key PATCH     " PATCH /api/v1/switches/master '{"enabled":false}'
anon "/asr POST                " POST /api/v1/asr '{"audio_base64":""}'
anon "/voice/tts POST          " POST /api/v1/voice/tts '{"text":"x"}'
anon "/world/move POST         " POST /api/v1/world/move '{"zone_id":"central_operations"}'
anon "/world/mode POST         " POST /api/v1/world/mode '{"mode_id":"living_presence"}'
anon "/world/interrupt POST    " POST /api/v1/world/interrupt
anon "/world/resume POST       " POST /api/v1/world/resume
anon "/world/onboarding POST   " POST /api/v1/world/complete-onboarding
anon "/world/reduced-motion POST" POST "/api/v1/world/reduced-motion?enabled=false"
anon "/scenarios/restore POST  " POST /api/v1/scenarios/restore

# --- 3. wrong key rejected ------------------------------------------------------
check "WRONG KEY /memories POST" 403 "$(code -X POST "$BASE/api/v1/memories" -H 'Content-Type: application/json' -H "X-Owner-Key: wrong-key-attempt" -d '{"title":"x","content":"y"}')"
check "WRONG BEARER /memories GET" 403 "$(code "$BASE/api/v1/memories" -H "Authorization: Bearer wrong-key-attempt")"

# --- 4. correct key accepted (X-Owner-Key and Bearer) ---------------------------
H="X-Owner-Key: $KEY"
check "KEY /memories GET        " 200 "$(code "$BASE/api/v1/memories" -H "$H")"
check "KEY /goals GET           " 200 "$(code "$BASE/api/v1/goals" -H "$H")"
check "KEY /agents GET          " 200 "$(code "$BASE/api/v1/agents" -H "$H")"
check "KEY /security/events GET " 200 "$(code "$BASE/api/v1/security/events" -H "$H")"
check "KEY via Bearer /memories " 200 "$(code "$BASE/api/v1/memories" -H "Authorization: Bearer $KEY")"
check "KEY /conversations empty " 400 "$(code -X POST "$BASE/api/v1/conversations/send" -H "$H" -H 'Content-Type: application/json' -d '{"content":""}')"
check "KEY /asr empty audio     " 400 "$(code -X POST "$BASE/api/v1/asr" -H "$H" -H 'Content-Type: application/json' -d '{"audio_base64":""}')"
check "KEY /tts empty text      " 400 "$(code -X POST "$BASE/api/v1/voice/tts" -H "$H" -H 'Content-Type: application/json' -d '{"text":""}')"
check "KEY /integrations bogus  " 400 "$(code -X POST "$BASE/api/v1/integrations" -H "$H" -H 'Content-Type: application/json' -d '{"action":"bogus"}')"
check "KEY /world/move          " 200 "$(code -X POST "$BASE/api/v1/world/move" -H "$H" -H 'Content-Type: application/json' -d '{"zone_id":"central_operations"}')"

# memory create + delete round trip with the key (real mutation, then removed)
CREATED=$(curl -s --max-time 20 -X POST "$BASE/api/v1/memories" -H "$H" -H 'Content-Type: application/json' \
  -d '{"category":"project","epistemic_status":"owner_stated","title":"GATE0-E2E","content":"guard matrix probe"}')
MEM_ID=$(echo "$CREATED" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [ -n "$MEM_ID" ]; then
  check "KEY /memories POST+id   " 200 "$(code -X POST "$BASE/api/v1/memories" -H "$H" -H 'Content-Type: application/json' -d '{"category":"project","epistemic_status":"owner_stated","title":"GATE0-E2E-2","content":"probe"}')"
  check "KEY /memories/:id DELETE" 200 "$(code -X DELETE "$BASE/api/v1/memories/$MEM_ID" -H "$H")"
  check "KEY /memories/:id gone  " 200 "$(code "$BASE/api/v1/memories" -H "$H")"
else
  FAIL=$((FAIL+1)); echo "FAIL  KEY /memories POST returned no id: $CREATED"
fi

# switch PATCH with the key (set master to its CURRENT value — no state change)
CUR=$(curl -s --max-time 20 "$BASE/api/v1/switches" | sed -n 's/.*"switch_key":"master","label":"[^"]*","enabled":\([a-z]*\).*/\1/p')
check "KEY /switches PATCH same " 200 "$(code -X PATCH "$BASE/api/v1/switches/master" -H "$H" -H 'Content-Type: application/json' -d "{\"enabled\":$CUR}")"
AFTER=$(curl -s --max-time 20 "$BASE/api/v1/switches" | sed -n 's/.*"switch_key":"master","label":"[^"]*","enabled":\([a-z]*\).*/\1/p')
if [ "$CUR" = "$AFTER" ]; then PASS=$((PASS+1)); echo "PASS  master switch value unchanged ($CUR)"
else FAIL=$((FAIL+1)); echo "FAIL  master switch changed $CUR -> $AFTER"; fi

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "GATE 0 E2E MATRIX: ALL GREEN" || exit 1
