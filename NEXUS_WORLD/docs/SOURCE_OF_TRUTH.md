# JARVIS NEXUS — SOURCE OF TRUTH
**Authoritative project state record (PART II §5). Maintained as implementation evolves.**

Last updated: 2026-11-14 (session: DEFINITIVE MASTER BUILD DIRECTIVE v1)

---

## 1. Codebase state

| Item | Value |
|---|---|
| Repository | `/home/z/my-project` (local git; **no remote configured in this sandbox**) |
| Branch | `main` |
| HEAD commit at session start | `54dc193` (full history: 15 commits, `445f16b` → `54dc193`) |
| Working tree at session start | clean except new `upload/` (reference image + directive) |
| Production source of record | GitHub `jamesrudh-arch/Jarvis-Nexus` (per prior sessions; directive text says `VANT-HQ/JARVIS-NEXUS` — historical name of the same project; **discrepancy noted**, verify on next push) |
| Railway project | `reasonable-heart` (f3e6f010-61df-4e97-bc5e-1f7dd695c4d3), service "Jarvis-Nexus" (8f8a9401-…), production env (86a07ea1-…) |

## 2. Production state (verified live this session)

| Check | Result |
|---|---|
| `https://jarvis-nexus-production.up.railway.app/` | HTTP 200, ~0.22 s, server `railway-hikari`, Next.js (verified 2026-11-14) |
| Deployed version | The founder's Next.js/Prisma app (commit `535bfc33` per prior session) — **not** this session's product codebase |
| Deployment access | **BLOCKED**: Railway workspace token + GitHub push path destroyed by sandbox recycle ( `.env` reduced to `DATABASE_URL`) |

## 3. Environment / dependencies

| Item | State |
|---|---|
| `.env` | `DATABASE_URL` only (file: `db/custom.db`). No Railway token, no OpenAI key (lost in recycle — must be re-supplied by founder; never fabricated) |
| Node modules | present (567 packages incl. `z-ai-web-dev-sdk`, three.js) |
| Python runtime | 3.12.16 at `/home/z/.venv` — **mesa/langgraph/fastapi/cv2/piper MISSING again** (recycle #2; recover via `pip install mesa langgraph fastapi uvicorn httpx pillow numpy piper-tts opencv-python-headless`) |
| Blender venv (`.venv-blender`, bpy) | **MISSING again** (recover: `uv venv --python 3.11 .venv-blender && uv pip install --python .venv-blender/bin/python bpy numpy "mcp<2"`) |
| Piper voice model | `.onnx` binary **MISSING** (only `.json` + README remain; recover from huggingface.co/rhasspy/piper-voices, `en_US-lessac-medium`) |
| Sandbox egress | Hong Kong, Alibaba AS45102 (re-confirmed prior session, dual-source) — OpenAI edge-blocked pre-auth; GLM/zai SDK functional in-sandbox |
| GLM provider | Operational; **429 rate windows occur** (honest degradation path, never fabricated) |

## 4. World / data state (db/custom.db, verified this session)

| Item | Value |
|---|---|
| World | `nexus-prime` "Nexus Prime", seed 20261113, epoch 2026-01-01, 10 min/tick |
| Current tick | 144 (sim time 2026-01-02T00:00Z, weather clear) |
| Events | 3,962 |
| Residents | 24 (population created at bootstrap; wallets/economy **not yet present** — this session adds them) |
| Memories | 182 |
| Ledger | 14 tasks (state mix incl. VERIFIED/BLOCKED) |
| Chat history | 0 messages (fresh) |
| Provider status rows | 3 |

## 5. Capability register

`NEXUS_WORLD/integration/register.json`: **103 records — 38 OPERATIONAL / 63 EVALUATED / 1 REGISTERED / 1 INSTALLED** (round 3 audit). Web summary: `src/data/register-summary.json`. Rules: OPERATIONAL only with live evidence; states are audit conclusions, not live probes.

## 6. Known discrepancies (repo vs archive vs production)

1. Production runs the founder's app; the product build (commit `f8cc03e`+) is **not deployed** — blocked on Railway token (§2).
2. Directive cites `VANT-HQ/JARVIS-NEXUS`; prior verified remote was `jamesrudh-arch/Jarvis-Nexus` — same project lineage, resolve at next push.
3. `download/` archives (zips) are snapshots of earlier rounds; the git tree is newer.
4. Register summary JSON says "95 records" in its provenance string but the register itself is at 103 (summary generated before round 3 tail; refresh when register changes).

## 7. Blocked items (founder actions)

1. `RAILWAY_TOKEN` re-supply → deploy this product via existing GitHub→Railway integration.
2. GitHub push path (PAT or credentials) — 15 commits of local history await.
3. Full-length `OPENAI_API_KEY` in the **deployment** environment (US egress) — sandbox stays edge-blocked regardless of key.
4. Unreal Editor execution (Windows + RTX GPU + 64 GB) — hardware-blocked.

## 8. Recovery / build instructions

- App: `bun install && bun run db:push && bun run dev` (port 3000)
- Cold boot self-initializes world + population + 144 ticks (idempotent, event-sourced)
- Python suites: `scripts/final_regression.sh` (needs §3 deps recovered)
- Regression baseline to protect: **184/184** (8 suites)

## 9. Session change log (this file updated as work lands)

### Session: DEFINITIVE MASTER BUILD DIRECTIVE (2026-11-14) — commit `see git log`

- **V2 world layer implemented + verified**: JARVIS identity subsystem
  (versioned, event-sourced, provider-independent); JARVIS as world resident
  #25 (Sanctum home, 3 rooms, no salary); functional economy (37 businesses,
  salaries/purchases/B2B restocks/grants, conservation laws verified from the
  event log alone); building interiors (52 rooms, 112 objects, enter-mode in
  3D view, honest shells labelled); multi-model capability router (audited).
- Verification: `scripts/test-v2.ts` 17/17 (V2_VERIFICATION.txt); Python
  regression 184/184 re-verified after recycle-recovery #2; browser-verified
  (8 screenshots, app_screenshots_v2); lint + tsc clean (type-checking was
  newly enforced — several pre-existing type errors fixed).
- Register: 103 → **110 records (44 OPERATIONAL)**; ledger 14 → 21 tasks
  (11 VERIFIED, 6 BLOCKED); DB advanced tick 144 → 1080+ (world keeps living).
- DB recovery point: `db/custom.db.pre-v2-backup` taken BEFORE the V2
  upgrade (upgrade itself is idempotent events — no destructive migration).
- Still blocked (unchanged §7): Railway token, GitHub push, OpenAI key,
  UE editor hardware. VLM study + some chat calls blocked by a live GLM
  429 window (honestly reported; retry pending).
