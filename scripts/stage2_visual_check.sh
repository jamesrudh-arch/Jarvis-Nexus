#!/bin/bash
# Stage 2 Phase 5 V3 — visual verification of the restored application.
# Starts backend + Next, opens headless browser, navigates views, screenshots.
set -u
cd /home/z/my-project
DIR=/tmp/nexus-visual
rm -rf "$DIR"; mkdir -p "$DIR"
EVID=/home/z/my-project/download/stage2/evidence
mkdir -p "$EVID"

NEXUS_DB_PATH=$DIR/nexus.db NEXUS_WORKSPACE_ROOT=$DIR/workspaces OWNER_KEY=test-visual-key \
NEXUS_ALLOW_ECHO=true NEXUS_BACKUP_INTERVAL_HOURS=0 PORT=4500 \
  bun apps/nexus-api/src/main.ts > "$DIR/api.log" 2>&1 &
API_PID=$!
sleep 3

cd .next/standalone
NEXUS_API_URL=http://localhost:4500 OWNER_KEY=test-visual-key PORT=4600 HOSTNAME=127.0.0.1 \
  node server.js > "$DIR/next.log" 2>&1 &
NEXT_PID=$!
sleep 3

# advance the world a bit so the scene has life
curl -s -X POST http://127.0.0.1:4600/api/world -H "Content-Type: application/json" -d '{"ticks":30}' > /dev/null
sleep 1

agent-browser set viewport 1440 900 2>&1 | head -1
agent-browser open http://127.0.0.1:4600/ 2>&1 | head -2
sleep 4
agent-browser wait --load networkidle 2>&1 | head -1
agent-browser screenshot "$EVID/visual_01_dashboard.png" 2>&1 | head -1
agent-browser errors 2>&1 | head -8

# navigate to NEXUS World (3D view)
agent-browser snapshot -i -c 2>&1 | grep -iE "world|button|link" | head -12
agent-browser find text "NEXUS World" click 2>&1 | head -2
sleep 6
agent-browser screenshot "$EVID/visual_02_world.png" 2>&1 | head -1

# residents view
agent-browser find text "Residents" click 2>&1 | head -2
sleep 3
agent-browser screenshot "$EVID/visual_03_residents.png" 2>&1 | head -1

# system view
agent-browser find text "System" click 2>&1 | head -2
sleep 3
agent-browser screenshot "$EVID/visual_04_system.png" 2>&1 | head -1

# mobile viewport check
agent-browser set viewport 390 844 2>&1 | head -1
agent-browser find text "NEXUS World" click 2>&1 | head -2
sleep 5
agent-browser screenshot "$EVID/visual_05_mobile_world.png" 2>&1 | head -1

agent-browser close 2>&1 | head -1
kill $API_PID $NEXT_PID 2>/dev/null
echo "VISUAL CAPTURE COMPLETE"
ls -la "$EVID"/visual_*.png
