/**
 * @nexus/railway — JARVIS infrastructure intelligence (directive §15).
 *
 * Answers the owner's infrastructure questions from LIVE verified data only —
 * no hardcoded answers, no fabricated data. When a capability is degraded
 * (no token, API down), the answer says so.
 */
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import type { DiscoveryService } from "./discovery";
import type { MonitoringService, MonitoringReport } from "./monitoring";
import type { UsageService, CostReport } from "./usage";
import type { DiagnosticEngine, Investigation } from "./diagnostics";
import type { ReconciliationService } from "./reconciliation";
import type { BackupService, BackupReport } from "./backup";
import type { RecoveryService, RecoveryPlan } from "./recovery";
import type { AuthorizationService } from "./authorization";
import type { InfrastructureSnapshot } from "./model";
import { classifyDeploymentStatus } from "./model";

export type CanonicalQuestion =
  | "what_is_happening"
  | "which_services_operational"
  | "which_deployments_failed"
  | "is_production_healthy"
  | "what_caused_latest_failure"
  | "what_changed"
  | "infrastructure_discrepancies"
  | "is_consumption_abnormal"
  | "are_backups_recoverable"
  | "recommended_recovery"
  | "has_operation_succeeded";

export interface IntelligenceAnswer {
  question: CanonicalQuestion | "unknown";
  answer: string;
  status: "answered" | "degraded" | "unknown";
  evidence: Array<{ source: string; summary: string }>;
  asOf: string;
}

export interface IntelligenceDeps {
  discovery: DiscoveryService;
  monitoring: MonitoringService;
  usage: UsageService;
  diagnostics: DiagnosticEngine;
  reconciliation: ReconciliationService;
  backup: BackupService;
  recovery: RecoveryService;
  authorization: AuthorizationService;
}

const QUESTION_MAP: Array<{ keys: RegExp; canonical: CanonicalQuestion }> = [
  { keys: /happening|status|overview|infrastructure/i, canonical: "what_is_happening" },
  { keys: /operational|running|services.*(up|healthy|available)/i, canonical: "which_services_operational" },
  { keys: /failed|failure|deployments.*(fail|error)/i, canonical: "which_deployments_failed" },
  { keys: /production.*healthy|healthy.*production|is production/i, canonical: "is_production_healthy" },
  { keys: /caused|root cause|why.*(fail|down)/i, canonical: "what_caused_latest_failure" },
  { keys: /changed|diff|recent changes/i, canonical: "what_changed" },
  { keys: /discrepanc|mismatch|drift/i, canonical: "infrastructure_discrepancies" },
  { keys: /consumption|usage|cost|spend|abnormal/i, canonical: "is_consumption_abnormal" },
  { keys: /backup|recoverable|restor/i, canonical: "are_backups_recoverable" },
  { keys: /recommend|recovery action|what should/i, canonical: "recommended_recovery" },
  { keys: /operation.*(succe|verif)|has.*(operation|recovery).*(worked|succeeded)/i, canonical: "has_operation_succeeded" },
];

export class RailwayIntelligence {
  constructor(private readonly deps: IntelligenceDeps) {}

  listQuestions(): CanonicalQuestion[] {
    return QUESTION_MAP.map((q) => q.canonical);
  }

  async ask(question: string): Promise<RailwayResult<IntelligenceAnswer>> {
    const match = QUESTION_MAP.find((q) => q.keys.test(question));
    if (!match) {
      return railwayOk({
        question: "unknown",
        answer: `I cannot map that to a supported infrastructure question. Supported: ${this.listQuestions().join(", ")}`,
        status: "unknown",
        evidence: [],
        asOf: new Date().toISOString(),
      });
    }
    const snapRes = await this.deps.discovery.discoverAll();
    const snapshot: InfrastructureSnapshot | null = snapRes.ok ? snapRes.value : null;
    if (!snapRes.ok && match.canonical !== "has_operation_succeeded") {
      return railwayOk({
        question: match.canonical,
        answer: `Infrastructure visibility is currently degraded: discovery failed (${snapRes.error.kind}: ${snapRes.error.message.slice(0, 140)}). No live data is available and I will not fabricate any.`,
        status: "degraded",
        evidence: [{ source: "discovery", summary: snapRes.error.message.slice(0, 200) }],
        asOf: new Date().toISOString(),
      });
    }
    switch (match.canonical) {
      case "what_is_happening": return this.whatIsHappening(snapshot!);
      case "which_services_operational": return this.servicesOperational(snapshot!);
      case "which_deployments_failed": return this.deploymentsFailed(snapshot!);
      case "is_production_healthy": return this.productionHealthy(snapshot!);
      case "what_caused_latest_failure": return this.latestFailureCause();
      case "what_changed": return this.whatChanged();
      case "infrastructure_discrepancies": return this.discrepancies();
      case "is_consumption_abnormal": return this.consumptionAbnormal(snapshot);
      case "are_backups_recoverable": return this.backupsRecoverable(snapshot!);
      case "recommended_recovery": return this.recommendedRecovery();
      case "has_operation_succeeded": return this.operationOutcome();
    }
  }

  private async whatIsHappening(snapshot: InfrastructureSnapshot): Promise<RailwayResult<IntelligenceAnswer>> {
    const mon = await this.deps.monitoring.runAll(snapshot);
    const m: MonitoringReport | null = mon.ok ? mon.value : null;
    const dims = m ? m.dimensions.map((d) => `${d.dimension}=${d.status}`).join(", ") : "monitoring unavailable";
    const failed = snapshot.recentDeployments.filter((d) => classifyDeploymentStatus(d.status) === "failed");
    const answer = [
      `Overall: ${m?.overall ?? "unknown"}. Dimensions (reported independently): ${dims}.`,
      `Projects: ${snapshot.projects.length}; service instances: ${snapshot.serviceInstances.length}; volumes: ${snapshot.volumes.length}.`,
      failed.length > 0 ? `${failed.length} failed deployment(s) in recent history (latest: ${failed[0]!.id} at ${failed[0]!.createdAt}).` : "No failed deployments in recent history.",
      snapshot.platformStatus ? `Railway platform: ${snapshot.platformStatus.isStable ? "stable" : "UNSTABLE"}${snapshot.platformStatus.incident ? ` — incident ${snapshot.platformStatus.incident.status}` : ""}.` : "Platform status unknown.",
    ].join(" ");
    return railwayOk({
      question: "what_is_happening", answer, status: "answered",
      evidence: (m?.dimensions ?? []).map((d) => ({ source: `monitoring:${d.dimension}`, summary: d.detail })),
      asOf: m?.asOf ?? snapshot.asOf,
    });
  }

  private async servicesOperational(snapshot: InfrastructureSnapshot): Promise<RailwayResult<IntelligenceAnswer>> {
    const lines = snapshot.serviceInstances.map((si) => {
      const cls = si.latestDeployment ? classifyDeploymentStatus(si.latestDeployment.status) : "never_deployed";
      return `${si.serviceName}: ${cls}${si.sleepApplication ? " (sleep app enabled)" : ""}${si.domains.length > 0 ? ` [${si.domains.map((d) => d.domain).join(", ")}]` : ""}`;
    });
    const operational = snapshot.serviceInstances.filter((si) => si.latestDeployment && ["healthy", "sleeping"].includes(classifyDeploymentStatus(si.latestDeployment.status))).length;
    return railwayOk({
      question: "which_services_operational",
      answer: lines.length === 0
        ? "No service instances are visible to this token (scope limitation or empty project)."
        : `${operational}/${snapshot.serviceInstances.length} service instances operational — ${lines.join("; ")}`,
      status: "answered",
      evidence: snapshot.serviceInstances.map((si) => ({ source: "service_instance", summary: `${si.serviceName}: ${si.latestDeployment?.status ?? "no deployment"}` })),
      asOf: snapshot.asOf,
    });
  }

  private async deploymentsFailed(snapshot: InfrastructureSnapshot): Promise<RailwayResult<IntelligenceAnswer>> {
    const failed = snapshot.recentDeployments.filter((d) => classifyDeploymentStatus(d.status) === "failed");
    return railwayOk({
      question: "which_deployments_failed",
      answer: failed.length === 0
        ? "No failed deployments in the retrieved history window."
        : `${failed.length} failed: ${failed.map((d) => `${d.id} (${d.status} at ${d.createdAt}, creator ${d.creator?.email ?? "unknown"})`).join("; ")}`,
      status: "answered",
      evidence: failed.slice(0, 5).map((d) => ({ source: "deployment", summary: `${d.id}: ${d.status} at ${d.createdAt}` })),
      asOf: snapshot.asOf,
    });
  }

  private async productionHealthy(snapshot: InfrastructureSnapshot): Promise<RailwayResult<IntelligenceAnswer>> {
    const mon = await this.deps.monitoring.runAll(snapshot);
    if (!mon.ok) {
      return railwayOk({ question: "is_production_healthy", answer: `Cannot determine: monitoring failed (${mon.error.kind}).`, status: "degraded", evidence: [], asOf: new Date().toISOString() });
    }
    const app = mon.value.dimensions.find((d) => d.dimension === "application");
    const dep = mon.value.dimensions.find((d) => d.dimension === "deployment");
    // Deployment success is NEVER conflated with application health.
    const answer = `Deployment dimension: ${dep?.status ?? "?"} (${dep?.detail ?? ""}). Application dimension: ${app?.status ?? "?"} (${app?.detail ?? ""}). ${app?.status === "healthy" && dep?.status === "healthy" ? "Production is healthy on both dimensions." : "Production is NOT fully healthy — see dimensions above; they are reported independently."}`;
    return railwayOk({
      question: "is_production_healthy", answer, status: "answered",
      evidence: mon.value.dimensions.map((d) => ({ source: d.dimension, summary: d.detail })),
      asOf: mon.value.asOf,
    });
  }

  private async latestFailureCause(): Promise<RailwayResult<IntelligenceAnswer>> {
    const investigations = this.deps.diagnostics.listInvestigations(10);
    const latest = investigations[0];
    if (!latest) {
      return railwayOk({
        question: "what_caused_latest_failure",
        answer: "No diagnostic investigation exists yet. I can start one via POST /railway/diagnose with the relevant trigger.",
        status: "unknown", evidence: [], asOf: new Date().toISOString(),
      });
    }
    return railwayOk({
      question: "what_caused_latest_failure",
      answer: `Latest investigation ${latest.id}: cause classified ${latest.causeClassification} (confidence ${latest.confidence}). ${latest.rootCause ?? "Root cause unresolved — evidence is recorded, speculation is not."} Impact: ${latest.impact}`,
      status: "answered",
      evidence: latest.evidence.slice(0, 6).map((e) => ({ source: e.source, summary: e.summary })),
      asOf: latest.completedAt ?? latest.startedAt,
    });
  }

  private async whatChanged(): Promise<RailwayResult<IntelligenceAnswer>> {
    const changes = this.deps.reconciliation.whatChanged();
    return railwayOk({
      question: "what_changed",
      answer: changes.length === 0
        ? "No changes between the two most recent internal snapshots (or fewer than two snapshots recorded)."
        : `${changes.length} change(s): ${changes.map((c) => `${c.resource} — ${c.change}`).join("; ")}`,
      status: "answered",
      evidence: changes.map((c) => ({ source: "snapshot_diff", summary: `${c.resource}: ${c.change}` })),
      asOf: new Date().toISOString(),
    });
  }

  private async discrepancies(): Promise<RailwayResult<IntelligenceAnswer>> {
    const recon = await this.deps.reconciliation.reconcile();
    if (!recon.ok) {
      return railwayOk({ question: "infrastructure_discrepancies", answer: `Reconciliation failed: ${recon.error.kind} — cannot compare states.`, status: "degraded", evidence: [], asOf: new Date().toISOString() });
    }
    const r = recon.value;
    return railwayOk({
      question: "infrastructure_discrepancies",
      answer: r.discrepancies.length === 0
        ? `Internal state matches Railway (internal as of ${r.internalAsOf ?? "n/a"}, actual as of ${r.actualAsOf}).`
        : `${r.discrepancies.length} discrepancy(ies): ${r.discrepancies.map((d) => `[${d.kind}] ${d.resource}: ${d.detail}`).join(" | ")}`,
      status: "answered",
      evidence: r.discrepancies.map((d) => ({ source: "reconciliation", summary: `${d.kind} ${d.resource}` })),
      asOf: r.at,
    });
  }

  private async consumptionAbnormal(snapshot: InfrastructureSnapshot | null): Promise<RailwayResult<IntelligenceAnswer>> {
    const rep = await this.deps.usage.report(snapshot ?? undefined);
    if (!rep.ok) {
      return railwayOk({ question: "is_consumption_abnormal", answer: `Usage report unavailable: ${rep.error.kind}.`, status: "degraded", evidence: [], asOf: new Date().toISOString() });
    }
    const r: CostReport = rep.value;
    const answer = r.anomalies.length === 0
      ? `No anomalies detected (heuristic thresholds). Measured: ${r.measured.map((m) => `${m.measurement}=${m.value}`).join(", ") || "unavailable"}. Estimated: ${r.estimated.map((m) => `${m.measurement}=${m.value}`).join(", ") || "unavailable"}.`
      : `${r.anomalies.length} anomaly(ies): ${r.anomalies.map((a) => `${a.kind}: ${a.detail}`).join("; ")}`;
    return railwayOk({
      question: "is_consumption_abnormal", answer, status: "answered",
      evidence: [
        ...r.measured.map((m) => ({ source: "measured", summary: `${m.measurement}=${m.value}` })),
        ...r.estimated.map((m) => ({ source: "estimated", summary: `${m.measurement}=${m.value}` })),
      ],
      asOf: r.asOf,
    });
  }

  private async backupsRecoverable(snapshot: InfrastructureSnapshot): Promise<RailwayResult<IntelligenceAnswer>> {
    const report: BackupReport = await this.deps.backup.report(snapshot);
    const total = report.volumes.reduce((n, v) => n + v.backups.length, 0);
    const answer = [
      `${total} Railway volume backup(s) discovered across ${report.volumes.length} volume(s).`,
      "Railway volume backups: recoverability UNVERIFIED — an isolated restore requires owner authorization (L4) and is blocked in read-only mode. Existence is not recoverability.",
      "Application-level logical backups ARE proven recoverable: export + isolated in-memory restore verification (see backup service).",
    ].join(" ");
    return railwayOk({
      question: "are_backups_recoverable", answer, status: "answered",
      evidence: report.volumes.flatMap((v) => v.backups.map((b) => ({ source: `volume:${v.volumeInstanceId}`, summary: `backup ${b.id} created ${b.createdAt}${b.expiresAt ? `, expires ${b.expiresAt}` : ""}` }))),
      asOf: report.asOf,
    });
  }

  private async recommendedRecovery(): Promise<RailwayResult<IntelligenceAnswer>> {
    const investigations = this.deps.diagnostics.listInvestigations(1);
    const latest: Investigation | undefined = investigations[0];
    if (!latest) {
      return railwayOk({ question: "recommended_recovery", answer: "No investigation to base a recommendation on — run diagnostics first.", status: "unknown", evidence: [], asOf: new Date().toISOString() });
    }
    const recs = latest.recommendations.map((r, i) => `${i + 1}. ${r.action}${r.requiredLevel ? ` [requires ${r.requiredLevel}${r.operationId ? `, ${r.operationId}` : ""}]` : ""} — ${r.rationale}`).join(" ");
    return railwayOk({
      question: "recommended_recovery",
      answer: `Based on investigation ${latest.id} (${latest.causeClassification}): ${recs}`,
      status: "answered",
      evidence: latest.evidence.slice(0, 4).map((e) => ({ source: e.source, summary: e.summary })),
      asOf: latest.completedAt ?? latest.startedAt,
    });
  }

  private async operationOutcome(): Promise<RailwayResult<IntelligenceAnswer>> {
    const plans = this.deps.recovery.recentPlans(5);
    if (plans.length === 0) {
      return railwayOk({
        question: "has_operation_succeeded",
        answer: "No recovery operations have been planned or executed yet.",
        status: "answered", evidence: [], asOf: new Date().toISOString(),
      });
    }
    const latest = plans[0]!;
    const lines = plans.map((p) =>
      `${p.id}: ${p.step.operationId} on [${p.step.resourceIds.join(",")}] -> ${p.status}` +
      (p.lastExecution ? ` (verified=${p.lastExecution.verified}; ${p.lastExecution.steps[0]?.verification.method}: ${p.lastExecution.steps[0]?.verification.observed})` : " (not executed)"));
    return railwayOk({
      question: "has_operation_succeeded",
      answer: `${lines.length} recovery plan(s) recorded. Latest: ${lines[0]}. Verification outcomes are independently re-queried where the operation class supports it; every decision and execution is in the tamper-evident audit trail (GET /railway/audit?verify=true).`,
      status: "answered",
      evidence: plans.map((p) => ({ source: `plan:${p.id}`, summary: `${p.step.operationId} -> ${p.status}${p.lastExecution ? `, verified=${p.lastExecution.verified}` : ""}` })),
      asOf: latest.lastExecution?.executedAt ?? latest.createdAt,
    });
  }
}
