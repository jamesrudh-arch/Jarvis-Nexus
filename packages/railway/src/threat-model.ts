/**
 * @nexus/railway — formal threat model (directive §10).
 *
 * Every threat: (1) threat, (2) attack surface, (3) potential impact,
 * (4) existing controls, (5) required mitigation, (6) verification method,
 * (7) residual risk. Verification methods reference REAL tests in
 * tests/unit/railway-*.test.ts and tests/integration/railway-*.test.ts.
 */
export interface ThreatAssessment {
  id: string;
  threat: string;
  attackSurface: string;
  potentialImpact: string;
  existingControls: string[];
  requiredMitigation: string;
  verificationMethod: string;
  residualRisk: string;
}

export const RAILWAY_THREAT_MODEL: readonly ThreatAssessment[] = [
  {
    id: "T-01",
    threat: "Credential theft (Railway API token exfiltrated)",
    attackSurface: ".env file, process environment, HTTP error payloads, logs, git history",
    potentialImpact: "full workspace control: read variables, mutate deployments, delete resources",
    existingControls: [
      "token lives only in gitignored, chmod-600 .env read once by CredentialManager",
      "redactToken/redactSecrets applied to every log, audit and error surface",
      "no token in JARVIS tool params, MCP server env, NAEI workspaces or HTTP responses",
      "credentials.env added to .gitignore; secret files verified absent from HEAD",
    ],
    requiredMitigation: "owner rotates the token in the Railway dashboard after any suspected exposure; rotate() supports hot swap",
    verificationMethod: "unit: railway-client.test.ts asserts no token substring in any error/log; grep-based secret scan of committed tree",
    residualRisk: "token was transmitted in owner chat (owner's choice) — rotation recommended after this exercise",
  },
  {
    id: "T-02",
    threat: "Compromised JARVIS agent performs unauthorized infrastructure operations",
    attackSurface: "ToolExecutor tools, orchestrator plan execution",
    potentialImpact: "deployment destruction, data loss via volume ops",
    existingControls: [
      "AuthorizationService refuses ALL grants to principal.type='agent' (no agent self-approval)",
      "railway.recovery.execute is in CONSEQUENTIAL_TOOLS: orchestrator gate stalls the plan at VALIDATED until owner approves",
      "read-only mode refuses every mutation regardless of authorization",
    ],
    requiredMitigation: "none beyond current controls; keep railway ops out of auto-permission classes",
    verificationMethod: "unit: railway-authorization.test.ts (agent denial, read-only denial, single-use grants)",
    residualRisk: "low — an agent can at most READ infrastructure state (L1)",
  },
  {
    id: "T-03",
    threat: "Malicious MCP server gains Railway credentials by inheritance",
    attackSurface: "MCP gateway subprocess environment",
    potentialImpact: "token theft from env of spawned servers",
    existingControls: [
      "the Railway token is never placed in any MCP registration, transport env or tool invocation",
      "MCP servers receive only their declared registration env",
    ],
    requiredMitigation: "keep credential isolation a hard invariant in app wiring",
    verificationMethod: "unit: integration/railway-routes.test.ts asserts mcp registrations contain no railway token",
    residualRisk: "low",
  },
  {
    id: "T-04",
    threat: "Prompt injection drives infrastructure mutation",
    attackSurface: "JARVIS objectives, NAEI requirements, world text, webhook payloads",
    potentialImpact: "social-engineered 'recovery' that destroys production",
    existingControls: [
      "natural language can only ever produce a RECOMMENDATION (L2 plan); execution needs an owner-authenticated grant",
      "plans require principal user:owner; execution consumes single-use scoped grants",
    ],
    requiredMitigation: "none beyond current controls",
    verificationMethod: "unit: railway-authorization.test.ts — forged agent/injected principals denied",
    residualRisk: "low — injection can at worst cause noisy recommendations",
  },
  {
    id: "T-05",
    threat: "Privilege escalation via authorization logic flaws",
    attackSurface: "grant issue/consume paths, HTTP routes",
    potentialImpact: "unauthorized mutation",
    existingControls: [
      "grants are single-use, 15-minute TTL, resource-scoped, consumed atomically",
      "consumeGrant validates operationId + resource coverage; denied grants audited",
      "all /railway mutation routes behind requireOwner (owner bearer key)",
    ],
    requiredMitigation: "none beyond current controls",
    verificationMethod: "unit: railway-authorization.test.ts (expired, reused, mismatched-scope grants rejected); integration: 401 matrix",
    residualRisk: "low",
  },
  {
    id: "T-06",
    threat: "Cross-agent credential inheritance (agents sharing tokens)",
    attackSurface: "NAEI agent workspaces, JARVIS context",
    potentialImpact: "any agent mutating infrastructure",
    existingControls: ["token accessible only inside packages/railway; no tool or agent API exposes it"],
    requiredMitigation: "maintain package boundary; code review gate",
    verificationMethod: "unit: redaction tests + grep scan for token exposure in tool results",
    residualRisk: "low",
  },
  {
    id: "T-07",
    threat: "Supply-chain attack via malicious dependencies",
    attackSurface: "npm/bun registry packages",
    potentialImpact: "code execution with token access",
    existingControls: [
      "zero new runtime dependencies for the Railway package (uses fetch + node:crypto only)",
      "frozen lockfile; CI runs typecheck+tests on the exact lockfile",
    ],
    requiredMitigation: "keep dependency additions at zero; audit on any addition",
    verificationMethod: "package.json dependency diff; bun install --frozen-lockfile in CI",
    residualRisk: "low",
  },
  {
    id: "T-08",
    threat: "Webhook spoofing (forged deployment events)",
    attackSurface: "POST /railway/webhook",
    potentialImpact: "false state accepted, bogus recovery triggered",
    existingControls: [
      "constant-time X-Webhook-Secret verification (fail-closed when unconfigured)",
      "replay window on payload timestamps; zod schema validation",
      "every accepted event RECONCILED against the authoritative API before trust",
      "webhooks can only trigger diagnostics (L1/L2), never mutations",
    ],
    requiredMitigation: "owner sets a strong RAILWAY_WEBHOOK_SECRET when enabling webhooks",
    verificationMethod: "unit: railway-webhook.test.ts (bad secret, missing secret, replay, malformed payload)",
    residualRisk: "medium-low: Railway does not sign payloads (verified docs) — secret header is the strongest available control",
  },
  {
    id: "T-09",
    threat: "Replay attacks (re-delivered or captured webhooks)",
    attackSurface: "webhook endpoint",
    potentialImpact: "duplicate event processing, confusion attacks",
    existingControls: ["fingerprint dedup (type+deployment+timestamp+status) with idempotent append-only storage", "timestamp tolerance window"],
    requiredMitigation: "none beyond current controls",
    verificationMethod: "unit: railway-webhook.test.ts duplicate delivery accepted-once assertion",
    residualRisk: "low",
  },
  {
    id: "T-10",
    threat: "Unauthorized log access (infrastructure logs contain sensitive data)",
    attackSurface: "/railway routes, audit records, deployment logs",
    potentialImpact: "leakage of emails, commit data, resource topology",
    existingControls: [
      "read routes with infra detail are owner-authenticated; only /railway/status is public",
      "audit evidence redacted (redactSecrets) before persistence",
    ],
    requiredMitigation: "none beyond current controls",
    verificationMethod: "integration: 401 matrix on /railway/* owner routes",
    residualRisk: "low",
  },
  {
    id: "T-11",
    threat: "Data leakage through discovery (variable values, secrets)",
    attackSurface: "Railway variables query",
    potentialImpact: "secret values entering internal state/logs/memory",
    existingControls: ["the variables query is NEVER issued (returns values inline); enforced by absence in queries.ts and documented"],
    requiredMitigation: "keep the query absent; any future need requires an owner decision",
    verificationMethod: "unit: contract test asserts 'variables(' does not appear in any query document",
    residualRisk: "low",
  },
  {
    id: "T-12",
    threat: "Compromised internal service (attacker on the box)",
    attackSurface: "SQLite files, memory",
    potentialImpact: "tampering with audit/events, reading snapshots",
    existingControls: [
      "hash-chained audit log detects tampering (verify())",
      "append-only repos expose no update/delete paths",
    ],
    requiredMitigation: "external log shipping for stronger guarantees (future)",
    verificationMethod: "unit: railway-audit.test.ts tamper detection (row modified via raw SQL -> verify fails)",
    residualRisk: "medium: a determined local attacker can rewrite the whole chain; chain integrity detects partial tampering",
  },
  {
    id: "T-13",
    threat: "API response manipulation (MITM, compromised upstream)",
    attackSurface: "GraphQL responses",
    potentialImpact: "false health, poisoned discovery data",
    existingControls: [
      "HTTPS-only endpoint; response-shape validation (HTTP and GraphQL errors validated independently)",
      "schema contract drift detection against the committed baseline",
    ],
    requiredMitigation: "none beyond current controls",
    verificationMethod: "unit: client error classification matrix; contract drift test",
    residualRisk: "low",
  },
  {
    id: "T-14",
    threat: "Rate-limit abuse / denial of wallet (API budget exhaustion)",
    attackSurface: "client request paths, polling loop",
    potentialImpact: "workspace API quota exhausted, monitoring blinded",
    existingControls: [
      "client-side budget floor refuses non-critical calls below a threshold",
      "TTL response cache; single-request batched introspection",
      "poller skips cycles when remaining budget is low",
    ],
    requiredMitigation: "none beyond current controls",
    verificationMethod: "unit: railway-client.test.ts budget guard; poller deferral",
    residualRisk: "low",
  },
  {
    id: "T-15",
    threat: "Audit trail erasure by the acting component",
    attackSurface: "railway_audit table",
    potentialImpact: "actions without trace",
    existingControls: [
      "no update/delete API on the audit repo (INSERT-only)",
      "hash chain makes silent modification detectable",
      "audit writes happen inside the same transaction scope as the recorded action where applicable",
    ],
    requiredMitigation: "append-only filesystem/external sink for stronger guarantees (future)",
    verificationMethod: "unit: railway-audit.test.ts — verify() catches both modification and chain breaks",
    residualRisk: "medium (same as T-12)",
  },
] as const;

export function threatModelSummary(): { total: number; byResidual: Record<string, number> } {
  const byResidual: Record<string, number> = {};
  for (const t of RAILWAY_THREAT_MODEL) {
    const key = t.residualRisk.split(":")[0]!.split(" ")[0]!.toLowerCase();
    byResidual[key] = (byResidual[key] ?? 0) + 1;
  }
  return { total: RAILWAY_THREAT_MODEL.length, byResidual };
}
