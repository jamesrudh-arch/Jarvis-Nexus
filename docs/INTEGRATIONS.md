# JARVIS NEXUS — Integration Audit Register (Session 6, 2026-11-13)

Live-verification evidence: `scripts/verify_integrations.py` (honest verifier —
exercises REAL storage CRUD, real OAuth, per-account Kaggle identity),
`scripts/verify_credentials_v2.py` (session-6 ground-truth probe),
`scripts/recover_missing_creds.py` (credential recovery from Railway after
`.env.local` was lost to a sandbox recycle), `scripts/sync_railway_env.py`
(production env alignment), `GET /api/v1/integrations` + `GET /api/v1/storage`
(runtime status surfaces). Statuses below are the results of REAL
authenticated calls against each service on 2026-11-13 — no fabricated
claims. Secrets live ONLY in gitignored `.env*` files.

## Audit states used (per directive)

**Discovered** (credential found in secure storage) → **Configured**
(environment variable wired, runtime client initialised) → **Authenticated**
(real API call accepted the credential) → **Permissions verified** (actual
scopes/identities enumerated) → **Real operations successful** (non-trivial
read/write executed and verified) → **Production verified** (live deployment
exercises the integration).

## Supabase — STORAGE BACKEND, REAL OPERATIONS VERIFIED (production verified)

| State | Evidence |
|---|---|
| Discovered | `SUPABASE_URL` (project `fccvmedhmlofgiwjrjrp`), `SUPABASE_ACCESS_TOKEN` (new-format `sb_secret_` secret key), `SUPABASE_SERVICE_ROLE_KEY` (owner-supplied JWT, payload role=service_role — treated as privileged, server-side only), `SUPABASE_DB_PASSWORD`; all recovered/recorded in `.env.local` |
| Configured | `.env.local` + Railway production variables; runtime: `src/lib/nexus/integrations/supabase.ts` — full client (buckets, objects, PostgREST, usage/quota guardrails). Storage is THE project storage per owner directive (R2 retired) |
| Authenticated | `GET /rest/v1/` → 200; `GET /auth/v1/health` → 200 (GoTrue v2.197.0); `GET /storage/v1/bucket` → 200. Key matrix live-verified: BOTH the `sb_secret_` key and the service_role JWT authenticate on rest+storage+auth (sb_secret_ preferred) |
| Permissions verified | service-role data-plane scope confirmed: bucket create/list, object write/read/delete all permitted; private-bucket anonymous access correctly rejected (HTTP 400) |
| Real operations | **Full storage CRUD, verified twice (probe + verifier)**: created PRIVATE buckets `jarvis-nexus-verify` + `jarvis-nexus-assets` (10 MiB per-file limit) → uploaded probe object → **byte-identical readback** → deleted → readback gone (400/404). PostgREST select surface reachable (OpenAPI descriptor 200) |
| Production | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `NEXUS_STORAGE_BUCKET` on Railway; `/api/v1/storage` (owner-key-guarded HTTP surface) + §6 tool layer (below) exercise the backend end-to-end |
| Quota guardrails | 1 GiB free-tier budget enforced: uploads rejected past 920 MiB estimated usage; per-file cap 10 MiB; usage surfaced in `/api/v1/integrations` + `/api/v1/storage` |

## §6 Tool execution — REAL OPERATIONS VERIFIED (production verified)

The brain's directive contract now carries `tool_calls`; the server executes
them against live services and a follow-up LLM turn speaks the ACTUAL results
(`src/lib/nexus/tools.ts` + `toolContract.ts`, `conversations/send` route).
Verified end-to-end 2026-11-13 BOTH locally (LLM present) and ON PRODUCTION
(Railway, where the LLM provider is unavailable — see the note below):

- **storage.put**: owner asked to store a note → real Supabase write,
  readback verified; reply spoken from the actual tool result (locally via
  LLM, on production via the deterministic `composeToolReply` template);
  independent readback via `/api/v1/storage` returned the exact content both
  places.
- **storage.delete + honesty guard**: first attempt exposed a REAL defect — the
  LLM claimed "deleted" without executing (object still present). Fixed with
  MANDATORY tool rules + a deterministic server-side guard
  (`detectImplicitStorageTool`: explicit verb + file key → force-execute).
  Re-test local + production: tool executed, `tool_results ok:true`, independent
  verification HTTP 404 (really gone).
- **kaggle.datasets**: "search Kaggle for datasets about wind turbine blade" →
  16 REAL dataset refs returned and spoken (e.g.
  `mohammadshekaramiz/small-wind-turbine-blade-dataset-cai-swtb`). Bug found
  and fixed en route: `datasets/list?maxSize=` is a BYTE filter (returned 0);
  the correct parameter is `pageSize`.
- **storage.get / storage.list**: covered by the same guard + unit tests
  (46/46); retrieval force-executes on explicit "read back <key>" phrasing
  instead of quoting dialogue history.

**Production LLM provider note (RESOLVED session 7):** the `zai_cloud_route`
provider authenticates via the z-ai SDK's ambient credentials, which exist in
the development sandbox but NOT on the Railway deployment — and provably
CANNOT: `internal-api.z.ai` resolves to a private address (172.25.x.x,
verified 2026-11-13), so no credential could ever make it serve production.
The D6 resolution shipped in session 7: the default LLM chain is now
`cloudflare_workers_ai -> zai_cloud_route`.

| Provider | Config | Free tier (verified sources) | Activation |
|---|---|---|---|
| `cloudflare_workers_ai` | self-configured from the EXISTING `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (or `CF_AI_API_TOKEN`), model `NEXUS_CF_AI_MODEL` (default `@cf/meta/llama-3.1-8b-instruct`) | Workers AI: 10,000 Neurons/day free, no card, no subscription; beyond the allocation requests are REJECTED, not billed (developers.cloudflare.com/workers-ai/platform/pricing; /configuration/open-ai-compatibility) | automatic on the next deploy — zero new env vars; in-process daily request budget (`NEXUS_CF_AI_DAILY_REQUESTS`, default 300) |
| `openai_compatible` | `LLM_OPENAI_COMPAT_URL` + `LLM_OPENAI_COMPAT_KEY` + `LLM_OPENAI_COMPAT_MODEL` | whatever engine the owner points it at (local Ollama/LM Studio/vLLM = free on own hardware; or any free-tier cloud) | set the three env vars |

Verified in session 7: 9/9 module E2E (incl. two REAL z-ai turns in-sandbox
with multi-turn recall) + 6/6 HTTP E2E through the real conversation route
(context retention: the turn-2 provider request carries turn-1 content in
the 8.2k-char history-carrying system prompt; tool calling with honest
`tool_results`; provider killed → honest degraded reply, no crash).

## GitHub — PRODUCTION VERIFIED

| State | Evidence |
|---|---|
| Discovered | `GITHUB_TOKEN` + `GITHUB_REPO` — recovered from Railway production variables after the sandbox recycle (`.env.local` had been lost; recovery script writes values without printing) |
| Configured | `.env.local` + Railway production variables |
| Authenticated | `GET /user` → 200, identity `jamesrudh-arch` (id 355075328) |
| Permissions verified | repo `jamesrudh-arch/Jarvis-Nexus`: admin/maintain/push/triage/pull all true |
| Real operations | Session-6 commits pushed and verified (see git log + ls-remote) |
| Production | The Railway service deploys from this repo (repo trigger) |

## Kaggle ×6 — REAL OPERATIONS VERIFIED

| State | Evidence |
|---|---|
| Discovered | `KAGGLE_API_TOKEN_1..6` (KGAT_ tokens, owner re-supplied 2026-11-13) |
| Configured | `.env.local` + Railway production variables; runtime: per-account verify, round-robin routing, dataset discovery (fixed), private kernel push |
| Authenticated | `GET /api/v1/hello` → 200 for each: jimcreat, wikeyoung, deyoungsltd, bittrexminingltd, wikeyoung5, youngwilly (all six re-verified today) |
| Permissions verified | Per-account identity + data-plane read scope live |
| Real operations | `kernels/list?user=<name>` → 200 per account (live today); `datasets/list` search → real results via the §6 tool (16 refs, see above). Write-plane (kernel push) deliberately NOT exercised in tests — it creates permanent objects on the owner's accounts; the code path exists and is quota-tracked per account |
| Production | Tokens on the Railway deployment; resource manager server-side only |

## Cloudflare — AUTHENTICATED (account); R2 RETIRED BY DIRECTIVE

| State | Evidence |
|---|---|
| Discovered | `CLOUDFLARE_API_TOKEN` (re-supplied 2026-11-13) + `CLOUDFLARE_ACCOUNT_ID` (recovered from Railway) |
| Configured | `.env.local` + Railway |
| Authenticated | `GET /accounts` → 200: `Jamesrudh@gmail.com's Account` (id matches). Token is account-scoped: `/user/tokens/verify` answers 401 for this class (expected, not a fault) |
| R2 | **RETIRED by owner directive 2026-11-13** — Supabase is the storage backend. No R2 API calls are made; the account never had R2 enabled (error 10042, a dashboard billing action). The SigV4 client code is kept dormant for history; R2 credentials were removed from Railway (`R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` deleted — verified none remain) |
| Free services | No Cloudflare service is currently required by the architecture (storage: Supabase free tier; deployment: Railway free tier). The verified token remains available if a genuinely free Cloudflare capability is needed later |

## Railway — PRODUCTION VERIFIED (live deployment)

| State | Evidence |
|---|---|
| Discovered | `RAILWAY_API_TOKEN` (re-supplied 2026-11-13) |
| Configured | `.env.local` + the deployment's own runtime env; runtime status surface reports project + latest deployment + public URL |
| Authenticated | GraphQL `projects` query → 200 (workspace token; `me` field not readable by this token class — known, accounted for) |
| Permissions verified | Write access confirmed earlier by real mutations (variableUpsert/Delete, volumeCreate); re-exercised today: 16 variables upserted + 3 deleted via `scripts/sync_railway_env.py` |
| Real operations | Project `reasonable-heart`, service **Jarvis-Nexus** (GitHub repo trigger, persistent volume `/data`): 37 production variables now include SUPABASE_URL / SERVICE_ROLE_KEY / EPIC_* IDs / OWNER_KEY / NEXUS_STORAGE_BUCKET; zero R2 leftovers |
| Production | **Live at `https://jarvis-nexus-production.up.railway.app`** — `/api/v1/health` 200 (core online); post-push deployment re-verified |

## Epic Online Services — REAL OAUTH VERIFIED (session 7; the final credential supplied)

| State | Evidence |
|---|---|
| Discovered | Owner-supplied 2026-11-13: Product `Jarvis nexus` (`EPIC_PRODUCT_ID`), `EPIC_CLIENT_ID` (xyza7891… format), `EPIC_CLIENT_SECRET` (supplied session 7), `EPIC_DEPLOYMENT_ID`, `EPIC_SANDBOX_IDS`; Sandbox Type live, Deployment Name live |
| Configured | `.env.local` (values never printed; sandbox copy rebuilt after the recycle). Railway: ships with `scripts/sync_railway_env.py` (UPSERT list includes EPIC_CLIENT_ID + EPIC_CLIENT_SECRET). Unreal plugin: template `jarvis_nexus_eos.example.json` + generator `scripts/write_eos_plugin_config.py` (real file gitignored, mode 600) |
| Authenticated (REAL) | Client-credentials OAuth against the documented EOS Game-Services endpoint `https://api.epicgames.dev/auth/v1/oauth/token` → **HTTP 200 bearer JWT**, `expires_in 3599 s`, repeatable deployment-scoped + product-level grants. (Root cause of the session-6 400s: the EAS surface `/epic/oauth/v2/token` rejects client-credentials with `client_missing_application_id` — wrong endpoint, not wrong credentials.) |
| Identifier associations | JWT claims decoded (never the secret): `clientId` == EPIC_CLIENT_ID, `productId` == EPIC_PRODUCT_ID, `sandboxId` == EPIC_SANDBOX_IDS, `deploymentId` == EPIC_DEPLOYMENT_ID — **ALL MATCH**; `env=prod`, `tokenType=clientToken`, 11 EOS features granted (Achievements, Ecom, EosConnect, Leaderboards, Matchmaking, Metrics, PlayerReports, …) |
| Verification scripts | `scripts/verify_eos_oauth.py` (8-step protocol: locate → configure → real auth → claims → repeat grants → verify → record); `src/lib/nexus/integrations/eos.ts` performs the live exchange + claims checks (reports `authenticated: true` when the secret is present); `scripts/verify_integrations.py` `eos:oauth` row does the real exchange |
| Exposure audit | Secret sha256[:12]=d4223dc3e5a7 — 0 hits in 436 tracked files, 0 in all 954 git-history objects, 0 in the local build output, 0 in the 8 live production JS bundles |
| Runtime consumer | unreal/JarvisNexusEOS (EOS SDK at engine runtime) + ios/JarvisNexus |

## /api/v1/storage — REAL OPERATIONS VERIFIED (owner HTTP surface)

Guarded surface over the Supabase backend: `GET` status (public metadata
only), `GET/PUT/DELETE ?key=` (require `X-Owner-Key` == server-side
`OWNER_KEY`, deny-by-default when unset). E2E verified 2026-11-13: wrong key
→ 403; no key → 403; traversal key (`../etc/passwd`) → 400; valid upload →
`verified:true` (readback); download → byte-identical (binary-safe); delete →
404 on re-read. Key sanitization unit-tested (44/44 suite).

## Blender / Unreal (local runtimes) — CONFIGURED, AWAITING EXTERNAL EXECUTION

- `BLENDER_MCP_HOST=127.0.0.1`, `BLENDER_MCP_PORT=9876`; runtime client
  `blenderMcp.ts`; addon `blender/jarvis_blender`. Execution requires Blender
  4.2+ on any host (no credential to verify — local software).
- `UNREAL_BRIDGE_URL` intentionally empty until the owner opens `unreal/` in
  UE 5.5 and runs the whitelisted Python bridge (see `unreal/README.md`).

## Security posture

- All secrets live ONLY in gitignored `.env*` (`git check-ignore` verified;
  secrets audit over all tracked files + git history — zero matches before push).
- The owner-supplied "anon key" is actually a **service_role JWT** — it is
  stored as `SUPABASE_SERVICE_ROLE_KEY`, used server-side only, and NEVER
  shipped to the client. The frontend never receives any service credential.
- `/api/v1/storage` mutations/downloads are deny-by-default behind
  `X-Owner-Key` (random 64-hex generated server-side, stored in Railway env +
  `.env.local` only); the status surface exposes metadata only.
- Storage keys are sanitized (no traversal, no absolute paths, ≤128 chars,
  extension-checked) in both the tool layer and the HTTP surface; per-file
  10 MiB cap; free-tier quota guard at 920 MiB.
- `/api/v1/integrations` exposes connection state + identities ONLY.
- UE bridge accepts a fixed command whitelist (no arbitrary execution);
  Blender bridge likewise. Kaggle/Supabase/GitHub/Railway tokens are used
  server-side only (Node runtime routes).
- Standing recommendation (unchanged): rotate the GitHub PAT and the
  re-supplied tokens after development stabilizes; they were pasted in chat.
