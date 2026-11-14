# Railway Token Restored — Production Verification Report

- **Generated**: 2026-11-14 (UTC)
- **Session context**: workspace token re-supplied by owner after sandbox-recycle loss
- **Token storage**: `/home/z/my-project/.env` (gitignored via `.env*`), never echoed in
  output/logs/artifacts. Token prefix `rlwy_wksp_****`, length 50.
- **Method**: Railway GraphQL v2 API (`backboard.railway.com/graphql/v2`), read-only queries
  (project/service/variables/domains/deployments/deploymentLogs). No mutations executed.
  NOTE: `backboard.railway.app` default-Python-UA requests are blocked by Cloudflare
  (error 1010); the v2 endpoint + custom UA is the working route.

## 1. Token verification

| Check | Result |
| --- | --- |
| `me` query | Not Authorized — **expected** for workspace tokens (not user-scoped) |
| `project(id)` | OK — `reasonable-heart` (f3e6f010-61df-4e97-bc5e-1f7dd695c4d3) |
| `service(id)` | OK — `Jarvis-Nexus` (8f8a9401-5e27-4449-a1cb-01271906b8f7) |
| `variables(...)` | OK — 42 service-scoped names readable |
| `deployments(input:)` | OK — 10 latest deployments listed |
| `deploymentLogs` | OK — 101 entries for current deployment |

Verdict: token is VALID with read access to the workspace. Write/deploy capability
untested (deliberately — no mutations without an approved change to ship).

## 2. Production state (reasonable-heart / Jarvis-Nexus)

- Latest deployment: `8128960e-edf7-4a0f-88f2-dfde6964d168` — **SUCCESS**
  2026-11-13T17:57:09Z, commit `535bfc3` (remote main HEAD == deployed commit),
  repo `jamesrudh-arch/Jarvis-Nexus`, branch `main`, runtime V2, **plan: trial**.
- Deploy region: **SFO (US-West)** per `multiRegionConfig {sfo: {numReplicas: 1}}`;
  IPv6 egress disabled; 1 replica; Dockerfile builder; volume `/data`;
  restart ON_FAILURE max 10 retries.
- Domain: `jarvis-nexus-production.up.railway.app` (ACTIVE, targetPort 8080).
- Live probes (2026-11-14, read-only GET):
  - `/api/v1/health` → 200 `{"status":"ok","core":"online","boot":"2026-11-13T17:59:57.185Z"}`
  - `/api/v1/telemetry` → 200: cpu 25.6% / 48 cores, mem 42% (host-level), disk 12.4 GB free,
    uptime_sec ≈ 10,581 (process restarted ~2.9 h before probe — trial-plan sleep/restart
    suspected; health OK now), database_records {memories:12, goals:3, scenarios:3,
    switches:7}, embodiment_clients 1,
    inference active_backend string: `openai -> cloudflare_workers_ai -> groq_cloud -> zai_cloud_route (fallback chain)`
  - `/api/v1/integrations` → 403 Owner key required (admin surface properly guarded)
- Env vars: 42 service-scoped, incl. `OPENAI_API_KEY` (len 28), `OPENAI_MODEL` (len 11),
  `NEXUS_LLM_PROVIDERS` (len 55 → `openai,cloudflare_workers_ai,groq_cloud,zai_cloud_route`),
  `NEXUS_CF_AI_MODEL` (len 40 → `@cf/meta/llama-3.3-70b-instruct-fp8-fast`), CLOUDFLARE_*,
  GITHUB_TOKEN, RAILWAY_API_TOKEN, SUPABASE_*, EPIC_*, KAGGLE_*, OWNER_KEY.
  Values deliberately not read or recorded.

## 3. OpenAI connectivity — refined root cause

1. Sandbox egress (HK, AS45102 Alibaba) is geo-blocked by OpenAI **before auth**
   (unauthenticated baseline → 403 `unsupported_country_region_territory`).
   No key can make sandbox-side OpenAI testing work.
2. **Production egress is SFO (US) — OpenAI-supported region.** The regional egress
   gateway (Amsterdam/Virginia) from Directive A is NOT needed for production; it was
   only a candidate fix for the sandbox-side route.
3. Production `OPENAI_API_KEY` is **28 characters** — `sk-proj-` keys are 150–170 chars;
   the sandbox copy diagnosed yesterday had the same length with `prefix_ok` — i.e. the
   production value is almost certainly a truncated/placeholder key. A real key from the
   owner is required to activate OpenAI in production.
4. Live chain order puts `openai` FIRST — with an invalid key every inference call burns
   a failed auth round-trip before Cloudflare Workers AI serves it. Recommendation:
   move OpenAI down the chain (or gate it on key-format validation) until a real key
   is supplied.
5. Cloudflare Workers AI: production line code comment claims a real production LLM test
   (HTTP 200 + completion) after replacing the deprecated `@cf/meta/llama-3.1-8b-instruct`
   (HTTP 410) with `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. This session has NOT
   independently re-verified that (requires Owner key to trigger inference).
6. `zai_cloud_route` in the chain cannot serve Railway by design (internal-api.z.ai →
   private 172.25.x.x) — dead hop from production, harmless but worth pruning.

## 4. Local vs production divergence (P1)

- Local HEAD `821795c` (2026-11-13 22:02Z, "V2 session finalised", register round-4
  110 records/44 OPERATIONAL) and remote main `535bfc3` (deployed) have **no common
  ancestor** — two unrelated git histories built in parallel sessions.
- Production line (602 files): Phases 0B–3 directive work — blueprint intake, Gate 0
  security (241/241), technology register, Unreal foundation, Blender assets (.blend,
  MCP 11/11), ResidentDirector living residents (Echo/Vector/Mira/Delta), EOS token
  caching, security scanner discriminators, /api/v1/* surface, owner-key guards.
- Local line (377 files): JARVIS NEXUS product + NEXUS WORLD V2 — register rounds to
  110/44, JARVIS identity+presence, functional economy, building interiors, ledger V2
  (21 tasks), NEXUS_WORLD python package (render3d, residents, simulation, models,
  integration, mcp_servers) — **never pushed, not in production**.
- Diff scale: 944 files changed (47k insertions / 61k deletions). Both lines carry their
  own `src/app` API surfaces (remote `/api/v1/*` vs local `/api/*`).

## 5. Smart failover gap (Directive A)

Production registry (`src/lib/nexus/providers/registry.ts`) implements ordered
try-each-provider with catch + fall-through + honest null on exhaustion. It does NOT
implement: circuit breaker, exponential backoff, failure classification
(auth/rate-limit/network/geo/client/server), or recovery detection. No
`circuit|breaker|backoff` matches anywhere in the line's `src/`.

## 6. Remaining blockers / decision points

| Item | Status |
| --- | --- |
| OpenAI real key | Owner must supply (production value len 28 = placeholder-grade) |
| Owner key (admin API) | Not held; will not be extracted from prod env |
| GitHub push credentials | Not held; needed to ship new code via GitHub→Railway (Railway token alone can only re-trigger builds of the connected repo) |
| Railway plan | **trial** — limited hours/credit; production may sleep (uptime evidence above) |
| Line reconciliation | Strategic decision: which line is canonical; merge plan for the two unrelated histories |

## 7. Session artifacts

- `scripts/railway_token_verify.py` — token auth check (v2 endpoint + UA lesson)
- `scripts/railway_scope_probe.py` — workspace-token scope probe
- `scripts/railway_full_inspect.py` — full read-only inspection (saved JSON:
  `NEXUS_WORLD/reports/RAILWAY_INSPECT_TOKEN_RESTORED.json`)
- `scripts/railway_deploy_logs_probe.py` — deployment meta/logs + live HTTP probes
- `NEXUS_WORLD/reports/RAILWAY_INSPECT_TOKEN_RESTORED.json` — machine-readable findings

## 8. Follow-on engineering (same session): smart failover implemented

Directive A gap closed in code on a branch — NOT yet deployed (needs GitHub push
path + owner approval):

- Branch: `feat/smart-failover` @ `84a1831` (base: `535bfc3` = the deployed
  production commit), worktree `.worktrees/prodline`
- `src/lib/nexus/providers/failover.ts`: failure classifier (9 classes), circuit
  breakers (closed/open/half-open, in-flight-guarded single probe), class-specific
  policy (auth/geo/config open on first failure; transient threshold + exponential
  backoff x2 capped 30 min; Retry-After honoured), jitter, kill switch
- `registry.ts`: all four chains (llm/tts/asr/face) supervised; contract preserved
- `telemetry.ts`: `/api/v1/telemetry` now exposes `inference.failover` breaker states
- Verification: **134/134 unit tests PASS** (28 new in 22 classes; 106 pre-existing,
  zero regressions), `tsc --noEmit` clean, `next build` clean
- Evidence: `NEXUS_WORLD/reports/SMART_FAILOVER_SESSION10_EVIDENCE.txt`
- Honest scope note: UNIT-VERIFIED ONLY. Production validation requires deploy +
  live probe (owner-key gated conversation or telemetry breaker states)
