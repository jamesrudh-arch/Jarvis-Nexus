#!/usr/bin/env python3
"""Append Railway-intelligence requirements (INFRA-4..26), ledger task T-017
and technology record TECH-014 to the registries. Preserves existing content."""
import json
from datetime import datetime, timezone

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
T = "tests/unit/railway-{}.test.ts"
LIVE = "tests/integration/railway-live.test.ts (LIVE read-only)"

def ev(kind, ref):
    return {"kind": kind, "reference": ref, "timestamp": NOW}

def req(id, title, behaviour, evidence, status="VERIFIED", depends=None, blocked=None):
    r = {
        "id": id, "product": "PLATFORM", "directive": "§2-§22 (Railway intelligence directive 2026-11-15)",
        "title": title, "behaviour": behaviour, "subsystem": "railway",
        "dependsOn": depends or [], "status": status, "evidence": evidence,
    }
    if blocked:
        r["blockedBy"] = blocked
    return r

new_reqs = [
    req("INFRA-4", "Secure Railway credential management",
        "Token read once from env (gitignored, chmod-600 .env); prefix-family detection with per-type auth header (Bearer vs Project-Access-Token); rotation support; redaction on every surface; unconfigured fails closed (never faked)",
        [ev("test", f"{T.format('credentials')}: format/redaction/rotation/headers; unconfigured fail-closed"),
         ev("test", f"{T.format('client')}: raw token never appears in errors, events or stats"),
         ev("report", "threat model T-01 controls; .gitignore includes credentials.env + .env")]),
    req("INFRA-5", "Live Railway authentication verified",
        "Workspace token authenticates against https://backboard.railway.com/graphql/v2; auth failures arrive as HTTP 200 + 'Not Authorized' (validated independently of HTTP status); project tokens use the Project-Access-Token header",
        [ev("test", f"{LIVE}: credentials authenticate against the real API"),
         ev("test", f"{LIVE}: previous-token status probed without exposure"),
         ev("report", "docs.railway.com/integrations/api (token types, rate limits), fetched 2026-11-15")]),
    req("INFRA-6", "GraphQL client with timeout, retry, backoff, cache, budget guard",
        "Exponential backoff with jitter honouring Retry-After; queries retry on transport failures; mutations retry ONLY when no connection was established; TTL cache for queries; client-side rate-budget floor; circuit breaker",
        [ev("test", f"{T.format('client')}: 429/Retry-After, network retry, mutation-timeout-no-retry, breaker, budget guard, cache")]),
    req("INFRA-7", "API contract intelligence (versioned, drift-detecting)",
        "Machine-generated live-schema baseline committed at packages/railway/contract/expected-fields.json (captured 2026-11-15); USED_FIELDS subset check (unit); live introspection diff flags removed/deprecated/added fields as BREAKING/WARNING/INFO",
        [ev("test", f"{T.format('contract')}: baseline coverage, no variable-VALUE queries, drift severities"),
         ev("test", f"{LIVE}: live schema matches committed baseline (no BREAKING drift)"),
         ev("commit", "packages/railway/contract/expected-fields.json (41 object types, 12 enums)")]),
    req("INFRA-8", "Complete infrastructure discovery with honest classification",
        "Workspace, projects, environments, service instances (+ latest deployments, domains incl. nested CustomDomainStatus), deployment history, volumes, volume backups + schedules, platform status, project events, workspace audit-log metadata; resources classified discovered/inaccessible/missing/unsupported/unverified; variables query NEVER issued (returns secret values)",
        [ev("test", f"{LIVE}: real project/environment/service/volume discovered, zero inaccessible classifications"),
         ev("test", f"{T.format('contract')}: no query document fetches variable VALUES")]),
    req("INFRA-9", "Deployment monitoring",
        "Latest + historical deployment states classified across the verified 13-value DeploymentStatus enum (failed/transitioning/sleeping/removed/approval_needed); per-service-instance evidence",
        [ev("test", f"{LIVE}: monitoring reports five dimensions against real infrastructure"),
         ev("test", "tests/scenarios/railway-exercises.test.ts Scenario A/B")]),
    req("INFRA-10", "Independent application health",
        "Direct HTTP checks to public service domains (healthcheckPath-aware) decoupled from the Railway API; 200 healthy / 503 unhealthy / auth-gated alive / timeout-unreachable; NEVER conflated with deployment success",
        [ev("test", "Scenario B: deployment=healthy AND application=unhealthy reported independently")]),
    req("INFRA-11", "Dependency health",
        "Application's own /health/detailed component view + Railway platform status (incidents/maintenance) as external dependency; correlated, never masked",
        [ev("test", f"{LIVE}: dependencies dimension with platform status evidence")]),
    req("INFRA-12", "Infrastructure health",
        "Volume states and capacity pressure, domain sync statuses, platform incidents; unknown when no projects visible (scope honesty)",
        [ev("test", f"{LIVE}: infrastructure dimension; Scenario E volume pressure")]),
    req("INFRA-13", "Cost & resource intelligence (measured vs estimated, honestly)",
        "workspaceUsageTotals (MEASURED) and estimatedUsage (ESTIMATED) reported separately; observed volume pressure; configurable per-measurement thresholds; anomaly heuristics labelled heuristic; NO fabricated currency (schema exposes no workspace USD total for this token class)",
        [ev("test", f"{T.format('exercises' if False else 'railway-exercises')}: Scenario E thresholds + volume pressure + label separation"),
         ev("test", f"{LIVE}: usage report separates measured from estimated")]),
    req("INFRA-14", "Autonomous diagnostics & root-cause analysis",
        "14-step investigation: affected-resource identification, evidence collection (deployments, logs, lifecycle events, platform status, app health), timeline correlation, cause classification CONFIRMED/PROBABLE/POSSIBLE/UNKNOWN with documented confidence scale, impact, recommendations carrying exact permission levels; persisted + audited + remembered in JARVIS memory scope 'railway'",
        [ev("test", f"{T.format('diagnostics')}: CONFIRMED with log evidence + L3 recommendations; PROBABLE runtime; credential CONFIRMED; UNKNOWN honesty"),
         ev("test", "memory hook records infrastructure observations")]),
    req("INFRA-15", "L1-L4 recovery authorization (agents never self-approve)",
        "Operation registry (23 ops incl. all directive-protected classes); only user:owner can be granted; agents ALWAYS denied; grants single-use, 15-min TTL, resource-scoped, consumed atomically; READ-ONLY mode (default) refuses every mutation; every decision audited",
        [ev("test", f"{T.format('authorization')}: agent denial, single-use/expiry/scope, read-only refusal, registry coverage"),
         ev("test", f"{LIVE}: read-only refuses mutations even with owner principal")]),
    req("INFRA-16", "Authorized execution with independent verification",
        "Execution requires valid grant + non-read-only; post-execution the ACTUAL resulting state is re-queried (deployment + service instance) and compared to expectations; outcomes recorded in the audit chain",
        [ev("test", "Scenario H: diagnose->plan->owner grant->execute(mock)->re-query verification->verified; replay refused"),
         ev("test", "Scenario H: forged grant refused in read-only; zero mutations executed")]),
    req("INFRA-17", "Webhook event intelligence (secret-header, reconciled)",
        "Verified facts: Railway webhooks are unsigned, unordered, best-effort. Receiver: fail-closed when unconfigured, constant-time X-Webhook-Secret comparison, zod payload validation, replay tolerance window, fingerprint dedup, out-of-order-safe persistence, and reconciliation of every accepted event against the authoritative API (prompts, not truth). Owner configures the webhook + secret in the Railway dashboard (documented runbook step)",
        [ev("test", f"{T.format('webhook')}: fail-closed, 401s, replay rejection, duplicate-once, out-of-order, full-stack reconciliation"),
         ev("test", "tests/integration/railway-routes.test.ts: endpoint 202/200-duplicate/401/400/503"),
         ev("report", "docs.railway.com/observability/webhooks (no signatures; custom header verification), fetched 2026-11-15")]),
    req("INFRA-18", "Controlled polling fallback (rate-limit aware)",
        "Poller over the project events query with jittered interval, budget-guard deferral below 100 remaining, idempotent append-only ingestion, checkpointed cursor for restart recovery",
        [ev("test", "Scenario F: missed events ingested, duplicates never double-recorded, checkpoint persisted")]),
    req("INFRA-19", "Infrastructure state reconciliation",
        "Actual (discovery) vs internal (last snapshot) compared: missing_in_actual / missing_in_internal / status_mismatch / stale_record classified; reconciliation history retained; internal records NEVER silently overwritten; whatChanged() diff for the 'what changed' question",
        [ev("test", f"{T.format('reconciliation')}: discrepancy classification, no-overwrite, staleness, history")]),
    req("INFRA-20", "Resilience & degradation",
        "Circuit breaker (closed/open/half-open), exponential backoff with full jitter, request timeouts, TTL cache, graceful UNCONFIGURED/unknown degradation with honest statuses",
        [ev("test", f"{T.format('client')} resilience suite; Scenario G monitoring survives app outage")]),
    req("INFRA-21", "Tamper-evident audit trail",
        "Hash-chained (SHA-256, canonical JSON) append-only railway_audit table: id, timestamp, category, severity, resource, component, outcome, principal, redacted evidence; verify() detects modification AND deletion; no update/delete API exists",
        [ev("test", f"{T.format('audit')}: chain validity, tamper detection (UPDATE + DELETE), credential redaction at write time")]),
    req("INFRA-22", "Logical backup + isolated restore verification",
        "Full read-only export of all 24 NEXUS tables (sha256 per table) + REAL restore into an isolated in-memory database with row-exact comparison; tampering breaks verification; a backup that has never been restored is not claimed recoverable",
        [ev("test", "Scenario I: export -> isolated restore -> rowsMatched; tamper detected"),
         ev("test", "tests/integration/railway-routes.test.ts: POST /railway/backup/export")]),
    req("INFRA-23", "Railway volume backup restore in production",
        "volumeInstanceBackupRestore is registered as an L4 operation; production restore requires owner authorization and is blocked by the read-only production protection",
        [ev("test", f"{T.format('authorization')}: operation registered L4, executable, owner-grant gated")],
        status="BLOCKED",
        blocked={
            "limitation": "Restoring a Railway volume backup in production is a destructive, irreversible operation on live data (wipe semantics) and cannot be performed under the production READ-ONLY restriction",
            "technicalEvidence": "Railway schema: volumeInstanceBackupRestore(volumeInstanceId!, volumeInstanceBackupId!, wipeServiceIds!, replicaServiceIds!) -> WorkflowId; backup reports honestly carry verified:false, recoverability:UNVERIFIED",
            "minimumAdditionalCapability": "Owner disables RAILWAY_READ_ONLY, grants railway.volume.backup.restore for a specific volume+backup pair, and the restore+verification executes against a disposable environment first",
            "continuesIndependently": "Yes — backup discovery, schedules, retention metadata and logical app-level backups (INFRA-22) are fully verified; only the production volume restore is blocked",
        }),
    req("INFRA-24", "Production deployment of the railway intelligence",
        "The @nexus/railway package and /railway routes are committed and fully tested in-repo; deploying them to the Railway production service is a production change that the directive explicitly gates on owner authorization",
        [ev("test", "full suite 162 pass / 0 fail incl. LIVE read-only verification against production Railway API")],
        status="BLOCKED",
        blocked={
            "limitation": "'Keep production READ-ONLY. Do not deploy or modify production infrastructure without my explicit authorization' — deploying the new image would replace the running production deployment",
            "technicalEvidence": "railway.json auto-deploys from main; current production deployment SUCCESS (service Jarvis-Nexus, discovered live 2026-11-15); no deployment was triggered by this work",
            "minimumAdditionalCapability": "Owner authorization to push to main (auto-deploy) or a manual serviceInstanceRedeploy with the new image",
            "continuesIndependently": "Yes — the capability is live-verified from the repository against the real Railway API; only the production rollout awaits authorization",
        }),
    req("INFRA-25", "JARVIS architectural integration",
        "Railway intelligence is an integrated capability, not a dashboard: 20 HTTP routes (public status + owner-gated control plane), JARVIS ToolExecutor tools (read tools unconsequential; railway.recovery.execute consequential + dual-gated), health probe (fail-visible, non-blocking), memory scope 'railway' (tier operational), bounded metric labels, credential isolation from MCP/NAEI",
        [ev("test", "tests/integration/railway-routes.test.ts: 17-route 401 matrix, health component, tools registration/approval classes, intelligence Q&A"),
         ev("test", f"{T.format('diagnostics')}: memory hook integration")]),
    req("INFRA-26", "End-to-end operational exercises",
        "Directive §17 Scenarios A-I exercised: A deployment-failure investigation, B app-outage independence, C credential failure (live garbage-token + previous-token probe), D discrepancy detection, E usage anomalies, F lost-event recovery, G monitoring independence, H authorized recovery loop (isolated) + read-only refusals, I backup restore verification",
        [ev("test", "tests/scenarios/railway-exercises.test.ts (12 tests) + live variants in railway-live.test.ts"),
         ev("report", "docs/RAILWAY_INTELLIGENCE.md exercise matrix")]),
]

# --- requirements.json ---
with open("registry/requirements.json") as f:
    reqs_doc = json.load(f)
existing = {r["id"] for r in reqs_doc["requirements"]}
for r in new_reqs:
    assert r["id"] not in existing, f"collision: {r['id']}"
reqs_doc["requirements"].extend(new_reqs)
reqs_doc["generatedAt"] = NOW
with open("registry/requirements.json", "w") as f:
    json.dump(reqs_doc, f, indent=2, ensure_ascii=False)
    f.write("\n")

# --- ledger.json ---
with open("registry/ledger.json") as f:
    ledger = json.load(f)
ledger["tasks"].append({
    "taskId": "T-017",
    "requirementIds": [r["id"] for r in new_reqs],
    "scope": "Railway infrastructure intelligence: packages/railway (client, credentials, contract, discovery, monitoring, usage, diagnostics, authorization, recovery, events, reconciliation, audit, backup, intelligence, threat model) + contracts schemas + db migration 3 + nexus-api routes/tools/health + tests",
    "dependencies": ["T-001", "T-013"],
    "filesAffected": [
        "packages/railway/**", "packages/contracts/src/index.ts", "packages/db/src/index.ts",
        "packages/core/src/index.ts", "apps/nexus-api/src/index.ts", "tsconfig.json",
        "tests/helpers/railway-mocks.ts", "tests/unit/railway-*.test.ts",
        "tests/integration/railway-*.test.ts", "tests/scenarios/railway-exercises.test.ts",
        "registry/*.json", "docs/RAILWAY_INTELLIGENCE.md",
    ],
    "acceptanceCriteria": [
        "typecheck clean; full suite 162 pass / 4 pre-existing skips / 0 fail",
        "LIVE read-only verification against production Railway API (auth, discovery, monitoring, usage, contract)",
        "zero mutations executed against production; read-only refusal tested with live credentials",
        "every acceptance-matrix capability has test evidence or an honest BLOCKED entry",
    ],
    "status": "DONE",
    "tests": [
        "tests/unit/railway-client.test.ts", "tests/unit/railway-credentials.test.ts",
        "tests/unit/railway-contract.test.ts", "tests/unit/railway-authorization.test.ts",
        "tests/unit/railway-webhook.test.ts", "tests/unit/railway-audit.test.ts",
        "tests/unit/railway-reconciliation.test.ts", "tests/unit/railway-diagnostics.test.ts",
        "tests/integration/railway-routes.test.ts", "tests/integration/railway-live.test.ts",
        "tests/scenarios/railway-exercises.test.ts",
    ],
    "notes": "Owner directive 2026-11-15 (Railway infrastructure intelligence). Production stayed READ-ONLY throughout; deployment of the new capability awaits owner authorization (INFRA-24).",
})
with open("registry/ledger.json", "w") as f:
    json.dump(ledger, f, indent=2, ensure_ascii=False)
    f.write("\n")

# --- technologies.json ---
with open("registry/technologies.json") as f:
    tech = json.load(f)
tech_ids = {t["id"] for t in tech["records"]}
assert "TECH-014" not in tech_ids
tech["records"].append({
    "id": "TECH-014",
    "name": "Railway Public API (GraphQL v2)",
    "provenance": "https://docs.railway.com/integrations/api + live introspection 2026-11-15 (387 object types, 165 queries, 262 mutations); workspace-token Bearer auth verified",
    "capabilities": [
        "infrastructure discovery (projects/environments/services/deployments/volumes/backups/events)",
        "deployment lifecycle monitoring (13-value status enum)",
        "usage + estimates (per-measurement, no workspace USD total for workspace tokens)",
        "recovery mutations (restart/redeploy/rollback/stop/remove/volume backup create+restore)",
        "webhooks (unsigned, custom-secret-header, per project — dashboard configured)",
    ],
    "category": "INFRASTRUCTURE",
    "decision": "ADOPTED",
    "decisionRationale": "Official API of the production platform; zero new runtime dependencies (fetch + node:crypto only); contract baseline committed and drift-detecting",
    "connectedServices": ["Railway (production hosting)"],
    "compatibility": ["Bun runtime (native fetch)", "workspace/project token header semantics"],
    "securityAssessment": "Token confined to @nexus/railway package; redaction on all surfaces; variables query never issued (secret values); rate-budget protection; webhooks verified via constant-time secret header and reconciled against the API",
    "testResults": ["tests/integration/railway-live.test.ts (LIVE read-only, 8 tests)", "full contract drift check (no BREAKING)"],
    "operationalStatus": "LIVE",
    "upgradeStrategy": "Committed contract baseline + drift detection flags removed/deprecated fields before they mislead health reports (packages/railway/contract/expected-fields.json)",
    "assessedAt": NOW,
})
with open("registry/technologies.json", "w") as f:
    json.dump(tech, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(json.dumps({
    "requirements_added": len(new_reqs),
    "total_requirements": len(reqs_doc["requirements"]),
    "ledger_task": "T-017",
    "technology": "TECH-014 Railway Public API (INFRASTRUCTURE, ADOPTED, LIVE)",
}, indent=1))
