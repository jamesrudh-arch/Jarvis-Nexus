#!/bin/bash
# Stage 2 Phase 5 V2 — REAL integration verification (single-shot).
# Starts backend + Next standalone, exercises the full adapter chain, captures evidence.
set -u
cd /home/z/my-project
DIR=/tmp/nexus-integration
rm -rf "$DIR"; mkdir -p "$DIR"
EVID=/home/z/my-project/download/stage2/evidence
mkdir -p "$EVID"

# 1. backend
NEXUS_DB_PATH=$DIR/nexus.db NEXUS_WORKSPACE_ROOT=$DIR/workspaces OWNER_KEY=test-integration-key \
NEXUS_ALLOW_ECHO=true NEXUS_BACKUP_INTERVAL_HOURS=0 PORT=4100 \
  bun apps/nexus-api/src/main.ts > "$DIR/api.log" 2>&1 &
API_PID=$!
sleep 3

# 2. next standalone
cd .next/standalone
NEXUS_API_URL=http://localhost:4100 OWNER_KEY=test-integration-key PORT=4300 HOSTNAME=127.0.0.1 \
  node server.js > "$DIR/next.log" 2>&1 &
NEXT_PID=$!
sleep 3

OUT="$DIR/results.txt"
{
echo "=== A. backend direct ==="
echo "--- GET /health (overall + components) ---"
curl -s http://localhost:4100/health | python3 -m json.tool 2>/dev/null | head -20
echo "--- GET /world/state (counts) ---"
curl -s http://localhost:4100/world/state | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)['data']
    print('world_name:', d['world']['name'])
    print('residents:', d['residents'], '| properties:', d['properties'], '| businesses:', d['businesses'], '| vehicles:', d['vehicles'])
    print('economy:', d['economy'])
    print('events:', d['events'], '| memories:', d['memories'])
    print('actionDistribution:', d['actionDistribution'])
except Exception as e:
    print('PARSE FAIL:', e)"

echo ""
echo "=== B. through Next adapter chain ==="
echo "--- GET /api/world ---"
curl -s http://127.0.0.1:4300/api/world | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print('source:', d.get('source'))
    print('world:', d.get('world_name'), '| tick:', d.get('tick'), '| weather:', d.get('weather'))
    print('population:', d.get('population'), '| buildings:', d.get('buildings'), '| districts:', d.get('districts'))
    print('clock:', d.get('clock'))
    print('recent_events:', len(d.get('recent_events',[])))
    print('economy.money_supply:', d.get('economy',{}).get('money_supply'))
except Exception as e:
    print('PARSE FAIL:', e)"

echo "--- GET /api/layout ---"
curl -s http://127.0.0.1:4300/api/layout | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print('source:', d.get('source'))
    print('buildings:', len(d.get('buildings',[])), '| with rooms:', sum(1 for b in d.get('buildings',[]) if b.get('rooms')))
    print('bounds:', d.get('bounds'))
    names=[b['name'] for b in d.get('buildings',[])[:5]]
    print('sample buildings:', names)
except Exception as e:
    print('PARSE FAIL:', e)"

echo "--- GET /api/residents ---"
curl -s http://127.0.0.1:4300/api/residents | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    rs=d.get('residents',[])
    print('residents:', len(rs))
    if rs:
        r=rs[0]
        print('first:', r['name'], '| action:', r['action'], '| pos:', r['pos'], '| needs:', r['needs'])
        print('mood:', r.get('mood'), '| home:', r.get('home_name'))
except Exception as e:
    print('PARSE FAIL:', e)"

echo "--- GET /api/system ---"
curl -s http://127.0.0.1:4300/api/system | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print('app:', d.get('app'))
    print('backend overall:', d.get('backend',{}).get('overall'))
    print('world:', d.get('world'))
    print('blockers:', [b['id'] for b in d.get('blockers',[])])
    print('env OWNER_KEY:', d.get('environment',{}).get('OWNER_KEY'))
except Exception as e:
    print('PARSE FAIL:', e)"

echo "--- GET /api/providers ---"
curl -s http://127.0.0.1:4300/api/providers | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print('providers:', d.get('providers'))
    for p in d.get('provider_status',[]):
        print(f\"  {p['provider']}: configured={p['configured']} verified={p['verified']} models={p['models']}\")
except Exception as e:
    print('PARSE FAIL:', e)"

echo "--- GET /api/lab ---"
curl -s http://127.0.0.1:4300/api/lab | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print('register total:', d.get('register',{}).get('total'))
    print('by_state:', d.get('register',{}).get('by_state'))
    print('task_count:', d.get('task_count'))
except Exception as e:
    print('PARSE FAIL:', e)"

echo "--- GET /api/tasks ---"
curl -s http://127.0.0.1:4300/api/tasks | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    ts=d.get('tasks',[])
    print('tasks:', len(ts))
    if ts: print('first:', ts[0]['id'], '|', ts[0]['state'], '|', ts[0]['title'][:50])
except Exception as e:
    print('PARSE FAIL:', e)"

echo ""
echo "=== C. consequential action through the chain (owner, server-side key) ==="
echo "--- POST /api/world {ticks:3} ---"
curl -s -X POST http://127.0.0.1:4300/api/world -H "Content-Type: application/json" -d '{"ticks":3}' | head -c 300
echo ""
echo "--- world tick advanced? ---"
curl -s http://127.0.0.1:4300/api/world | python3 -c "
import json,sys
d=json.load(sys.stdin); print('tick after advance:', d.get('tick'), '| events:', len(d.get('recent_events',[])))"

echo "--- POST /api/chat {message} (real orchestrator round-trip) ---"
curl -s -X POST http://127.0.0.1:4300/api/chat -H "Content-Type: application/json" -d '{"message":"What is the current state of the world? Summarise population and weather."}' | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print('reply:', str(d.get('reply'))[:220])
    print('provider:', d.get('provider'), '| state:', d.get('state'), '| objective_met:', d.get('objective_met'))
except Exception as e:
    print('PARSE FAIL:', e)"

echo ""
echo "=== D. persistence across backend restart ==="
kill $API_PID 2>/dev/null; sleep 1
cd /home/z/my-project
NEXUS_DB_PATH=$DIR/nexus.db NEXUS_WORKSPACE_ROOT=$DIR/workspaces OWNER_KEY=test-integration-key \
NEXUS_ALLOW_ECHO=true NEXUS_BACKUP_INTERVAL_HOURS=0 PORT=4100 \
  bun apps/nexus-api/src/main.ts >> "$DIR/api.log" 2>&1 &
API_PID=$!
sleep 5
curl -s http://127.0.0.1:4300/api/world | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('tick after backend restart (must persist):', d.get('tick'))
print('population after restart:', d.get('population'))"

echo ""
echo "=== E. home page HTML sanity ==="
curl -s http://127.0.0.1:4300/ | grep -o "<title>[^<]*</title>"
curl -s -o /dev/null -w "manifest: HTTP %{http_code}\n" http://127.0.0.1:4300/manifest.webmanifest
curl -s -o /dev/null -w "icon: HTTP %{http_code}\n" http://127.0.0.1:4300/icon.svg
} | tee "$OUT" | tee "$EVID/visual_app_integration.txt"

kill $API_PID $NEXT_PID 2>/dev/null
echo ""
echo "INTEGRATION RUN COMPLETE"
