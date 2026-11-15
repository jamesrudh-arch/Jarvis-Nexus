/**
 * @nexus/railway — Railway infrastructure intelligence for JARVIS NEXUS.
 *
 * Public surface (consumed by apps/nexus-api):
 *   railwayFromEnv({ db, env, ...hooks }) -> RailwayIntel
 *
 * Modes (honest, never faked):
 *   unconfigured — no RAILWAY_API_TOKEN: all live capability refuses with
 *                  UNCONFIGURED; health reports degraded; nothing is invented.
 *   read_only    — default: full read intelligence; ALL mutations refused
 *                  (L3/L4 grants impossible until the owner disables it).
 *   full         — RAILWAY_READ_ONLY=false: authorized L3/L4 execution
 *                  possible (still requiring single-use owner grants).
 */
import type { NexusDb } from "@nexus/db";
import { CredentialManager } from "./credentials";
import { RailwayClient, RAILWAY_ENDPOINT } from "./client";
import type { ClientEvent } from "./client";
import { CircuitBreaker } from "./resilience";
import { DiscoveryService } from "./discovery";
import { MonitoringService } from "./monitoring";
import { UsageService } from "./usage";
import { DiagnosticEngine } from "./diagnostics";
import { AuthorizationService } from "./authorization";
import { RecoveryService } from "./recovery";
import { WebhookReceiver, EventPoller } from "./events";
import { ReconciliationService } from "./reconciliation";
import { RailwayAuditLog } from "./audit";
import { BackupService } from "./backup";
import { RailwayIntelligence } from "./intelligence";
import { RailwayEventStore, RailwayStateRepo } from "./state";
import { RAILWAY_THREAT_MODEL, threatModelSummary } from "./threat-model";
import type { MonitoringReport } from "./monitoring";

// re-exports (public API)
export { CredentialManager, isValidTokenFormat } from "./credentials";
export { RailwayClient, RAILWAY_ENDPOINT } from "./client";
export type { ClientEvent, RateLimitInfo, ClientStats } from "./client";
export { RailwayApiError, redactToken, redactSecrets } from "./errors";
export type { RailwayErrorKind, RailwayResult } from "./errors";
export { CircuitBreaker, computeBackoffMs } from "./resilience";
export { CONTRACT_BASELINE, USED_FIELDS, checkUsedFieldsAgainstBaseline, introspectLiveFields, diffContract, contractIsCompatible } from "./contract";
export type { ContractDrift, LiveFields } from "./contract";
export { DiscoveryService } from "./discovery";
export { MonitoringService } from "./monitoring";
export type { MonitoringReport, DimensionResult, DimensionStatus } from "./monitoring";
export { UsageService } from "./usage";
export type { CostReport, UsagePoint, UsageAnomaly } from "./usage";
export { DiagnosticEngine } from "./diagnostics";
export type { Investigation, DiagnosticTrigger, Recommendation, CauseClassification } from "./diagnostics";
export { CONFIDENCE_SCALE } from "./diagnostics";
export { AuthorizationService, OPERATIONS } from "./authorization";
export type { RailwayOperation, AuthorizationRequest, AuthorizationDecision, StoredGrant } from "./authorization";
export { RecoveryService } from "./recovery";
export type { RecoveryPlan, ExecutionReport } from "./recovery";
export { WebhookReceiver, EventPoller } from "./events";
export type { WebhookAcceptance } from "./events";
export { ReconciliationService } from "./reconciliation";
export type { ReconciliationReport, Discrepancy, DiscrepancyKind } from "./reconciliation";
export { RailwayAuditLog, RAILWAY_AUDIT_CATEGORIES } from "./audit";
export type { AuditEntryInput, StoredAuditRecord, RailwayAuditCategory } from "./audit";
export { BackupService, NEXUS_TABLES } from "./backup";
export type { BackupReport, LogicalBackupDoc, RestoreVerification, RestoreReport } from "./backup";
export { RailwayIntelligence } from "./intelligence";
export type { IntelligenceAnswer, CanonicalQuestion } from "./intelligence";
export { RAILWAY_THREAT_MODEL, threatModelSummary } from "./threat-model";
export type { ThreatAssessment } from "./threat-model";
export { RailwayEventStore, RailwayStateRepo } from "./state";
export type { StoredRailwayEvent } from "./state";
export * as queries from "./queries";
export * from "./model";

export interface MemoryHook {
  (m: { title: string; content: string; importance: number; sourceId: string }): void;
}

export interface RailwayIntelOptions {
  db: NexusDb;
  env: Record<string, string | undefined>;
  memory?: MemoryHook;
  onClientEvent?: (e: ClientEvent) => void;
  metrics?: {
    increment: (name: string, labels: Record<string, string>, by?: number) => void;
    gauge: (name: string, value: number, labels?: Record<string, string>) => void;
  };
  fetchFn?: typeof fetch;
  now?: () => number;
}

export type RailwayMode = "unconfigured" | "read_only" | "full";

export class RailwayIntel {
  readonly mode: RailwayMode;
  readonly credentials: CredentialManager;
  readonly client: RailwayClient;
  readonly discovery: DiscoveryService;
  readonly monitoring: MonitoringService;
  readonly usage: UsageService;
  readonly diagnostics: DiagnosticEngine;
  readonly authorization: AuthorizationService;
  readonly recovery: RecoveryService;
  readonly webhook: WebhookReceiver;
  readonly poller: EventPoller | null;
  readonly reconciliation: ReconciliationService;
  readonly audit: RailwayAuditLog;
  readonly backup: BackupService;
  readonly intelligence: RailwayIntelligence;
  readonly events: RailwayEventStore;
  readonly state: RailwayStateRepo;
  private lastMonitoring: MonitoringReport | null = null;

  constructor(opts: RailwayIntelOptions) {
    this.credentials = new CredentialManager(opts.env);
    this.audit = new RailwayAuditLog(opts.db);
    this.events = new RailwayEventStore(opts.db);
    this.state = new RailwayStateRepo(opts.db);

    const readOnly = (opts.env.RAILWAY_READ_ONLY ?? "true").toLowerCase() !== "false";
    this.mode = !this.credentials.status().configured ? "unconfigured" : readOnly ? "read_only" : "full";

    const projectId = opts.env.RAILWAY_PROJECT_ID || undefined;
    this.client = new RailwayClient({
      credentials: this.credentials,
      endpoint: opts.env.RAILWAY_API_ENDPOINT || RAILWAY_ENDPOINT,
      timeoutMs: numOr(opts.env.RAILWAY_TIMEOUT_MS, 15_000),
      rateBudgetFloor: numOr(opts.env.RAILWAY_API_BUDGET_FLOOR, 50),
      cacheTtlMs: numOr(opts.env.RAILWAY_CACHE_TTL_MS, 30_000),
      fetchFn: opts.fetchFn,
      now: opts.now,
      onEvent: (e) => {
        opts.onClientEvent?.(e);
        if (e.kind === "request") opts.metrics?.increment("railway_api_requests_total", { status: String(e.status ?? "network") });
        if (e.kind === "auth_failure") opts.metrics?.increment("railway_api_failures_total", { kind: "auth" });
        if (e.kind === "rate_limited") opts.metrics?.increment("railway_api_failures_total", { kind: "rate_limited" });
      },
    });
    this.discovery = new DiscoveryService(this.client, {
      projectId,
      deploymentsPerEnvironment: numOr(opts.env.RAILWAY_DEPLOYMENT_HISTORY, 20),
      eventLimit: 50,
      auditLogLimit: 50,
    });
    this.monitoring = new MonitoringService(this.client, this.discovery, {
      fetchFn: opts.fetchFn,
      timeoutMs: numOr(opts.env.RAILWAY_APPCHECK_TIMEOUT_MS, 8_000),
      sleepingIsHealthy: (opts.env.RAILWAY_SLEEPING_HEALTHY ?? "false").toLowerCase() === "true",
    });
    let thresholds: Record<string, number> | undefined;
    if (opts.env.RAILWAY_USAGE_THRESHOLDS) {
      try { thresholds = JSON.parse(opts.env.RAILWAY_USAGE_THRESHOLDS) as Record<string, number>; } catch { thresholds = undefined; }
    }
    this.usage = new UsageService(this.client, { thresholds, projectId });
    this.authorization = new AuthorizationService(
      { audit: this.audit, state: this.state, now: opts.now },
      { readOnly: this.mode === "read_only" || this.mode === "unconfigured" ? true : false },
    );
    this.diagnostics = new DiagnosticEngine({
      client: this.client, discovery: this.discovery, monitoring: this.monitoring,
      audit: this.audit, state: this.state, events: this.events, projectId,
      remember: opts.memory,
    });
    this.recovery = new RecoveryService({
      client: this.client, authorization: this.authorization,
      audit: this.audit, state: this.state, projectId,
    });
    this.webhook = new WebhookReceiver({
      audit: this.audit, events: this.events, state: this.state,
      client: this.credentials.status().configured ? this.client : undefined,
      secret: opts.env.RAILWAY_WEBHOOK_SECRET,
      now: opts.now,
    });
    this.reconciliation = new ReconciliationService({
      discovery: this.discovery, state: this.state, events: this.events,
      audit: this.audit, now: opts.now,
    });
    this.poller = projectId && this.mode !== "unconfigured"
      ? new EventPoller({
          client: this.client, events: this.events, state: this.state, audit: this.audit,
          projectId,
          intervalMs: numOr(opts.env.RAILWAY_POLL_INTERVAL_MS, 60_000),
          onNewEvent: (e) => opts.metrics?.increment("railway_events_total", { source: "poll", severity: e.severity }),
        })
      : null;
    this.backup = new BackupService();
    this.intelligence = new RailwayIntelligence({
      discovery: this.discovery, monitoring: this.monitoring, usage: this.usage,
      diagnostics: this.diagnostics, reconciliation: this.reconciliation,
      backup: this.backup, recovery: this.recovery, authorization: this.authorization,
    });
  }

  /** Health probe input — cached, non-blocking, fail-visible. */
  healthComponent(): { component: string; status: "healthy" | "degraded" | "unhealthy"; detail: string; checkedAt: string } {
    const checkedAt = new Date().toISOString();
    if (this.mode === "unconfigured") {
      return {
        component: "railway", status: "degraded",
        detail: "RAILWAY_API_TOKEN not configured — infrastructure intelligence unavailable (fail-closed; never reported healthy without data)",
        checkedAt,
      };
    }
    if (!this.lastMonitoring) {
      return {
        component: "railway", status: "degraded",
        detail: "monitoring not yet executed this boot — run POST /railway/monitor or wait for the first poll cycle",
        checkedAt,
      };
    }
    const worst = this.lastMonitoring.overall;
    return {
      component: "railway",
      status: worst === "healthy" ? "healthy" : worst === "degraded" ? "degraded" : "unhealthy",
      detail: `dimensions: ${this.lastMonitoring.dimensions.map((d) => `${d.dimension}=${d.status}`).join(", ")} (as of ${this.lastMonitoring.asOf})`,
      checkedAt: this.lastMonitoring.asOf,
    };
  }

  /** One monitoring cycle: run dimensions, persist snapshot + monitoring report, record memory. */
  async runMonitoringCycle(): Promise<MonitoringReport | null> {
    const snap = await this.discovery.discoverAll();
    if (snap.ok) this.reconciliation.persistSnapshot(snap.value);
    const mon = await this.monitoring.runAll(snap.ok ? snap.value : undefined);
    if (!mon.ok) return null;
    this.lastMonitoring = mon.value;
    this.state.set("monitoring:latest", mon.value);
    this.state.appendHistory("monitoring:history", { asOf: mon.value.asOf, overall: mon.value.overall, dimensions: mon.value.dimensions.map((d) => ({ dimension: d.dimension, status: d.status })) }, 50);
    return mon.value;
  }

  /** Cached monitoring for routes/probes. */
  latestMonitoring(): MonitoringReport | null {
    if (this.lastMonitoring) return this.lastMonitoring;
    const stored = this.state.get<MonitoringReport>("monitoring:latest");
    return stored ?? null;
  }

  startPolling(): void {
    this.poller?.start();
  }
  stopPolling(): void {
    this.poller?.stop();
  }
}

function numOr(v: string | undefined, d: number): number {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

/** Factory used by apps/nexus-api wiring. */
export function railwayFromEnv(opts: RailwayIntelOptions): RailwayIntel {
  return new RailwayIntel(opts);
}
