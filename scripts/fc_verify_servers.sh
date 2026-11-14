#!/bin/bash
# Final-closure repair verification: boot both servers on 4504/4604
set -u
cd /home/z/my-project
DIR=/tmp/nexus-verify
rm -rf "$DIR"; mkdir -p "$DIR"

NEXUS_DB_PATH=$DIR/nexus.db NEXUS_WORKSPACE_ROOT=$DIR/ws OWNER_KEY=verify-key \
NEXUS_ALLOW_ECHO=true NEXUS_BACKUP_INTERVAL_HOURS=0 PORT=4504 \
  nohup bun apps/nexus-api/src/main.ts > "$DIR/api.log" 2>&1 &
echo $! > "$DIR/api.pid"
sleep 3

cd /home/z/my-project/.next/standalone
NEXUS_API_URL=http://127.0.0.1:4504 OWNER_KEY=verify-key PORT=4604 HOSTNAME=127.0.0.1 \
  nohup node server.js > "$DIR/next.log" 2>&1 &
echo $! > "$DIR/next.pid"
sleep 4
echo "servers up: api=$(cat $DIR/api.pid) next=$(cat $DIR/next.pid)"
