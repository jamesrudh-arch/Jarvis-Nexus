#!/bin/bash
# QC pass: identity-locked storyboard audit via z-ai vision CLI (VFX supervisor persona).
DIR=/home/z/my-project/download/jarvis-nexus-preproduction/storyboard_locked
REF=/home/z/my-project/download/jarvis-nexus-preproduction/v2_proof/canon_ref.png
REP=/home/z/my-project/scripts/qc_reports
mkdir -p "$REP"

PROMPT='You are a strict film VFX supervisor auditing a storyboard frame for a project where the SAME woman must appear in every frame. Image 1 is the canonical reference photo of her. Image 2 is the storyboard frame under audit. Rate: 1. IDENTITY 0-10: is the woman in frame 2 (wherever her face is visible; if her face is not visible write n/a) the same woman as image 1 - same slim face, high cheekbones, angular jawline, dark eyebrows, dark brown hair in a low bun, black turtleneck under structured dark blazer? 2. LIGHT 0-10: do holograms/glow act as REAL light sources illuminating her face, hands, clothing, floor, casting her shadow? or painted-on? 3. HANDS: ok/fail/n/a - natural separated fingers, never fused into hologram geometry. 4. DEFECTS: none, or list briefly - garbled text, extra people, deformed anatomy, plastic skin, dead eyes, white-clinic drift, duplicated woman. Answer in EXACTLY this single-line format: IDENTITY=<score|n/a> LIGHT=<score> HANDS=<ok|fail|n/a> DEFECTS=<none|brief list> VERDICT=<KEEP|REDO> - <max 12 word note>'

cd "$DIR"
for f in *.jpg; do
  [ "$#" -gt 0 ] && { skip=1; for p in "$@"; do [[ "$f" == "$p"* ]] && skip=0; done; [ $skip -eq 1 ] && continue; }
  [ -s "$REP/$f.txt" ] && { echo "cached $f"; continue; }
  ok=""
  for try in 1 2 3 4; do
    z-ai vision -p "$PROMPT" -i "$REF" -i "$DIR/$f" -o "$REP/$f.json" >/dev/null 2>&1
    [ -s "$REP/$f.json" ] && { ok=1; break; }
    echo "  429/backoff on $f (try $try), waiting $((try*60))s..."
    sleep $((try*60))
  done
  [ -z "$ok" ] && { echo "$f: FAILED after retries"; continue; }
  python3 - "$REP/$f.json" "$REP/$f.txt" <<'EOF'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    c = d['choices'][0]['message']['content'].strip()
except Exception as e:
    c = f"PARSE_ERROR {e}"
open(sys.argv[2], 'w').write(c)
print(f"{sys.argv[2].split('/')[-1]}: {c.splitlines()[0][:160]}")
EOF
  sleep 8
done
echo "QC DONE"
