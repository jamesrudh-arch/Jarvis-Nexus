#!/bin/bash
# Stage 2 Phase 5 V3 — DOM-level verification: Three.js canvas, data-driven UI.
set -u
cd /home/z/my-project
DIR=/tmp/nexus-visual2
rm -rf "$DIR"; mkdir -p "$DIR"
EVID=/home/z/my-project/download/stage2/evidence

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
curl -s -X POST http://127.0.0.1:4600/api/world -H "Content-Type: application/json" -d '{"ticks":20}' > /dev/null

agent-browser set viewport 1440 900 > /dev/null 2>&1
agent-browser open http://127.0.0.1:4600/ > /dev/null 2>&1
sleep 4

{
echo "=== DOM verification: dashboard ==="
agent-browser eval "JSON.stringify({title: document.title, navButtons: document.querySelectorAll('button').length, headings: [...document.querySelectorAll('h1,h2,h3')].slice(0,6).map(h=>h.textContent.trim())})"

echo "=== navigate to world view ==="
agent-browser find text "NEXUS World" click > /dev/null 2>&1
sleep 6
echo "--- Three.js canvas check ---"
agent-browser eval "(() => { const c = document.querySelector('canvas'); if (!c) return 'NO CANVAS'; const gl = c.getContext('webgl2') || c.getContext('webgl'); return JSON.stringify({canvas: true, size: c.width + 'x' + c.height, webgl: !!gl, renderer: gl ? gl.getParameter(gl.RENDERER) : null}); })()"
echo "--- world view controls present ---"
agent-browser eval "JSON.stringify({buttons: [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>t).slice(0,14)})"

echo "=== residents view data ==="
agent-browser find text "Residents" click > /dev/null 2>&1
sleep 3
agent-browser eval "JSON.stringify({residentCards: document.querySelectorAll('[class*=card], [class*=border]').length, textSample: document.body.innerText.slice(0, 600)})"

echo "=== system view honesty ==="
agent-browser find text "System" click > /dev/null 2>&1
sleep 3
agent-browser eval "document.body.innerText.slice(0, 900)"

echo "=== console errors ==="
agent-browser errors
} | tee "$EVID/visual_dom_verification.txt"

agent-browser close > /dev/null 2>&1
kill $API_PID $NEXT_PID 2>/dev/null
echo "DOM VERIFICATION COMPLETE"
