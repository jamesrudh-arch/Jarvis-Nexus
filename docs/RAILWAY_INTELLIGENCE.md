# Railway Infrastructure Intelligence — @nexus/railway

**Owner directive:** 2026-11-15 "Ultimate Railway Infrastructure Intelligence" — engineer a
production-grade Railway intelligence capability inside JARVIS NEXUS: understand, monitor,
investigate, and — only under explicit authorization — operate its own infrastructure.

**Status:** implemented, tested (162 pass / 0 fail / 4 pre-existing credential-gated skips),
live-verified READ-ONLY against production Railway. Production was NOT modified: no deploy,
no mutation, ever, during this work (asserted by live test).

---

## 1. What was built

| Layer | Files | Capability |
|---|---|---|
| Credentials | `packages/railway/src/credentials.ts` | env-only intake, token-type detection (Bearer vs `Project-Access-Token`), rotation, redaction, fail-closed |
| Client | `src/client.ts` | GraphQL client: timeouts, retry/backoff (query vs mutation semantics), rate-budget guard, circuit breaker, TTL cache, 13-kind error classification, structured redacted events |
| Contract | `src/contract.ts` + `contract/expected-fields.json` | machine-generated live-schema baseline (41 types/12 enums, captured 2026-11-15); USED_FIELDS subset test; live drift detection (BREAKING/WARNING/INFO) |
| Discovery | `src/discovery.ts` | workspace/projects/environments/service instances (latest deployments, domains incl. nested `CustomDomainStatus`)/deployment history/volumes/backups+schedules/platform status/events; honest classification (discovered/inaccessible/missing/unsupported/unverified); **the `variables` query is never issued (returns secret values)** |
| Monitoring | `src/monitoring.ts` | five INDEPENDENT dimensions — api, deployment, application (direct HTTP), dependencies (app `/health/detailed` + platform), infrastructure — never conflated; every dimension always carries evidence |
| Cost | `src/usage.ts` | measured (`workspaceUsageTotals`) vs estimated (`estimatedUsage`) kept distinct; volume pressure; configurable thresholds; heuristic-labelled anomalies; no fabricated currency (the schema exposes no workspace USD total for workspace tokens — stated in every report) |
| Diagnostics | `src/diagnostics.ts` | 14-step investigation; CONFIRMED/PROBABLE/POSSIBLE/UNKNOWN with documented confidence scale (0.9/0.6/0.3/0.1); evidence from logs, lifecycle events, platform status, app health; recommendations carry exact permission levels; results persisted + audited + remembered (memory scope `railway`, tier `operational`) |
| Authorization | `src/authorization.ts` | L1–L4 permission model; 23-operation registry covering every directive-protected class; **agents are never granted** (an agent's internal approval is not owner authorization); single-use, 15-min, resource-scoped grants; READ-ONLY default refuses all mutations; every decision audited |
| Recovery | `src/recovery.ts` | L2 planning (no side effects); L3/L4 execution gated by grant + non-read-only; **post-execution independent verification re-queries the actual resulting state for deployment/service operations** (deployment + service instance); other operation classes record the mutation acknowledgement, explicitly labelled as NOT independent verification |
| Events | `src/events.ts` | webhook receiver: fail-closed when unconfigured, constant-time `X-Webhook-Secret`, zod validation, replay window, fingerprint dedup, out-of-order-safe persistence, **every accepted event reconciled against the authoritative API** (webhooks are prompts, not truth — Railway does not sign payloads, verified in docs); rate-budget-aware poller with jitter + checkpoints |
| Reconciliation | `src/reconciliation.ts` | actual vs internal diff (missing_in_actual / missing_in_internal / status_mismatch / stale_record); history retained; internal records never silently overwritten; `whatChanged()` |
| Audit | `src/audit.ts` | SHA-256 hash-chained append-only `railway_audit` table; `verify()` detects modification AND deletion; evidence redacted at write time; no update/delete API exists |
| Backup | `src/backup.ts` | Railway volume backups: existence + schedules, honestly `UNVERIFIED` for recovery; **logical backups of the NEXUS store with a REAL isolated in-memory restore + row-exact verification** |
| Intelligence | `src/intelligence.ts` | answers the owner's 11 infrastructure questions from live data only; degraded states say so, nothing fabricated |
| Threat model | `src/threat-model.ts` | 15 threats × 7 fields (threat/attack surface/impact/controls/mitigation/verification/residual risk) |
| Facade | `src/index.ts` | `RailwayIntel` + `railwayFromEnv`; modes: `unconfigured` / `read_only` (default) / `full` |

## 2. Integration into JARVIS NEXUS

- **HTTP** (`apps/nexus-api/src/index.ts`): 20 routes — public `GET /railway/status`
  (cached, fail-visible; statuses only — evidence/topology detail is owner-gated); owner-gated control plane (monitor, discovery, usage, credentials
  status, contract check, events, audit (+`?verify=true` chain check), backups, backup
  export, reconcile, diagnose, intelligence, operations registry, recovery plan/authorize/execute);
  `POST /railway/webhook` verified by the per-project secret (constant-time), never the owner key.
- **JARVIS tools**: `railway.status`, `railway.intelligence`, `railway.diagnose` (read-only);
  `railway.recovery.execute` (consequential — orchestrator approval gate + railway grant: two
  independent gates).
- **Health**: `railway` probe in `/health` — cached, non-blocking, unconfigured = degraded
  (never healthy without data).
- **Memory**: infrastructure observations written to scope `railway` (tier `operational`).
- **Metrics**: bounded labels (`railway` in `KNOWN_ROUTES`; `railway_api_requests_total`,
  `railway_api_failures_total`, `railway_events_total`).
- **Persistence**: db migration 3 (`railway_events`, `railway_audit`, `railway_state`).
- **Credential isolation**: the token lives only inside `@nexus/railway`; never in MCP
  registrations, NAEI workspaces, tool params, logs or HTTP responses.

## 3. Verified live facts (2026-11-15)

- Endpoint `https://backboard.railway.com/graphql/v2`; workspace token (Bearer) — **cannot
  query `me`** ("Not Authorized" on HTTP 200): personal-resource queries need account tokens.
- Rate limit observed: `RateLimit-Policy: "default";q=1000;w=3600` (Hobby), headers
  `X-RateLimit-Limit/-Remaining/-Reset` + `Retry-After` on 429.
- Live schema: 387 object types, 165 queries, 262 mutations (committed baseline).
- Discovered live: project `reasonable-heart` (f3e6f010…), environment `production`
  (86a07ea1…), service instance **`Jarvis-Nexus` — latest deployment SUCCESS**, volume
  (READY), zero inaccessible classifications.
- Contract drift vs baseline: **no BREAKING drift** (live test).
- **Previous workspace token still VALID** — rotation incomplete; revoke it in the Railway
  dashboard (security recommendation).
- Railway webhooks: unsigned; custom secret headers; unordered best-effort delivery; 3
  retries; 30s timeout (official docs).

## 4. Operating procedures

**Enable webhooks (owner, one-time):** Railway dashboard → project `reasonable-heart` →
Settings → Webhooks → URL `https://jarvis-nexus-production.up.railway.app/railway/webhook`
(after deployment is authorized) → custom header `X-Webhook-Secret: <strong secret>` →
set the same value as the `RAILWAY_WEBHOOK_SECRET` service variable. Until both are set the
receiver answers 503 (fail-closed).

**Run a monitoring cycle:** `POST /railway/monitor` (owner) or wait for the poller
(`RAILWAY_POLL_INTERVAL_MS`, default 60s, requires `RAILWAY_PROJECT_ID`).

**Recovery flow:** `POST /railway/diagnose` → `POST /railway/recovery/plan` →
`POST /railway/recovery/authorize` (owner; refused while `RAILWAY_READ_ONLY=true`) →
`POST /railway/recovery/execute`. Execution re-queries the real state afterwards and records
the outcome in the hash-chained audit.

**Rotate the token:** create a new workspace token in the Railway dashboard → update
`RAILWAY_API_TOKEN` (env / Railway variable) → revoke the old one. `CredentialManager.rotate()`
supports hot-swap; the old token is retained only as `RAILWAY_API_TOKEN_PREVIOUS` for
revocation verification.

## 5. Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `RAILWAY_API_TOKEN` | — | workspace (or account) token; absent = capability degraded, never faked |
| `RAILWAY_PROJECT_ID` | all projects | focus project for discovery/polling/recovery |
| `RAILWAY_READ_ONLY` | `true` | **production protection**: all mutations refused regardless of grants |
| `RAILWAY_WEBHOOK_SECRET` | — | webhook receiver secret; unset = receiver fail-closed |
| `RAILWAY_USAGE_THRESHOLDS` | — | JSON per-measurement alert thresholds, e.g. `{"DISK_USAGE_GB": 8}` |
| `RAILWAY_API_BUDGET_FLOOR` | `50` | refuse non-critical calls below this `X-RateLimit-Remaining` |
| `RAILWAY_POLL_INTERVAL_MS` | `60000` | poller interval (+jitter) |

## 6. Honest limitations (BLOCKED items)

- **INFRA-23** Railway volume-backup restore in production: L4 destructive operation,
  blocked by the read-only directive; volume backups are reported `UNVERIFIED` for recovery.
- **INFRA-24** Production deployment of this capability: a production change; awaits owner
  authorization (push to main auto-deploys). Until then the capability runs from the repo
  against the live API (which is how every live test verifies it).
- Live webhook **delivery** from Railway into the receiver requires the owner dashboard
  configuration above; the receiver itself is fully tested (secret, replay, dedup,
  reconciliation) and the reconciliation path is live-tested via the API.
- `estimatedUsage` returns per-measurement values; no workspace USD billing total is exposed
  to workspace tokens — cost reports never fabricate currency.

## 7. Verification map

All evidence lives in tests (bun test): unit `tests/unit/railway-*.test.ts` (mocked,
labelled), integration `tests/integration/railway-routes.test.ts` (real app + mocked
transport) and `tests/integration/railway-live.test.ts` (**LIVE, read-only, real
production API**), scenarios `tests/scenarios/railway-exercises.test.ts` (A–I).
Registries: requirements INFRA-4…INFRA-26, ledger T-017, technology TECH-014.
