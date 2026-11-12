# JARVIS NEXUS — Integration Audit Register (Session 5, 2026-11-12)

Live-verification evidence: `scripts/verify_integrations.py` (honest verifier —
accounts for account-scoped tokens, GraphQL null-propagation, project-scoped
keys), `scripts/probe_services*.py` (deep probes, stages 1–8),
`scripts/configure_production.py` (production configuration writes),
`GET /api/v1/integrations` (runtime status surface). Statuses below are the
results of REAL authenticated calls against each service on 2026-11-12 —
no fabricated claims. Secrets live ONLY in gitignored `.env*` files.

## Audit states used (per directive)

**Discovered** (credential found in secure storage) → **Configured**
(environment variable wired, runtime client initialised) → **Authenticated**
(real API call accepted the credential) → **Permissions verified** (actual
scopes/identities enumerated) → **Real operations successful** (non-trivial
read/write executed and verified) → **Production verified** (live deployment
exercises the integration).

## GitHub — PRODUCTION VERIFIED

| State | Evidence |
|---|---|
| Discovered | `GITHUB_TOKEN` (classic PAT) + `GITHUB_REPO` in `.env.local` |
| Configured | `.env.local` (local) + Railway production variables (service Jarvis-Nexus) |
| Authenticated | `GET /user` → 200, identity `jamesrudh-arch` |
| Permissions verified | repo `jamesrudh-arch/Jarvis-Nexus`: push=True (also push on `Jarvis`) |
| Real operations | Session-4 history pushed and verified via API + `git ls-remote`; this session's commits pushed (see git log) |
| Production | The Railway service deploys from this repo (repo trigger, see Railway row) |

## Kaggle ×6 — REAL OPERATIONS VERIFIED

| State | Evidence |
|---|---|
| Discovered | `KAGGLE_API_TOKEN_1..6` (KGAT tokens) in `.env.local` |
| Configured | `.env.local` + Railway production variables; runtime: `src/lib/nexus/integrations/kaggle.ts` (per-account verify, round-robin routing, dataset discovery, private kernel push) |
| Authenticated | `GET /api/v1/hello` → 200 for each: jimcreat, wikeyoung, deyoungsltd, bittrexminingltd, wikeyoung5, youngwilly |
| Permissions verified | Per-account identity confirmed; data-plane read scope live |
| Real operations | `GET /api/v1/kernels/list?user=<name>` → 200 per account — **77 kernels visible** (e.g. `jimcreat/deyoung-diag`, `bittrexminingltd/deyoung-h3-b`, `wikeyoung5/deyoung-lipsync-cpu`); `datasets/list?user=` → 200 per account; `competitions/list` → 200. (Note: the `mine=true` query param is rejected 400 by the current API — `user=<username>` is the working form.) |
| Production | Tokens configured on the Railway deployment; the resource manager is server-side only |

## Cloudflare + R2 — AUTHENTICATED, S3 CREDENTIALS CREATED VIA API; R2 ENABLEMENT IS A DASHBOARD/BILLING ACTION

| State | Evidence |
|---|---|
| Discovered | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in `.env.local` |
| Configured | `.env.local` + Railway production variables; runtime: `src/lib/nexus/integrations/r2.ts` (management REST + dependency-free SigV4 S3 data plane) |
| Authenticated | `GET /accounts` → 200, account `Jamesrudh@gmail.com's Account`, id matches the supplied account id. The token is an **account-scoped API token**: `/user/tokens/verify` legitimately answers 401 (user-level auth required) — expected for this token class, not a fault |
| Permissions verified | Account-tokens API read (`GET /accounts/{id}/tokens` → 200, existing token listed), 416 permission groups enumerable including all R2 groups (IDs recorded in `scripts/probe_services2.py` output) |
| Real operations | **Created a new R2-scoped account token via the API** (`POST /accounts/{id}/tokens`, policy: Workers R2 Storage Bucket Item Read+Write + Storage Metadata Read, resource = the account) → 200 `jarvis-nexus-r2-s3` active. Per official R2 docs, the S3 credentials are derived from the created token: **Access Key ID = token id, Secret Access Key = SHA-256(token value)** — both computed and stored in `.env.local` + Railway (never printed/committed). The new token authenticates and reaches the R2 API |
| Blocked (account state) | R2 itself is **not enabled on the Cloudflare account**: every R2 endpoint (list/create buckets, with both the original and the new token) returns `403 code 10042 "Please enable R2 through the Cloudflare Dashboard"`. The API message itself states this is a dashboard action; enabling R2 requires a payment method — a billing action that cannot be performed with an API token. Once the owner enables R2 (Dashboard → R2 → Enable), uploads activate with ZERO code changes (client + credentials are ready) |

## Railway — PRODUCTION VERIFIED (live deployment)

| State | Evidence |
|---|---|
| Discovered | `RAILWAY_API_TOKEN` in `.env.local` |
| Configured | `.env.local` + the deployment's own runtime env; runtime status: `src/lib/nexus/integrations/index.ts` (projects + latest-deployment + public URL) |
| Authenticated | GraphQL `projects` query → 200 (workspace token). `me` is not readable by this token (field-level restriction; querying `me` together with other fields nulls the whole response — this caused the earlier session's false "0 projects" reading; fixed in the verifier) |
| Permissions verified | **Write access CONFIRMED by real mutations**: `variableUpsert` → true, `variableDelete` → true (probe variable created and removed — clean), `volumeCreate` → success. Schema introspection available (255 mutations) |
| Real operations | Project `reasonable-heart` (created by owner 2026-11-12T14:49) — service **Jarvis-Nexus** deployed from GitHub `jamesrudh-arch/Jarvis-Nexus@main` (repo trigger). Deployment `b320d328` SUCCESS (image digest recorded). **Persistent volume created at `/data`** (SQLite home, matches Dockerfile). **19 environment variables written** (DATABASE_URL + all service credentials) |
| Production | **Live at `https://jarvis-nexus-production.up.railway.app`** — `/api/v1/health` answered 200 (was `degraded: DATABASE_URL missing` before this session's env writes; the post-push deployment boots with the volume + full env). Deployment status verified via API after push |

## Supabase — CONFIGURED; PROJECT URL IS THE SINGLE MISSING IDENTIFIER

| State | Evidence |
|---|---|
| Discovered | `SUPABASE_ACCESS_TOKEN` (**`sb_secret_…` project-scoped secret key**, format-verified) + `SUPABASE_DB_PASSWORD` in `.env.local` |
| Configured | `.env.local` + Railway production variables; runtime: `src/lib/nexus/integrations/supabase.ts` — data-plane client (PostgREST select/upsert, service health) activates the moment `SUPABASE_URL` is set; management client activates with an `sbp_` PAT |
| Authenticated | Management API **rejects** the `sb_secret_` key with `401 "JWT could not be decoded"` (real response — it expects an `sbp_` personal access token). Header variants tried (Bearer / apikey / both / both paths) — established by attempt, not assumption |
| Missing identifier | The **project URL** (`https://<ref>.supabase.co`, Dashboard → Settings → API). Searched: repo, git history, `.env*` files, reference repos, Railway project variables — not present. The `sb_secret_` key cannot list projects (management API rejects it), so the ref cannot be self-discovered. Owner action: paste `SUPABASE_URL` (or provide an `sbp_` PAT which enables project listing) |
| Production | Credentials staged on Railway; when `SUPABASE_URL` is added the data-plane client goes live with zero code changes |

## Epic Online Services — CLIENT ID VERIFIED; SECRET/PRODUCT/DEPLOYMENT IDS REQUIRED

| State | Evidence |
|---|---|
| Discovered | `EPIC_CLIENT_CREDENTIAL` in `.env.local` — **Epic CLIENT ID format** (`xyza7891…`, 32 chars; classified, not guessed) |
| Configured | Copied to `EPIC_CLIENT_ID` in `.env.local` + Railway; consumed by `unreal/Plugins/JarvisNexusEOS` (C++: `EOS_Platform_Create` + client-credentials login) via `src/lib/nexus/integrations/eos.ts` |
| Authenticated (attempt) | **Real OAuth attempt**: `POST api.epicgames.dev/epic/oauth/v2/token` with client-credentials grant using the supplied ID as both id+secret → `400 invalid_client` (`errors.com.epicgames.account.invalid_client_credentials`); with empty secret → `invalid_client` header error; control probe with bogus id → same invalid-credentials error. **Established by attempt: the client secret is genuinely required and was not among the stored credentials** |
| Missing values | `EPIC_CLIENT_SECRET`, `EPIC_PRODUCT_ID`, `EPIC_DEPLOYMENT_ID` (EOS Developer Portal → product → EOS settings). EOS auth happens inside the SDK at engine runtime — no REST verification exists |

## Blender / Unreal (local runtimes) — CONFIGURED, AWAITING EXTERNAL EXECUTION

- `BLENDER_MCP_HOST=127.0.0.1`, `BLENDER_MCP_PORT=9876` configured (`.env.local`); runtime client `blenderMcp.ts`; addon `blender/jarvis_blender` (bpy operators + MCP-style TCP server). Execution requires Blender 4.2+ on any host (no credential to verify — local software).
- `UNREAL_BRIDGE_URL` intentionally empty until the owner opens `unreal/` in UE 5.5 and runs the whitelisted Python bridge (see `unreal/README.md`).

## Security posture

- All secrets live ONLY in gitignored `.env*` (verified: `git check-ignore`; secrets audit over all tracked files — zero matches before push).
- Production variables on Railway are stored by Railway (encrypted at rest); the API surface (`/api/v1/integrations`) exposes connection state + identities ONLY — verified: no route dumps `process.env`, no route forwards service operations to anonymous callers (grep-verified).
- Probe variables created during write tests were deleted (Railway variables map verified empty of probes).
- UE bridge accepts a fixed command whitelist (no arbitrary execution); Blender bridge likewise.
- Kaggle tokens are used server-side only (Node runtime routes).
- Standing recommendation: rotate the GitHub PAT (it was pasted in chat during the original directive).
