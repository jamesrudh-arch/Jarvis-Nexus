# Evidence 5 — 3D Sanctuary builds AND loads with the Gate 0 login step

Live verification on 2026-11-13 (dev stack: uvicorn CORE :8000 + Vite :5173,
Vite proxying /api and /ws to CORE):

1. `node frontend/tests/verify_character_and_scene.mjs` -> ALL CHECKS PASSED
   (evidence/final_run/verify_character_final.txt)
2. `(cd frontend && npm run build)` -> built in 1.78s, exit 0
   (evidence/final_run/npm_build_final.txt)
3. Live load through the login gate (agent-browser, screenshots here):
   - 01: unauthenticated -> owner-token gate visible; GET /api/v1/world = 401.
   - 03: wrong token -> "Access denied: Owner authentication required.",
     gate stays; no world data ever sent.
   - 02: valid token (read from the 0600 secrets file by the automation only;
     never printed, never in any output or commit) -> gate hides, canvas mounts,
     /ws/nexus first-message auth accepted (device=pc_sanctuary), 3D sanctuary
     renders.
   - Reload -> gate reappears (token is memory-only by design; nothing on disk).
   - Render proof: after-auth frame has 5,089 distinct colors and quadrant
     brightness variance up to 2,571 (lit 3D scene); gate frames ~650 colors
     (flat overlay). Zero page errors; console clean.
