# JARVIS NEXUS CORE — Gate 0 Threat Statement

Scope: the Jarvis FastAPI CORE repository (branch `gate0-security`, Items 1-5,
commits 8095846, 177659d, 3a973c8, 1603e17, 9d294ea), its Three.js sanctuary
frontend, and the private worker protocol. Verified by 43/43 backend tests in a
clean environment plus the frontend character/scene verification and production
build. Every claim below maps to a test or a command in
`docs/security/evidence/`.

## PROTECTED (verified by tests)

1. **All 47 non-health REST routes require owner authentication.** Missing or
   invalid Bearer token -> 401; constant-time comparison (`hmac.compare_digest`);
   fail-closed (no configured token = no access); every failure writes a
   `SecurityAuditEvent`; 5 failures/60s per IP -> 429 throttling.
   Evidence: `test_gate0_auth.py` (every route, both failure modes).
2. **`/api/v1/health` is public and status-only** — no capability, inference,
   worker, or client detail. Evidence: `test_health_and_truthful_capabilities`.
3. **`/ws/nexus` requires first-message authentication.** Unauthenticated
   clients never join the broadcast hub; closed with policy code 4401 before
   any world data is sent. Tickets are single-use, 60-second TTL, issued only
   by an owner-authenticated route, and never travel in URLs.
   Evidence: `test_ws_nexus_rejects_unauthenticated_clients`.
4. **`/ws/worker` still requires the worker token** (pre-accept rejection,
   close 4401, critical audit). Evidence: `test_authenticated_private_worker_websocket_streaming`.
5. **Production start is fail-closed.** Without `JARVIS_OWNER_TOKEN`, or with a
   wildcard CORS origin, the server refuses to boot in non-development mode.
   Evidence: `test_gate0_auth.py` / `test_gate0_cors.py` subprocess tests.
6. **CORS is an explicit allowlist** (Railway CORE + Vercel frontend split
   documented in `.env.example`); unlisted origins get no CORS headers.
7. **Admin backup/restore require owner token + Master ON.** Restore is
   size-capped (2 MiB -> 413), strict-schema validated (unknown tables/fields
   rejected), semantically validated, dry-runnable, pre-backup protected, and
   transactional with complete rollback. Hostile snapshots that the baseline
   happily imported (verified: 200 `restored`) are now 400/413.
   Evidence: `test_gate0_admin.py`.
8. **Backups exclude secrets** — sensitive memory plaintext (marker only),
   Kaggle credentials (masked only), Fernet key and tokens never exported; the
   response states this policy explicitly. Evidence: `test_backup_response_documents_secrets_policy_and_excludes_secrets`.
9. **Worker packages contain no secrets** — no worker/owner token, no Fernet
   key, no profile credentials (raw or encrypted blob); the notebook loads the
   token from Kaggle Secrets at runtime. `core_wss_url` must be `wss://` and in
   the `JARVIS_ALLOWED_WORKER_HOSTS` allowlist before it is embedded anywhere.
   Packages are deleted after download and swept after 15 minutes.
   Evidence: `test_gate0_worker_pkg.py`.
10. **Token values never appear in logs, audits, or error messages** — audit
    messages carry route/IP/reason only. Evidence: assertions in
    `test_failed_authentication_writes_security_audit_event` and the secrets
    assertions in tests 2/9.
11. **Seven owner switches are enforced server-side** (Master OFF halts
    inference dispatch, tools, agents; sensors default OFF and stay OFF).
    Evidence: `test_seven_owner_switches_real_enforcement`, `test_health_and_truthful_capabilities`.
12. **Memory embedding honesty** — the column and helper are named and
    documented as a lexical fingerprint; no vector-search claim remains
    anywhere in code, SQL, or README. Evidence: `test_gate0_embedding_honesty.py`.

## STILL EXPOSED (accepted by design; documented, not hidden)

1. **`/api/v1/health` is reachable unauthenticated.** It is the Railway
   healthcheck; it returns four status fields and nothing else. Any caller can
   learn that the service is up and its version. Accepted deliberately.
2. **The static 3D bundle at `/` is public.** The built sanctuary contains no
   secrets (verified by build output and the package/secret scans); the login
   gate means the world does nothing without the owner token.
3. **The owner token is a single shared bearer credential.** There is no
   per-user identity, no rotation, no revocation list. An attacker who obtains
   the token value gets owner-level access until it is changed. Mitigations:
   token never logged, never in URLs, throttling on failures, fail-closed
   startup. Residual risk: the token's secrecy is the whole game — protect the
   `.jarvis_secret_key` file (0600) and the platform env vars.
4. **Rate limiting is per-process and in-memory.** A multi-worker deployment
   resets the per-IP failure windows per process. Single-instance Railway
   deployments (current) get the full protection.
5. **WS ticket store and auth throttle state are in-memory** — they do not
   survive restarts (acceptable: tickets are 60s TTL anyway).
6. **`allow_methods=["*"]` / `allow_headers=["*"]` within the explicit origin
   allowlist.** Only listed origins can make credentialed calls.

## UNVERIFIED (no evidence yet — not claimed)

1. **Production Railway deployment of this branch.** Gate 0 is repo-level;
   deploying to Railway and verifying the running production instance is a
   separate step and has NOT been done or claimed here.
2. **PostgreSQL/pgvector production path.** All Gate 0 verification ran on
   SQLite (the dev/test database). The Postgres SQL is shared (same ORM/SQL
   via SQLAlchemy) but the production Postgres instance was not exercised.
3. **True internet-reachable WSS from Kaggle to CORE** (needs the owner's
   real Railway domain + `JARVIS_ALLOWED_WORKER_HOSTS`); the loopback and
   allowlist logic itself is tested.
4. **External integrations** (Kaggle API auth, optional OpenAI-compatible
   endpoints, video generation) — out of Gate 0 scope; they remain in their
   pre-existing state (honest 503/refusal when unconfigured).
5. **Kaggle Secrets runtime behaviour inside a real Kaggle notebook** — the
   package content is verified; executing it on Kaggle is owner-side work.

## Rollback

See `ROLLBACK_PLAN.md` — the per-item revert sequence has been executed and
tested (worktree verified byte-identical to the pre-item commits; suite green
after rollback).
