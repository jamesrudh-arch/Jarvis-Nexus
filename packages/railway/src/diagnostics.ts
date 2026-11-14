/**
 * @nexus/railway — autonomous diagnostics & root-cause analysis (directive §7).
 *
 * 14-step workflow: detect anomaly → identify affected infrastructure →
 * collect evidence (deployments, logs, events, platform status, app health) →
 * correlate timeline → classify cause (CONFIRMED / PROBABLE / POSSIBLE /
 * UNKNOWN) → evaluate confidence → assess impact → recommendations with the
 * exact permissions required → persist the investigation → verify approved
 * corrective actions (recovery.ts).
 *
 * Cause classification is a DETERMINISTIC RULE ENGINE — every conclusion
 * carries its supporting evidence and a documented confidence heuristic
 * (CONFIRMED=0.9, PROBABLE=0.6, POSSIBLE=0.3, UNKNOWN=0.1). Speculation is
 * never presented as established fact.
 */
import { nexusId } from "@nexus/core";
import type { RailwayDiagnosticTriggerKind, RailwayPermissionLevel } from "@nexus/contracts";
import type { RailwayClient } from "./client";
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import type { DiscoveryService } from "./discovery";
import type { MonitoringService, EvidenceItem } from "./monitoring";
import type { RailwayAuditLog } from "./audit";
import type { RailwayStateRepo, RailwayEventStore } from "./state";
import { Q_DEPLOYMENT_LOGS, Q_DEPLOYMENT_EVENTS } from "./queries";
import type { InfrastructureSnapshot, RailwayDeploymentModel } from "./model";
import { classifyDeploymentStatus } from "./model";

export type CauseClassification = "CONFIRMED" | "PROBABLE" | "POSSIBLE" | "UNKNOWN";

export const CONFIDENCE_SCALE: Record<CauseClassification, number> = {
  CONFIRMED: 0.9, PROBABLE: 0.6, POSSIBLE: 0.3, UNKNOWN: 0.1,
};

export interface DiagnosticTrigger {
  kind: RailwayDiagnosticTriggerKind;
  resourceIds: string[];
  note?: string;
}

export interface Recommendation {
  action: string;
  operationId?: string;
  resourceIds?: string[];
  params?: Record<string, unknown>;
  requiredLevel?: RailwayPermissionLevel;
  rationale: string;
  expectedOutcome?: string;
}

export interface Investigation {
  id: string;
  trigger: DiagnosticTrigger;
  startedAt: string;
  completedAt?: string;
  affectedResources: string[];
  evidence: EvidenceItem[];
  timeline: Array<{ at: string; event: string }>;
  causeClassification: CauseClassification;
  rootCause?: string;
  confidence: number;
  impact: string;
  recommendations: Recommendation[];
  status: "running" | "complete" | "failed";
}

const LOG_ERROR_PATTERNS = /error|failed|fatal|exception|cannot|denied|refused|exit code [1-9]/i;

export interface DiagnosticsDeps {
  client: RailwayClient;
  discovery: DiscoveryService;
  monitoring: MonitoringService;
  audit: RailwayAuditLog;
  state: RailwayStateRepo;
  events: RailwayEventStore;
  /** Optional memory hook: infrastructure observations → JARVIS memory. */
  remember?: (m: { title: string; content: string; importance: number; sourceId: string }) => void;
  projectId?: string;
}

export class DiagnosticEngine {
  constructor(private readonly deps: DiagnosticsDeps) {}

  async investigate(trigger: DiagnosticTrigger): Promise<RailwayResult<Investigation>> {
    const investigation: Investigation = {
      id: nexusId("inv"),
      trigger,
      startedAt: new Date().toISOString(),
      affectedResources: [...trigger.resourceIds],
      evidence: [],
      timeline: [],
      causeClassification: "UNKNOWN",
      confidence: CONFIDENCE_SCALE.UNKNOWN,
      impact: "",
      recommendations: [],
      status: "running",
    };
    this.deps.state.set(`investigation:${investigation.id}`, investigation);

    // ---- step 2/3: identify affected infrastructure + collect evidence -----
    const snapRes = await this.deps.discovery.discoverAll();
    const snapshot: InfrastructureSnapshot | null = snapRes.ok ? snapRes.value : null;
    if (!snapRes.ok) {
      investigation.evidence.push({ source: "discovery", summary: `discovery failed: ${snapRes.error.kind}: ${snapRes.error.message}` });
    }
    if (snapshot) {
      for (const si of snapshot.serviceInstances) {
        investigation.evidence.push({
          source: "service_instance",
          summary: `${si.serviceName}: latest deployment ${si.latestDeployment?.status ?? "none"}, ${si.domains.length} domain(s), replicas ${si.numReplicas ?? "?"}`,
          data: { serviceId: si.serviceId, environmentId: si.environmentId, latest: si.latestDeployment?.id ?? null, status: si.latestDeployment?.status ?? null },
        });
      }
      if (snapshot.platformStatus) {
        investigation.evidence.push({
          source: "platform_status",
          summary: `Railway platform stable=${snapshot.platformStatus.isStable}${snapshot.platformStatus.incident ? `, incident=${snapshot.platformStatus.incident.status}: ${snapshot.platformStatus.incident.message}` : ""}`,
        });
      }
    }

    // ---- steps 4/5: logs + deployment history for failed deployments -------
    let failedDeployment: RailwayDeploymentModel | null = null;
    if (snapshot) {
      const candidates = trigger.resourceIds.length > 0
        ? snapshot.recentDeployments.filter((d) => trigger.resourceIds.includes(d.id))
        : snapshot.recentDeployments;
      failedDeployment =
        candidates.find((d) => classifyDeploymentStatus(d.status) === "failed") ??
        snapshot.serviceInstances.map((si) => si.latestDeployment).find((d) => d && classifyDeploymentStatus(d.status) === "failed") ??
        null;
    }
    let logEvidence: string[] = [];
    if (failedDeployment) {
      investigation.affectedResources.push(failedDeployment.id);
      const logsRes = await this.deps.client.request<{ deploymentLogs: Array<{ message: string; severity?: string; timestamp: string }> }>(
        Q_DEPLOYMENT_LOGS, { deploymentId: failedDeployment.id, limit: 50 }, { critical: true },
      );
      if (logsRes.ok) {
        const logs = logsRes.value.data.deploymentLogs ?? [];
        logEvidence = logs.filter((l) => LOG_ERROR_PATTERNS.test(l.message)).map((l) => l.message.slice(0, 240));
        investigation.evidence.push({
          source: "deployment_logs",
          summary: `${logs.length} log lines retrieved for failed deployment ${failedDeployment!.id}; ${logEvidence.length} match error patterns`,
          data: { deploymentId: failedDeployment.id, errorLines: logEvidence.slice(0, 10) },
        });
      } else {
        investigation.evidence.push({ source: "deployment_logs", summary: `logs unavailable: ${logsRes.error.kind}` });
      }
      const evRes = await this.deps.client.request<{ deploymentEvents: { edges: Array<{ node: { id: string; step: string; createdAt: string; completedAt: string | null } }> } }>(
        Q_DEPLOYMENT_EVENTS, { deploymentId: failedDeployment.id, first: 20 }, { critical: true },
      );
      if (evRes.ok) {
        const steps = evRes.value.data.deploymentEvents.edges.map((e) => e.node);
        investigation.evidence.push({
          source: "deployment_events",
          summary: `lifecycle: ${steps.map((s) => s.step).join(" -> ")}`,
          data: { steps: steps.map((s) => ({ step: s.step, at: s.createdAt, completed: s.completedAt })) },
        });
        for (const s of steps) investigation.timeline.push({ at: s.createdAt, event: `deployment step ${s.step}${s.completedAt ? " (completed)" : " (incomplete)"}` });
      }
    }

    // ---- step 7: application health (independent dimension) ------------------
    let appUnhealthy = false;
    const appRes = await this.deps.monitoring.runAll(snapshot ?? undefined);
    if (appRes.ok) {
      const appDim = appRes.value.dimensions.find((d) => d.dimension === "application");
      if (appDim) {
        appUnhealthy = appDim.status === "unhealthy";
        investigation.evidence.push({
          source: "application_health",
          summary: `application dimension: ${appDim.status} — ${appDim.detail}`,
          data: { evidence: appDim.evidence },
        });
      }
    }

    // ---- step 6: correlate timeline ---------------------------------------------
    if (snapshot) {
      for (const ev of snapshot.recentEvents.slice(0, 20)) {
        investigation.timeline.push({ at: ev.createdAt, event: `railway event ${ev.action} on ${ev.object} (${ev.severity})` });
      }
      investigation.timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    }

    // ---- steps 8-11: cause classification + impact + recommendations -----------
    this.classify(investigation, { failedDeployment, logEvidence, appUnhealthy, snapshot, trigger });

    investigation.status = "complete";
    investigation.completedAt = new Date().toISOString();
    this.deps.state.set(`investigation:${investigation.id}`, investigation);
    this.deps.events.appendIdempotent({
      id: `investigation:${investigation.id}`,
      kind: "diagnostic", source: "internal",
      at: investigation.completedAt, doc: {
        id: investigation.id, trigger: investigation.trigger,
        cause: investigation.causeClassification, rootCause: investigation.rootCause,
        confidence: investigation.confidence, affected: investigation.affectedResources,
        recommendations: investigation.recommendations.map((r) => r.action),
      },
    });
    this.deps.audit.record({
      category: "root_cause", severity: investigation.causeClassification === "CONFIRMED" ? "warning" : "info",
      component: "railway.diagnostics", outcome: "success",
      resource: investigation.affectedResources[0] ?? trigger.kind,
      evidence: {
        investigationId: investigation.id, classification: investigation.causeClassification,
        rootCause: investigation.rootCause ?? "unresolved", confidence: investigation.confidence,
        evidenceCount: investigation.evidence.length,
      },
    });
    this.deps.remember?.({
      title: `Railway diagnosis: ${investigation.rootCause ?? trigger.kind}`,
      content: `Investigation ${investigation.id} classified cause as ${investigation.causeClassification} (confidence ${investigation.confidence}). Root cause: ${investigation.rootCause ?? "unknown"}. Impact: ${investigation.impact}`,
      importance: investigation.causeClassification === "CONFIRMED" ? 0.8 : 0.5,
      sourceId: investigation.id,
    });
    return railwayOk(investigation);
  }

  getInvestigation(id: string): Investigation | null {
    return this.deps.state.get<Investigation>(`investigation:${id}`);
  }

  listInvestigations(limit = 50): Investigation[] {
    // Investigations live under state keys — list via the event store index.
    return this.deps.events.list({ kind: "diagnostic", limit }).map((e) => {
      const doc = e.doc as { id?: string };
      return doc?.id ? this.getInvestigation(doc.id) : null;
    }).filter((i): i is Investigation => i !== null);
  }

  /** Deterministic classification rules (documented, evidence-backed). */
  private classify(
    inv: Investigation,
    ctx: {
      failedDeployment: RailwayDeploymentModel | null;
      logEvidence: string[];
      appUnhealthy: boolean;
      snapshot: InfrastructureSnapshot | null;
      trigger: DiagnosticTrigger;
    },
  ): void {
    const { failedDeployment, logEvidence, appUnhealthy, snapshot, trigger } = ctx;

    if (trigger.kind === "credential_failure") {
      inv.causeClassification = "CONFIRMED";
      inv.rootCause = "Railway API credential rejected — token revoked, expired, or wrong token type for the request";
      inv.confidence = CONFIDENCE_SCALE.CONFIRMED;
      inv.impact = "infrastructure visibility lost; monitoring degrades to last-known state (fail-closed, no fabricated data)";
      inv.recommendations.push({
        action: "Rotate RAILWAY_API_TOKEN (owner action in Railway dashboard: Account Settings → Tokens), then update the deployment variable",
        requiredLevel: "L4",
        rationale: "credential failures require owner-managed rotation; agents must never hold rotation rights",
      });
      return;
    }

    if (failedDeployment) {
      if (logEvidence.length > 0) {
        inv.causeClassification = "CONFIRMED";
        inv.rootCause = `deployment ${failedDeployment.id} failed with explicit error output (build/runtime)`;
        inv.confidence = CONFIDENCE_SCALE.CONFIRMED;
        inv.evidence.push({ source: "rule_engine", summary: "log lines matching error patterns present — cause confirmed by direct build/deploy output" });
      } else {
        inv.causeClassification = "PROBABLE";
        inv.rootCause = `deployment ${failedDeployment.id} failed; logs unavailable or clean — cause inferred from deployment status alone`;
        inv.confidence = CONFIDENCE_SCALE.PROBABLE;
      }
      inv.impact = this.impactFor(failedDeployment, snapshot);
      if (failedDeployment.canRollback) {
        inv.recommendations.push({
          action: "Roll back to the last successful deployment",
          operationId: "railway.deployment.rollback", requiredLevel: "L3",
          resourceIds: [failedDeployment.id],
          rationale: "fastest restoration of the last known-good state; failed deployment remains inspectable",
          expectedOutcome: "deployment replaced by the previous successful version — status SUCCESS",
        });
      }
      if (failedDeployment.canRedeploy) {
        inv.recommendations.push({
          action: "Redeploy the failed deployment",
          operationId: "railway.deployment.redeploy", requiredLevel: "L3",
          resourceIds: [failedDeployment.id],
          rationale: "retry the build/deploy (transient build failures often resolve)",
          expectedOutcome: "a new deployment enters the build queue — status BUILDING/QUEUED",
        });
      }
      inv.recommendations.push({
        action: "Inspect full deployment logs for the failing step",
        requiredLevel: "L1",
        rationale: "evidence collected automatically; full logs available for owner review",
      });
      return;
    }

    if (appUnhealthy) {
      const platformIncident = snapshot?.platformStatus?.incident ?? null;
      if (platformIncident) {
        inv.causeClassification = "PROBABLE";
        inv.rootCause = `application unreachable while a Railway platform incident is active (${platformIncident.status}: ${platformIncident.message})`;
        inv.confidence = CONFIDENCE_SCALE.PROBABLE;
      } else {
        inv.causeClassification = "PROBABLE";
        inv.rootCause = "application endpoints failing despite no failed deployment — runtime failure (crash loop, OOM, port binding) or platform networking issue";
        inv.confidence = CONFIDENCE_SCALE.PROBABLE;
      }
      inv.impact = "public application endpoints unavailable or erroring for users";
      const latest = snapshot?.serviceInstances.map((s) => s.latestDeployment).find((d) => d && classifyDeploymentStatus(d.status) === "healthy");
      if (latest?.canRollback) {
        inv.recommendations.push({
          action: "Roll back the most recent successful deployment (suspect runtime regression)",
          operationId: "railway.deployment.rollback", requiredLevel: "L3", resourceIds: [latest.id],
          rationale: "deployment reports SUCCESS but the app is down — a recent change likely broke runtime behaviour",
          expectedOutcome: "previous version restored and application recovers",
        });
      }
      inv.recommendations.push({
        action: "Restart the affected deployment to restore service while investigating",
        operationId: "railway.deployment.restart", requiredLevel: "L3",
        resourceIds: latest ? [latest.id] : [],
        rationale: "crash loops and stuck runtimes often clear on restart",
        expectedOutcome: "deployment restarts — status transitions through INITIALIZING",
      });
      return;
    }

    if (trigger.kind === "infrastructure_discrepancy") {
      inv.causeClassification = "PROBABLE";
      inv.rootCause = "internal state diverged from authoritative Railway state (external change or lost event)";
      inv.confidence = CONFIDENCE_SCALE.PROBABLE;
      inv.impact = "internal records unreliable until reconciliation completes";
      inv.recommendations.push({ action: "Run full reconciliation and adopt the authoritative snapshot", requiredLevel: "L2", rationale: "internal records diverged; authoritative Railway state must be re-established explicitly" });
      return;
    }

    if (trigger.kind === "usage_anomaly") {
      inv.causeClassification = "POSSIBLE";
      inv.rootCause = "resource consumption anomaly detected (heuristic threshold)";
      inv.confidence = CONFIDENCE_SCALE.POSSIBLE;
      inv.impact = "potential cost increase or volume exhaustion";
      inv.recommendations.push({ action: "Review usage report and volume pressure; consider limits adjustment (owner decision)", requiredLevel: "L4", rationale: "resource scaling and spend configuration are owner-level decisions" });
      return;
    }

    // UNKNOWN — evidence stands, speculation does not.
    inv.causeClassification = "UNKNOWN";
    inv.rootCause = undefined;
    inv.confidence = CONFIDENCE_SCALE.UNKNOWN;
    inv.impact = "no failed deployments and no application errors observed for this trigger";
    inv.recommendations.push({
      action: "Continue monitoring; re-run diagnostics if the anomaly persists",
      requiredLevel: "L1",
      rationale: "insufficient evidence for classification — honesty over speculation",
    });
  }

  private impactFor(dep: RailwayDeploymentModel, snapshot: InfrastructureSnapshot | null): string {
    const si = snapshot?.serviceInstances.find((s) => s.serviceId === dep.serviceId);
    const domains = si?.domains.map((d) => d.domain).join(", ") ?? "no domains";
    return `service ${si?.serviceName ?? dep.serviceId ?? "unknown"} affected; public endpoints: ${domains || "none"}`;
  }
}
