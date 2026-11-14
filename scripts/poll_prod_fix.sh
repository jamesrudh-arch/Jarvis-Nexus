#!/usr/bin/env bash
# Poll production until the black-void fix (commit 4cc3def) is live.
# Detection: the deployed JS bundles contain the 2026-11-13 NaN-guard marker.
set -u
BASE="https://jarvis-nexus-production.up.railway.app"
MARKER="2026-11-13"
for check in $(seq 1 20); do
  # health first
  H=$(curl -sS --max-time 20 "$BASE/api/v1/health" 2>/dev/null | head -c 120)
  # fetch homepage, extract chunk URLs
  HTML=$(curl -sS --max-time 20 "$BASE/" 2>/dev/null)
  CHUNKS=$(echo "$HTML" | grep -oE '/_next/static/chunks/[a-z0-9_-]+\.js' | sort -u)
  FOUND=0; TOTAL=0
  for c in $CHUNKS; do
    TOTAL=$((TOTAL+1))
    if curl -sS --max-time 25 "$BASE$c" 2>/dev/null | grep -q "NaN guard ($MARKER)"; then
      FOUND=1
    fi
  done
  echo "check $check: health=$H chunks=$TOTAL fix_live=$FOUND"
  if [ "$FOUND" = "1" ]; then echo "FIX IS LIVE ON PRODUCTION"; exit 0; fi
  sleep 45
done
echo "fix not observed yet after 20 checks"; exit 1
