#!/bin/bash
# B-05 automated acceptance — launch backend (4500) + Next standalone (4600)
set -u
cd /home/z/my-project
DIR=/tmp/nexus-b05
rm -rf "$DIR"; mkdir -p "$DIR"

NEXUS_DB_PATH=$DIR/nexus.db NEXUS_WORKSPACE_ROOT=$DIR/workspaces OWNER_KEY=b05-test-key \
NEXUS_ALLOW_ECHO=true NEXUS_BACKUP_INTERVAL_HOURS=0 PORT=4500 \
  nohup bun apps/nexus-api/src/main.ts > "$DIR/api.log" 2>&1 &
API_PID=$!
echo "$API_PID" > "$DIR/api.pid"
sleep 3

cd /home/z/my-project/.next/standalone
NEXUS_API_URL=http://127.0.0.1:4500 OWNER_KEY=b05-test-key PORT=4600 HOSTNAME=127.0.0.1 \
  nohup node server.js > "$DIR/next.log" 2>&1 &
NEXT_PID=$!
echo "$NEXT_PID" > "$DIR/next.pid"
sleep 4

echo "API_PID=$API_PID NEXT_PID=$NEXT_PID"
echo "=== BACKEND HEALTH ==="
curl -s http://127.0.0.1:4500/health | head -c 400; echo
echo "=== NEXT / ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:4600/
echo "=== NEXT /api/system (adapter round-trip) ==="
curl -s http://127.0.0.1:4600/api/system | head -c 400; echo
