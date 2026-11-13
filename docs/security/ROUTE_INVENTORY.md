# Route Inventory & Owner-Guard Specification — Production Next.js App

Scope: the deployed Next.js application (`src/app/api/**`, Railway service
Jarvis-Nexus). Verified by `tests/guard_e2e.sh` (70/70) against the real
standalone production server and by `scripts/gate0_ui_verify.py` (headless
Chromium, VLM-verified screenshots). Companion evidence for the FastAPI CORE
hardening lives in `reference/Jarvis/docs/security/`.

## BEFORE (verified live on production 2026-11-13, before this change)

An **anonymous** caller could (all observed returning 200):

- `POST /api/v1/memories` — create database records (probe created + deleted one)
- `DELETE /api/v1/memories/{id}` — delete records
- `PATCH /api/v1/switches/{key}` — flip the owner's Master/MIC/Camera switches
- `POST /api/v1/conversations/send` — burn inference quota, write conversation history
- `POST /api/v1/agents/{id}/dispatch` — dispatch specialist agents
- `POST /api/v1/world/*` — move/mode/interrupt/resume the embodied character
- `GET /api/v1/memories` — read every memory (including owner facts and preferences)

Session 7 had verified the same class of exposure with anonymous live calls;
session 8 re-proved it non-destructively (create+delete cycle, cleaned up
immediately) and then closed it (below).

## AFTER — guard contract

Shared modules:

- `src/lib/nexus/ownerAuth.ts` — pure check: `X-Owner-Key` header OR
  `Authorization: Bearer` against the server-side `OWNER_KEY` secret,
  **constant-time comparison** (`crypto.timingSafeEqual`), **deny-by-default**
  when `OWNER_KEY` is unset. Rejection reasons never contain key material.
- `src/lib/nexus/ownerGuard.ts` — `requireOwnerKey(req)` returns a 403
  `NextResponse` (with `X-Auth-Required: owner-key` + `auth_required:"owner_key"`
  body) or null. Applied as the first statement of every privileged handler.

Client contract: `src/nexus/ownerKeyClient.ts` stores the key in
**sessionStorage only** (never localStorage/cookies, cleared when the tab
closes), attaches `X-Owner-Key` to every request through the single `api()`
transport plus the drawer fetches, and dispatches `jarvis:auth-required` when a
403 auth rejection arrives. `OwnerGate.tsx` shows the unlock panel, VERIFIES
the key against `GET /api/v1/agents` before storing it (wrong keys are
rejected visibly), and re-dispatches `jarvis:auth-key-set` so open surfaces
reload their guarded data.

## Route table (AFTER)

| Route | Method(s) | Status |
| --- | --- | --- |
| /api/v1/health | GET | PUBLIC — status-only (Railway healthcheck), four fields |
| /api/v1/world | GET | PUBLIC — boot/status surface (zones, modes, switch states) |
| /api/v1/switches | GET | PUBLIC — switch list (labels + states) |
| /api/v1/scenarios | GET | PUBLIC — scenario catalog (definitions, no runtime secrets) |
| /api/v1/telemetry | GET | PUBLIC — CPU/memory/record-count status |
| /api/v1/storage | GET (no key) | PUBLIC metadata surface (buckets/usage; no object contents) |
| /api/v1/storage | GET ?key, PUT, DELETE | OWNER-KEY (unchanged behavior, now via shared guard) |
| /api/v1/memories | GET, POST | OWNER-KEY |
| /api/v1/memories/[id] | PATCH, DELETE | OWNER-KEY |
| /api/v1/goals | GET, POST | OWNER-KEY |
| /api/v1/goals/[id]/status | PATCH | OWNER-KEY |
| /api/v1/agents | GET | OWNER-KEY (last_output is operational data) |
| /api/v1/agents/[id]/dispatch | POST | OWNER-KEY |
| /api/v1/conversations/send | POST | OWNER-KEY |
| /api/v1/integrations | GET, POST | OWNER-KEY (service connection state) |
| /api/v1/security/events | GET | OWNER-KEY |
| /api/v1/switches/[key] | PATCH | OWNER-KEY |
| /api/v1/asr | POST | OWNER-KEY (consumes inference) |
| /api/v1/voice/tts | POST | OWNER-KEY (consumes inference) |
| /api/v1/world/move | POST | OWNER-KEY |
| /api/v1/world/mode | POST | OWNER-KEY |
| /api/v1/world/interrupt | POST | OWNER-KEY |
| /api/v1/world/resume | POST | OWNER-KEY |
| /api/v1/world/complete-onboarding | POST | OWNER-KEY |
| /api/v1/world/reduced-motion | POST | OWNER-KEY |
| /api/v1/scenarios/[id]/activate | POST | OWNER-KEY |
| /api/v1/scenarios/restore | POST | OWNER-KEY |

Design note on the public surface: the five status routes are what the
sanctuary shell needs before any unlock so the owner always sees the living
scene; they expose no credentials, no memory content, no conversation content,
and no mutation capability. Everything data-bearing or mutating requires the
key. The guard also closes the CSRF hole (a cross-site form POST cannot know
the key) and blocks inference-quota theft.

## Verification evidence

1. `tests/guard_e2e.sh` — 70/70 PASS against the real standalone server
   (`node .next/standalone/server.js`, isolated SQLite copy, test OWNER_KEY):
   - 5 public routes → 200 (still usable without a key)
   - 24 guarded anonymous calls → 403 with `X-Auth-Required: owner-key`
   - wrong key and wrong Bearer → 403
   - correct key via `X-Owner-Key` AND via `Bearer` → 200
   - post-auth validation intact (empty content → 400, bogus action → 400)
   - real mutation round trip (memory create → delete) with the key
   - `PATCH /switches/master` with the same value → state unchanged
2. `npm test` — 62/62 (10 new `ownerAuth` unit tests: deny-by-default, both
   header forms, wrong/missing/whitespace keys, no key material in reasons).
3. `tsc --noEmit` clean; `npm run build` clean.
4. `scripts/gate0_ui_verify.py` — headless Chromium against the same server:
   sanctuary renders without a key; Inspector→Memory without a key shows the
   OwnerGate and ZERO memory rows (no data leak); wrong key → visible
   "Invalid owner key"; correct key → gate closes + 6 rows load; key survives
   an in-tab reload (sessionStorage); zero page errors. Screenshots (VLM
   described, confirming panel presence/absence and row visibility):
   `download/screenshots/gate0_ui_locked.png`, `gate0_ui_unlocked.png`,
   `gate0_ui_after_reload.png`.

## Rollback

Single revert of the hardening commit restores the previous behavior (all
routes public). The guard is additive: it wraps existing handlers and does not
alter any post-authentication logic, so per-route rollback is also possible by
removing the two guard lines from any single handler.

## Still exposed (documented, single-owner design)

- The public status surface (5 routes above) is world-readable by design.
- One shared owner key (no per-user accounts, no rotation UI) — same posture
  as the FastAPI CORE (`THREAT_STATEMENT.md` "still exposed").
- No per-IP throttling on the Next.js app yet (the FastAPI CORE has
  5-fail/60 s); Next.js middleware-level throttling is a follow-up item.
- OWNER_KEY rotation is a Railway variable edit + redeploy.
