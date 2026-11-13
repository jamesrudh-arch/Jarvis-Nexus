# JARVIS NEXUS CORE — Route Inventory & Authentication Status

Source of truth: `backend/app/main.py` (commit `1fb4384`, pre-Gate-0 baseline).
Generated as Step 0 of the Gate 0 Security & Integrity Task.

Legend:

- **Auth (baseline)** — whether the route verified credentials **before** Gate 0.
  - `NONE` — any network caller could invoke the route with no credentials.
  - `WORKER TOKEN` — verified via `verify_worker_token` (Bearer header or `?token=`).

## Baseline (BEFORE Gate 0) — 48 REST routes + 2 WebSockets

| # | Method | Route | Auth (baseline) | Notes |
|---|--------|-------|-----------------|-------|
| 1 | GET | `/api/v1/health` | NONE | Leaks capability detail, inference status, client count |
| 2 | GET | `/api/v1/world` | NONE | Full world state incl. owner name |
| 3 | POST | `/api/v1/world/complete-onboarding` | NONE | Mutates owner name / first-launch state |
| 4 | POST | `/api/v1/world/reduced-motion` | NONE | Mutates world state |
| 5 | POST | `/api/v1/world/mode` | NONE | Mutates operational mode, reads switches |
| 6 | POST | `/api/v1/world/move` | NONE | Mutates avatar position |
| 7 | POST | `/api/v1/world/interrupt` | NONE | Mutates world state |
| 8 | POST | `/api/v1/world/resume` | NONE | Mutates world state |
| 9 | GET | `/api/v1/switches` | NONE | Reads all owner switch states |
| 10 | PATCH | `/api/v1/switches/{switch_key}` | NONE | **Flips MASTER/MIC/CAM privacy switches unauthenticated** |
| 11 | GET | `/api/v1/conversations` | NONE | Reads full conversation history |
| 12 | POST | `/api/v1/conversations/send` | NONE | Reads/writes conversation, triggers inference |
| 13 | GET | `/api/v1/memories` | NONE | Reads memories (sensitive stay masked without flag, but `?reveal_sensitive=true` decrypts) |
| 14 | POST | `/api/v1/memories` | NONE | Writes memories |
| 15 | PATCH | `/api/v1/memories/{memory_id}` | NONE | Mutates epistemic status |
| 16 | DELETE | `/api/v1/memories/{memory_id}` | NONE | **Deletes memories unauthenticated** |
| 17 | GET | `/api/v1/goals` | NONE | Reads goals + audit trails |
| 18 | POST | `/api/v1/goals` | NONE | Creates goals |
| 19 | PATCH | `/api/v1/goals/{goal_id}/status` | NONE | Mutates goals |
| 20 | GET | `/api/v1/agents` | NONE | Reads agents + run traces |
| 21 | POST | `/api/v1/agents/{agent_id}/dispatch` | NONE | Triggers guarded tool execution |
| 22 | POST | `/api/v1/agents/runs/{run_id}/cancel` | NONE | Cancels agent runs |
| 23 | GET | `/api/v1/tools` | NONE | Reads allowlist + tool audit logs |
| 24 | POST | `/api/v1/tools/execute` | NONE | Executes allowlisted tools (switch-gated only) |
| 25 | POST | `/api/v1/research/query` | NONE | Reads memory content + repo documents |
| 26 | POST | `/api/v1/simulations/run` | NONE | Runs simulations |
| 27 | GET | `/api/v1/scenarios` | NONE | Reads scenarios |
| 28 | POST | `/api/v1/scenarios` | NONE | Writes/overwrites scenarios |
| 29 | POST | `/api/v1/scenarios/{scenario_id}/activate` | NONE | Activates scenario runtime |
| 30 | POST | `/api/v1/scenarios/restore` | NONE | Restores world |
| 31 | GET | `/api/v1/media` | NONE | Reads media + commentaries |
| 32 | POST | `/api/v1/media/upload` | NONE | **Arbitrary file upload to server disk** |
| 33 | GET | `/api/v1/media/files/{filename}` | NONE | Serves uploaded files |
| 34 | POST | `/api/v1/media/{media_id}/commentary` | NONE | Writes commentaries |
| 35 | POST | `/api/v1/media/video-state` | NONE | Mutates video runtime |
| 36 | POST | `/api/v1/media/generate` | NONE | 503 when unconfigured (no leak) |
| 37 | GET | `/api/v1/compute/status` | NONE | Reads worker/inference status |
| 38 | GET | `/api/v1/compute/worker-setup-info` | NONE | Reads **masked** worker token fingerprint |
| 39 | GET | `/api/v1/compute/kaggle/profiles` | NONE | Reads masked profile list |
| 40 | POST | `/api/v1/compute/kaggle/profiles` | NONE | Stores encrypted Kaggle credentials |
| 41 | PATCH | `/api/v1/compute/kaggle/profiles/{profile_id}` | NONE | Overwrites encrypted credentials |
| 42 | DELETE | `/api/v1/compute/kaggle/profiles/{profile_id}` | NONE | Deletes profiles |
| 43 | POST | `/api/v1/compute/kaggle/profiles/{profile_id}/test` | NONE | Probes Kaggle API with stored credentials |
| 44 | GET | `/api/v1/compute/kaggle/profiles/{profile_id}/package` | NONE | **Downloads worker ZIP unauthenticated** (Gate 0 Item 4) |
| 45 | GET | `/api/v1/security/events` | NONE | Reads security audit events |
| 46 | GET | `/api/v1/telemetry` | NONE | Reads host telemetry (RAM/disk/CPU) |
| 47 | POST | `/api/v1/admin/backup` | NONE | Exports full state snapshot |
| 48 | POST | `/api/v1/admin/restore` | NONE | **Overwrites state from unvalidated JSON body** (Gate 0 Item 3) |
| 49 | WS | `/ws/nexus` | NONE | Broadcast hub: unauthenticated clients receive all world events |
| 50 | WS | `/ws/worker` | WORKER TOKEN | Verified via `verify_worker_token`; rejected with close code 4401 |

Also served: `app.mount("/", StaticFiles(frontend/dist))` — public 3D bundle when built (acceptable; static assets contain no secrets).

## Baseline verdict (Step 0)

- **47 of 48 REST routes and 1 of 2 WebSockets required no authentication.**
- Only `/ws/worker` verified a token.
- `CORS_ORIGINS` defaults to `*` with `allow_methods=["*"]`, so any origin could call every route above from a browser.
- Combined with a public Railway deployment, the exposure is total: read/write of memories, goals, conversations, switches, credentials storage, tool execution, admin backup/restore.

## AFTER Gate 0

State after Items 1-5 (commits 8095846, 177659d, 3a973c8, 1603e17, 9d294ea),
verified by 43/43 tests in a clean environment.

Legend for "Auth (now)":

- `OWNER TOKEN` — router-level `require_owner` dependency (`hmac.compare_digest`,
  fail-closed, audited on every failure, per-IP throttled after 5 failures/60s).
- `OWNER TOKEN + MASTER` — owner token AND the Master switch ON (403 otherwise,
  audited as `admin_blocked`).

| # | Method | Route | Auth (now) | Extra hardening beyond auth |
|---|--------|-------|------------|------------------------------|
| 1 | GET | `/api/v1/health` | PUBLIC (by design) | Status-only payload: `{status, service, version, uptime_sec}` — no capability/inference/client detail |
| 2-50 | ALL | every other `/api/v1/*` REST route (47 routes) | `OWNER TOKEN` | 401 on missing/invalid token; failures audited + throttled |
| 44 | GET | `/api/v1/compute/kaggle/profiles/{id}/package` | `OWNER TOKEN` | Item 4: `core_wss_url` REQUIRED, must be `wss://`, host in `JARVIS_ALLOWED_WORKER_HOSTS` (loopback in dev), path `/ws/worker`, no query/fragment/userinfo; ZIP provably secrets-free; deleted after download + 15-min TTL sweep |
| 47 | POST | `/api/v1/admin/backup` | `OWNER TOKEN + MASTER` | Item 3: response states secrets policy (EXCLUDED, not encrypted) |
| 48 | POST | `/api/v1/admin/restore` | `OWNER TOKEN + MASTER` | Item 3: 2 MiB cap (413), strict closed pydantic schema (unknown tables/fields rejected), semantic validation, `?dry_run=true`, automatic `pre_restore_*` backup before any mutation, single transaction with complete rollback (500 + critical audit on failure) |
| 49 | WS | `/ws/nexus` | FIRST-MESSAGE AUTH | Item 1: `{"type":"auth","ticket"|"token"}` as first message (never in URL); ticket is single-use 60s TTL from owner-authenticated `POST /api/v1/auth/ws-ticket`; failures close with code 4401 + audit |
| 50 | WS | `/ws/worker` | `WORKER TOKEN` (unchanged) | Rejected pre-accept with close 4401 + critical audit |
| — | static | `/` (`frontend/dist`) | PUBLIC static assets | No secrets in bundle (verified by build + secret scan in tests) |

Startup (fail-closed, `validate_runtime_security`): a non-development environment
without `JARVIS_OWNER_TOKEN`, or with a wildcard CORS origin, refuses to start.

Memory embedding honesty (Item 5): `memory_records.embedding_json` renamed to
`lexical_fingerprint_json`; the helper is `_lexical_fingerprint` — a lexical
character-trigram hash, explicitly NOT a semantic embedding; no vector search.
