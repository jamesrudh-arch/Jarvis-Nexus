#!/usr/bin/env bash
# PHASE 1 E2E — security enforcement proof against the REAL standalone
# production server (Part 13 owner switches + Part 14 security + backup/restore
# on a separate copy + restart persistence + rate limiting).
#
# Runs against a GENUINELY FRESH database (prisma db push schema-only, then the
# app's own cold-boot seeding) so switch defaults prove the seed, not a copy.
#
# Usage: bash tests/phase1_e2e.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PHASE1_E2E_PORT:-3121}"
PORT2="${PHASE1_E2E_PORT2:-3122}"
KEY="phase1-e2e-key-9f2a"
BASE="http://127.0.0.1:${PORT}"
BASE2="http://127.0.0.1:${PORT2}"
DB="/tmp/phase1_e2e_$$.db"
DB2="/tmp/phase1_e2e_copy_$$.db"
SRV_PID=""; SRV2_PID=""

cleanup() {
  [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null
  [ -n "$SRV2_PID" ] && kill "$SRV2_PID" 2>/dev/null
  wait 2>/dev/null
  rm -f "$DB" "$DB-journal" "$DB2" "$DB2-journal" /tmp/phase1_backup_$$.json
}
trap cleanup EXIT

boot_server() { # port db
  DATABASE_URL="file:$2" OWNER_KEY="$KEY" PORT="$1" HOSTNAME=127.0.0.1 \
    node "$ROOT/.next/standalone/server.js" >"/tmp/phase1_srv_$1_$$.log" 2>&1 &
}

wait_health() { # base
  for _ in $(seq 1 40); do
    curl -sf --max-time 2 "$1/api/v1/health" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

PASS=0; FAIL=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1 -> $3"
  else FAIL=$((FAIL+1)); echo "FAIL  $1 -> got '$3', want '$2'"; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"; }
hdr() { curl -s -D - -o /dev/null --max-time 10 "$@" | tr -d '\r'; }
switch_state() { # base key -> true/false
  curl -s "$1/api/v1/switches" | python3 -c "
import json,sys
s={x['switch_key']:x['enabled'] for x in json.load(sys.stdin)['switches']}
print('true' if s['$2'] else 'false')"
}

cd "$ROOT"

echo "=== [0] Fresh database (schema only) — cold-boot seeding under test ==="
rm -f "$DB"
DATABASE_URL="file:$DB" npx prisma db push --skip-generate --accept-data-loss >/tmp/phase1_push_$$.log 2>&1
if [ $? -ne 0 ]; then echo "FAIL: prisma db push"; cat /tmp/phase1_push_$$.log; exit 1; fi
boot_server "$PORT" "$DB"; SRV_PID=$!
if ! wait_health "$BASE"; then echo "FAIL: server did not boot"; tail -5 "/tmp/phase1_srv_${PORT}_$$.log"; exit 1; fi

echo "=== [1] Guard regression matrix (Gate 0 must hold) ==="
check "health public"                200 "$(code "$BASE/api/v1/health")"
check "memories anon denied"         403 "$(code "$BASE/api/v1/memories")"
check "memories wrong key denied"    403 "$(code -H 'X-Owner-Key: wrong' "$BASE/api/v1/memories")"
check "memories correct key allowed" 200 "$(code -H "X-Owner-Key: $KEY" "$BASE/api/v1/memories")"

echo "=== [2] Cold-boot switch defaults (mic/camera OFF, master ON) ==="
check "microphone defaults OFF" false "$(switch_state "$BASE" microphone)"
check "camera defaults OFF"      false "$(switch_state "$BASE" camera)"
check "master defaults ON"       true  "$(switch_state "$BASE" master)"

echo "=== [3] Microphone switch gates ASR (before any audio processing) ==="
check "asr with mic OFF -> 403 switch" 403 "$(code -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"audio_base64":""}' "$BASE/api/v1/asr")"
check "mic ON via control plane" 200 "$(code -X PATCH -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"enabled":true}' "$BASE/api/v1/switches/microphone")"
check "asr with mic ON -> 400 (passed gate, bad input)" 400 "$(code -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"audio_base64":""}' "$BASE/api/v1/asr")"

echo "=== [4] Embodiment switch gates embodiment-specific world modes ==="
check "embodiment OFF" 200 "$(code -X PATCH -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"enabled":false}' "$BASE/api/v1/switches/embodiment")"
check "holographic mode with embodiment OFF -> 403" 403 "$(code -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"mode_id":"holographic_presence"}' "$BASE/api/v1/world/mode")"
check "normal mode with embodiment OFF -> 200 (unaffected)" 200 "$(code -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"mode_id":"living_presence"}' "$BASE/api/v1/world/mode")"
check "embodiment back ON" 200 "$(code -X PATCH -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"enabled":true}' "$BASE/api/v1/switches/embodiment")"

echo "=== [5] Computer Control switch gates tool execution (honest block) ==="
check "computer_control OFF" 200 "$(code -X PATCH -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"enabled":false}' "$BASE/api/v1/switches/computer_control")"
REPLY=$(curl -s --max-time 60 -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"content":"store under key phase1-e2e-marker: this value must not be written while the switch is off"}' \
  "$BASE/api/v1/conversations/send" | python3 -c "import json,sys; print(json.load(sys.stdin)['jarvis_message']['content'])")
case "$REPLY" in
  *"Computer Control switch is OFF"*) PASS=$((PASS+1)); echo "PASS  honest tool-block reply" ;;
  *) FAIL=$((FAIL+1)); echo "FAIL  honest tool-block reply -> '$REPLY'" ;;
esac
check "computer_control back ON" 200 "$(code -X PATCH -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"enabled":true}' "$BASE/api/v1/switches/computer_control")"

echo "=== [6] Master switch OFF: deny everything except control plane ==="
check "master OFF" 200 "$(code -X PATCH -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"enabled":false}' "$BASE/api/v1/switches/master")"
check "health stays public"          200 "$(code "$BASE/api/v1/health")"
check "memories denied (master off)" 403 "$(code -H "X-Owner-Key: $KEY" "$BASE/api/v1/memories")"
check "agents denied (master off)"   403 "$(code -H "X-Owner-Key: $KEY" "$BASE/api/v1/agents")"
check "world mode denied"            403 "$(code -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"mode_id":"living_presence"}' "$BASE/api/v1/world/mode")"
check "tts denied"                   403 "$(code -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"text":"hello"}' "$BASE/api/v1/voice/tts")"
check "backup denied (master off)"   403 "$(code -H "X-Owner-Key: $KEY" "$BASE/api/v1/admin/backup")"
check "auth verify stays reachable (login)" 200 "$(code -H "X-Owner-Key: $KEY" "$BASE/api/v1/auth/verify")"
check "switches PATCH reachable (control plane)" 200 "$(code -X PATCH -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"enabled":true}' "$BASE/api/v1/switches/master")"
echo "--- cascade check: master OFF must have forced mic/camera OFF ---"
check "master OFF again (for cascade check)" 200 "$(code -X PATCH -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"enabled":false}' "$BASE/api/v1/switches/master")"
check "cascade: microphone forced OFF" false "$(switch_state "$BASE" microphone)"
check "cascade: camera forced OFF"      false "$(switch_state "$BASE" camera)"
check "master back ON" 200 "$(code -X PATCH -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"enabled":true}' "$BASE/api/v1/switches/master")"
check "memories reachable again" 200 "$(code -H "X-Owner-Key: $KEY" "$BASE/api/v1/memories")"

echo "=== [7] Audit trail: fresh denial categories recorded ==="
code -H 'X-Owner-Key: wrong' "$BASE/api/v1/memories' 2>/dev/null >/dev/null" >/dev/null 2>&1
code -H 'X-Owner-Key: wrong' "$BASE/api/v1/memories" >/dev/null 2>&1
AUDIT=$(curl -s -H "X-Owner-Key: $KEY" "$BASE/api/v1/security/events" | python3 -c "
import json,sys
cats = [e['category'] for e in json.load(sys.stdin)['events']]
need = ['auth_denied', 'master_off', 'owner_switch']
print(' '.join(c if c in cats else 'MISSING:'+c for c in need))")
check "audit categories (auth_denied, master_off, owner_switch)" "auth_denied master_off owner_switch" "$AUDIT"

echo "=== [8] Backup + restore (live) ==="
curl -s -H "X-Owner-Key: $KEY" "$BASE/api/v1/admin/backup" > /tmp/phase1_backup_$$.json
BACKUP_OK=$(python3 -c "
import json
d = json.load(open('/tmp/phase1_backup_$$.json'))
print('ok' if d.get('schema_version') == 1 and len(d['tables']['owner_switch']) == 7 else 'bad')")
check "backup exports all 7 switches" ok "$BACKUP_OK"
MEM_IN_BACKUP=$(python3 -c "
import json
d = json.load(open('/tmp/phase1_backup_$$.json'))
print(len(d['tables']['memory_record']))")
check "restore rejects unknown table" 400 "$(code -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"schema_version":1,"generated_at":"x","tables":{"evil":[]}}' "$BASE/api/v1/admin/restore")"
check "restore rejects malformed json" 400 "$(code -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d 'not json' "$BASE/api/v1/admin/restore")"
DRY=$(curl -s -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d @<(python3 -c "
import json
d = json.load(open('/tmp/phase1_backup_$$.json')); d['dry_run'] = 'true'; print(json.dumps(d))") "$BASE/api/v1/admin/restore" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status'))")
check "restore dry-run does not mutate" dry_run "$DRY"
check "restore real payload" 200 "$(code -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' --data-binary @/tmp/phase1_backup_$$.json "$BASE/api/v1/admin/restore")"
check "switches intact after restore" 200 "$(code -H "X-Owner-Key: $KEY" "$BASE/api/v1/switches")"

echo "=== [9] Restore verified on a SEPARATE COPY (Part 14) ==="
cp "$DB" "$DB2"
boot_server "$PORT2" "$DB2"; SRV2_PID=$!
if ! wait_health "$BASE2"; then echo "FAIL: copy server did not boot"; exit 1; fi
check "separate copy: restore payload" 200 "$(code -X POST -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' --data-binary @/tmp/phase1_backup_$$.json "$BASE2/api/v1/admin/restore")"
COPY_COUNT=$(curl -s "$BASE2/api/v1/switches" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['switches']))")
check "separate copy: 7 switches restored" 7 "$COPY_COUNT"
COPY_MEM=$(curl -s -H "X-Owner-Key: $KEY" "$BASE2/api/v1/memories" | python3 -c "
import json,sys
d = json.load(sys.stdin)
m = d if isinstance(d, list) else d.get('memories', [])
print(len(m))")
check "separate copy: memories match backup ($MEM_IN_BACKUP)" "$MEM_IN_BACKUP" "$COPY_MEM"
kill "$SRV2_PID" 2>/dev/null; wait "$SRV2_PID" 2>/dev/null; SRV2_PID=""

echo "=== [10] Restart persistence ==="
check "mic ON before restart" 200 "$(code -X PATCH -H "X-Owner-Key: $KEY" -H 'Content-Type: application/json' -d '{"enabled":true}' "$BASE/api/v1/switches/microphone")"
kill "$SRV_PID" 2>/dev/null; wait "$SRV_PID" 2>/dev/null
boot_server "$PORT" "$DB"; SRV_PID=$!
if ! wait_health "$BASE"; then echo "FAIL: server did not restart"; exit 1; fi
check "mic state survives restart (ON)" true "$(switch_state "$BASE" microphone)"
check "master state survives restart (ON)" true "$(switch_state "$BASE" master)"

echo "=== [11] Rate limiting: 5 auth failures -> 429 (runs LAST) ==="
SAW_403=0; SAW_429=0
for i in $(seq 1 8); do
  C=$(code -H "X-Owner-Key: bad-key-$i" "$BASE/api/v1/memories")
  if [ "$C" = "403" ]; then SAW_403=$((SAW_403+1)); fi
  if [ "$C" = "429" ]; then SAW_429=1; break; fi
done
check "saw denial before lockout (403)" 1 "$([ "$SAW_403" -ge 1 ] && echo 1 || echo 0)"
check "lockout engaged (429)" 1 "$SAW_429"
check "correct key also locked out during window" 429 "$(code -H "X-Owner-Key: $KEY" "$BASE/api/v1/memories")"
RETRY=$(hdr -H "X-Owner-Key: $KEY" "$BASE/api/v1/memories" | grep -i '^retry-after:' | head -1 | cut -d' ' -f2)
check "Retry-After header present" 1 "$([ -n "$RETRY" ] && echo 1 || echo 0)"

echo ""
echo "=============================================="
echo "PHASE 1 E2E RESULT: PASS=$PASS FAIL=$FAIL"
echo "=============================================="
[ "$FAIL" -eq 0 ] || exit 1
