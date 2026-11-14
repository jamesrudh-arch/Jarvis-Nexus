#!/bin/bash
# B-07 — local live probe of model endpoints (production posture: no cloud creds, echo off)
set -u
cd /home/z/my-project
DIR=/tmp/nexus-b07
rm -rf "$DIR"; mkdir -p "$DIR"

NEXUS_DB_PATH=$DIR/nexus.db NEXUS_WORKSPACE_ROOT=$DIR/ws OWNER_KEY=b07-key PORT=4501 \
NEXUS_BACKUP_INTERVAL_HOURS=0 \
  nohup bun apps/nexus-api/src/main.ts > "$DIR/api.log" 2>&1 &
API_PID=$!
echo "$API_PID" > "$DIR/api.pid"
sleep 3

echo "=== /models/providers (no cloud creds, echo off = production posture) ==="
curl -s http://127.0.0.1:4501/models/providers; echo
echo "=== /models/health ==="
curl -s http://127.0.0.1:4501/models/health | python3 -m json.tool
echo "=== POST /models/verify (owner) ==="
curl -s -X POST -H "Authorization: Bearer b07-key" http://127.0.0.1:4501/models/verify | python3 -m json.tool
echo "=== POST /models/verify WITHOUT key (must be 401) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://127.0.0.1:4501/models/verify
kill "$API_PID" 2>/dev/null
echo "probe complete"
