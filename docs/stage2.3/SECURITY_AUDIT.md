# STAGE 2.3 — PRE-DEPLOYMENT SECURITY AUDIT
## Complete inspection of the deployment candidate (directive §4)

**Document ID:** STAGE23-SEC-001
**Session:** 2026-11-15 (UTC)
**Scope:** the deployment candidate = local `main` (32 unpushed commits through the Stage 2.3 evidence-repair commit, plus this stage's documentation commits). No secret values appear in this document or in any committed artifact.

---

## 1. Authentication and authorization

- **Owner authentication** (`requireOwner`): `Authorization: Bearer <key>` header-only; constant-time comparison (SHA-256 digests + `timingSafeEqual`); the key never travels in URLs/query strings. **Fail-closed**: if `OWNER_KEY` is unset, every protected route returns 401 — an unconfigured production cannot be wide open.
- **Brute-force defense**: per-IP auth-fail budget (`AUTH_FAIL_LIMIT_PER_MIN`, default 60/min) with lockout semantics that refuse even a VALID key while the bucket is full — brute force is pointless, and public routes are never collateral damage of lockout.
- **Re-verified this session**: 37/37 source-derived owner-gated routes return 401 for anonymous AND wrong-key requests; escalation attempts, query-string keys, case-mangled and padded tokens are all refused (security suite 31/31 PASS).
- **Legacy dev token** (`nexus-tier0-dev-token`): confined to the reference Python subsystem (NEXUS_WORLD), zero references in the production runtime (`apps/nexus-api`), env-overridable (`NEXUS_FOUNDER_TOKEN`); risk assessed LOW (Stage 2.2 G-checks re-run PASS). Forcing its removal from the reference subsystem remains an owner decision.

## 2. Session and token behavior

The API is stateless Bearer-token based — no session cookies, no session fixation/invalidation surface. Tokens are compared in constant time; no token is ever echoed in responses or logs (secret-exposure checks: 0 leaks across public + error responses, re-run PASS). The MCP gateway and webhook surfaces use their own configured secrets (below).

## 3. Webhook configuration (fail-closed)

`/railway/webhook` authenticates with `RAILWAY_WEBHOOK_SECRET`; without a configured secret the route fails closed (replay protection, deduplication, stale-timestamp rejection — all re-run PASS with a configured secret and a contract-correct payload). Consequence for production: **the webhook intake is inert until the owner provisions a strong secret (decision B-03)** — inert-by-design is the safe posture.

## 4. Rate limiting and CORS

- **Rate limit**: `RATE_LIMIT_PER_MIN` (default 240/min, per-IP, fixed window) returns 429 with `Retry-After`; exact boundary behavior re-verified (5 allowed → 429 in the drill configuration).
- **CORS**: least-privilege allowlist via `CORS_ALLOWED_ORIGINS` (comma-separated, exact-match origin function). **Unset = no CORS middleware at all (same-origin only).** Verified both ways (allowed origin reflected; disallowed origin receives no allow-origin).
- **Production-visible change (owner must know)**: the currently deployed code returns `access-control-allow-origin: *` (measured this session, baseline PB-04). After deploying the candidate, cross-origin browser clients stop working unless `CORS_ALLOWED_ORIGINS` is set. This is the intended Phase-3 hardening and is tied to owner decision B-02 (visual-app hosting + origin list).

## 5. X-Forwarded-For behavior (FC-05 — carried, precisely characterized)

`clientIpOf` takes the FIRST entry of `X-Forwarded-For`, falling back to `X-Real-IP`, else `"unknown"`. Behind Railway's edge, a client can spoof XFF and thereby rotate rate-limit/auth-fail bucket keys. Impact assessment: this weakens per-IP rate limiting and lockout (an attacker rotating XFF values gets fresh buckets), but NOT authentication itself (the owner key remains required and constant-time). The correct fix depends on Railway's proxy behavior (whether Railway overwrites XFF / sets X-Real-IP with the true client IP) — a **post-deploy probe (FC-05)**, already owner-gated in the register. No silent fix was attempted this session because the probe requires the live deployment.

## 6. Secret handling

- `.gitignore` excludes `.env*` and `credentials.env`; the only local `.env` holds `DATABASE_URL` (value never printed, never committed).
- Secret-exposure scans (public responses + error responses): **0 leaks**, re-run PASS.
- The committed history was scanned in Stage 2.1/2.2 for secret leakage (clean); this session added no secrets to any artifact (the evidence files record variable NAMES and public URLs only).
- Dockerfile bakes in no secrets (only `NODE_ENV`, DB/workspace paths, port).

## 7. Environment-variable requirements (complete inventory, names only)

| Variable | Required? | Default | Production disposition |
|---|---|---|---|
| `OWNER_KEY` | required for protected routes to function (fail-closed without it) | none | **Owner must set** (a strong value; provisioning is owner-gated) |
| `NEXUS_DB_PATH` | set by Dockerfile | `/data/nexus.db` | volume `/data` must be attached (it is — production is stateful) |
| `NEXUS_WORKSPACE_ROOT` | set by Dockerfile | `/data/workspaces` | same volume; backups live under it |
| `PORT` | provided by Railway | 3000 | automatic |
| `CORS_ALLOWED_ORIGINS` | optional | unset = same-origin only | **owner decision B-02** (visual-app origin) |
| `RATE_LIMIT_PER_MIN` / `AUTH_FAIL_LIMIT_PER_MIN` | optional | 240 / 60 | safe defaults |
| `NEXUS_BACKUP_INTERVAL_HOURS` / `NEXUS_BACKUP_RETENTION` | optional | 24 / 14 | safe defaults (first backup shortly after boot) |
| `NEXUS_BACKUP_OFFSITE_DIR` | optional | unset = off-site copy disabled | **owner decision D-2.1-03** (full off-site form) |
| `RAILWAY_API_TOKEN` | optional | unset → railway intelligence degrades honestly | **owner decision B-03** |
| `RAILWAY_WEBHOOK_SECRET` | optional | unset → webhook fails closed | **owner decision B-03** |
| Model provider keys (`CLOUDFLARE_*`, `OPENAI_*`, …) | optional | echo provider only | **owner decision B-07** (live verify) |

## 8. Local-validation vs production differences (every one identified)

1. **CORS**: local tests exercise the allowlist function; production today emits `*` from the old code — the candidate changes this (see §4).
2. **Owner key**: local tests inject keys; production's `OWNER_KEY` is owner-provisioned and unknown to this audit (by design).
3. **Reverse proxy**: local tests hit the app directly; production sits behind Railway's edge (hkg1) — XFF/real-IP semantics unverifiable pre-deploy (FC-05).
4. **Volumes**: local uses temp dirs; production uses `/data` (SQLite + workspaces + backups on one volume — the same-volume constraint is exactly what the off-volume copy option and D-2.1-03 address).
5. **Model egress**: the sandbox's egress region blocks some providers (ADR-007, expected); production egress differs — honest verification requires the post-deploy `/models/verify` (B-07).
6. **CI environment**: GitHub runners have no owner secrets — live tests self-skip by design (12 skips), verified by the green run at `41092a3` and the local `--execute` record.

## 9. Audit verdict

The candidate's security posture is verified as far as it can be verified pre-deployment: authentication fail-closed and constant-time; authorization matrix 37/37; webhook fail-closed; rate limiting with lockout; least-privilege CORS; zero secret exposure; input handling hardened (oversized/malformed/traversal refused, no stack traces). The three items that structurally require the live deployment (XFF disposition FC-05, live model verification B-07, production webhook with a real secret B-03) are carried explicitly as post-deploy gates in the authorization package — none is silently assumed.
