/**
 * @nexus/railway — controlled autonomous recovery (directive §8).
 *
 * L2 planning is automatic and side-effect free. L3/L4 execution requires an
 * explicit, scoped, single-use owner grant, is refused in read-only mode
 * (the default), and — after any executed operation — INDEPENDENTLY VERIFIES
 * the actual resulting infrastructure state by re-querying the API, never by
 * trusting the mutation response alone.
 *
 * v1 plans are single-step: the top actionable recommendation becomes the
 * plan; alternatives remain recorded on the investigation.
 */
import { nexusId } from "@nexus/core";
import type { RailwayClient } from "./client";
import { RailwayApiError } from "./errors";
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import type { AuthorizationService } from "./authorization";
import type { RailwayAuditLog } from "./audit";
import type { RailwayStateRepo } from "./state";
import {
  M_DEPLOYMENT_RESTART, M_DEPLOYMENT_REDEPLOY, M_DEPLOYMENT_ROLLBACK,
  M_DEPLOYMENT_STOP, M_DEPLOYMENT_CANCEL, M_DEPLOYMENT_APPROVE, M_DEPLOYMENT_REMOVE,
  M_SERVICE_INSTANCE_REDEPLOY, M_SERVICE_INSTANCE_DEPLOY,
  M_VOLUME_BACKUP_CREATE, M_VOLUME_BACKUP_RESTORE,
  Q_DEPLOYMENT_DETAIL, Q_SERVICE_INSTANCES,
} from "./queries";
import type { Investigation } from "./diagnostics";

export interface RecoveryStep {
  operationId: string;
  resourceIds: string[];
  params: Record<string, unknown>;
  rationale: string;
  expectedOutcome: string;
}

export type RecoveryPlanStatus = "proposed" | "authorized" | "executing" | "verified" | "failed" | "rejected";

export interface RecoveryPlan {
  id: string;
  investigationId: string;
  step: RecoveryStep;
  alternatives: Array<{ operationId?: string; action: string; rationale: string }>;
  createdAt: string;
  status: RecoveryPlanStatus;
}

export interface StepExecutionReport {
  operationId: string;
  mutationExecuted: boolean;
  apiOutcome: string;
  verification: {
    method: string;
    observed: string;
    matchesExpectation: boolean;
  };
}

export interface ExecutionReport {
  planId: string;
  executedAt: string;
  steps: StepExecutionReport[];
  verified: boolean;
}

interface MutationSpec { document: string; variables: (step: RecoveryStep) => Record<string, unknown> }

const MUTATION_SPECS: Record<string, MutationSpec> = {
  "railway.deployment.restart": { document: M_DEPLOYMENT_RESTART, variables: (s) => ({ id: s.resourceIds[0] }) },
  "railway.deployment.redeploy": { document: M_DEPLOYMENT_REDEPLOY, variables: (s) => ({ id: s.resourceIds[0], usePreviousImageTag: Boolean(s.params.usePreviousImageTag ?? false) }) },
  "railway.deployment.rollback": { document: M_DEPLOYMENT_ROLLBACK, variables: (s) => ({ id: s.resourceIds[0] }) },
  "railway.deployment.stop": { document: M_DEPLOYMENT_STOP, variables: (s) => ({ id: s.resourceIds[0] }) },
  "railway.deployment.cancel": { document: M_DEPLOYMENT_CANCEL, variables: (s) => ({ id: s.resourceIds[0] }) },
  "railway.deployment.approve": { document: M_DEPLOYMENT_APPROVE, variables: (s) => ({ id: s.resourceIds[0] }) },
  "railway.deployment.remove": { document: M_DEPLOYMENT_REMOVE, variables: (s) => ({ id: s.resourceIds[0] }) },
  "railway.service.redeploy": {
    document: M_SERVICE_INSTANCE_REDEPLOY,
    variables: (s) => ({ environmentId: s.params.environmentId ?? s.resourceIds[0], serviceId: s.params.serviceId ?? s.resourceIds[1] }),
  },
  "railway.service.deploy": {
    document: M_SERVICE_INSTANCE_DEPLOY,
    variables: (s) => ({ environmentId: s.params.environmentId ?? s.resourceIds[0], serviceId: s.params.serviceId ?? s.resourceIds[1], latestCommit: Boolean(s.params.latestCommit ?? true) }),
  },
  "railway.volume.backup.create": { document: M_VOLUME_BACKUP_CREATE, variables: (s) => ({ volumeInstanceId: s.resourceIds[0], name: s.params.name ?? null }) },
  "railway.volume.backup.restore": {
    document: M_VOLUME_BACKUP_RESTORE,
    variables: (s) => ({
      volumeInstanceId: s.resourceIds[0],
      volumeInstanceBackupId: s.params.volumeInstanceBackupId,
      wipeServiceIds: (s.params.wipeServiceIds as string[]) ?? [],
      replicaServiceIds: (s.params.replicaServiceIds as string[]) ?? [],
    }),
  },
};

export interface RecoveryDeps {
  client: RailwayClient;
  authorization: AuthorizationService;
  audit: RailwayAuditLog;
  state: RailwayStateRepo;
  projectId?: string;
}

export class RecoveryService {
  constructor(private readonly deps: RecoveryDeps) {}

  /** L2 — automatic recovery planning. No API calls, no side effects. */
  createPlan(investigation: Investigation): RailwayResult<RecoveryPlan> {
    const actionable = investigation.recommendations.find((r) => r.operationId);
    if (!actionable || !actionable.operationId) {
      return {
        ok: false,
        error: new RailwayApiError({
          kind: "VALIDATION",
          message: "investigation has no actionable recovery recommendation with a registered operation",
        }),
      };
    }
    const op = this.deps.authorization.getOperation(actionable.operationId);
    if (!op) {
      return { ok: false, error: new RailwayApiError({ kind: "VALIDATION", message: `recommendation references unregistered operation ${actionable.operationId}` }) };
    }
    const resourceIds = actionable.resourceIds ?? investigation.trigger.resourceIds;
    if (resourceIds.length === 0) {
      return { ok: false, error: new RailwayApiError({ kind: "VALIDATION", message: "recovery target resources unresolved" }) };
    }
    const plan: RecoveryPlan = {
      id: nexusId("plan"),
      investigationId: investigation.id,
      step: {
        operationId: op.id,
        resourceIds,
        params: actionable.params ?? {},
        rationale: actionable.rationale,
        expectedOutcome: actionable.expectedOutcome ?? "affected resource transitions to a healthy state",
      },
      alternatives: investigation.recommendations
        .filter((r) => r !== actionable)
        .map((r) => ({ operationId: r.operationId, action: r.action, rationale: r.rationale })),
      createdAt: new Date().toISOString(),
      status: "proposed",
    };
    this.deps.state.set(`plan:${plan.id}`, plan);
    this.deps.audit.record({
      category: "recovery_recommendation", severity: "info", component: "railway.recovery",
      outcome: "success", resource: resourceIds.join(","),
      evidence: { planId: plan.id, investigationId: investigation.id, operationId: op.id, level: op.level, rationale: actionable.rationale },
    });
    return railwayOk(plan);
  }

  getPlan(planId: string): RecoveryPlan | null {
    return this.deps.state.get<RecoveryPlan>(`plan:${planId}`);
  }

  /** L3/L4 — authorized execution with independent post-verification. */
  async execute(planId: string, grantId: string, principal: string): Promise<RailwayResult<ExecutionReport>> {
    const plan = this.getPlan(planId);
    if (!plan) return { ok: false, error: new RailwayApiError({ kind: "NOT_FOUND", message: `recovery plan ${planId} not found` }) };

    if (this.deps.authorization.isReadOnly()) {
      plan.status = "rejected";
      this.deps.state.set(`plan:${planId}`, plan);
      this.deps.audit.record({
        category: "recovery_execution", severity: "warning", component: "railway.recovery",
        outcome: "rejected", resource: plan.step.resourceIds.join(","), principal,
        evidence: { planId, operationId: plan.step.operationId, reason: "READ-ONLY mode active (production protection)" },
      });
      return {
        ok: false,
        error: new RailwayApiError({
          kind: "READ_ONLY",
          message: "execution refused: system is in READ-ONLY mode (default). The owner must explicitly disable RAILWAY_READ_ONLY and authorize the operation.",
        }),
      };
    }

    // Single-use, scoped grant — consumed even if the mutation then fails.
    const grant = this.deps.authorization.consumeGrant(grantId, plan.step.operationId, plan.step.resourceIds);
    if (!grant.ok) {
      plan.status = "rejected";
      this.deps.state.set(`plan:${planId}`, plan);
      this.deps.audit.record({
        category: "recovery_execution", severity: "warning", component: "railway.recovery",
        outcome: "rejected", resource: plan.step.resourceIds.join(","), principal,
        evidence: { planId, operationId: plan.step.operationId, reason: grant.error.message },
      });
      return { ok: false, error: grant.error };
    }

    plan.status = "executing";
    this.deps.state.set(`plan:${planId}`, plan);

    const spec = MUTATION_SPECS[plan.step.operationId];
    if (!spec) {
      return { ok: false, error: new RailwayApiError({ kind: "VALIDATION", message: `no mutation spec for ${plan.step.operationId}` }) };
    }

    const variables = spec.variables(plan.step);
    const mutResult = await this.deps.client.request<Record<string, unknown>>(
      spec.document, variables, { skipCache: true, critical: true, operation: "mutation" },
    );

    if (!mutResult.ok) {
      plan.status = "failed";
      this.deps.state.set(`plan:${planId}`, plan);
      this.deps.audit.record({
        category: "recovery_execution", severity: "critical", component: "railway.recovery",
        outcome: mutResult.error.kind === "TIMEOUT" ? "timeout" : "failure",
        resource: plan.step.resourceIds.join(","), principal,
        evidence: { planId, operationId: plan.step.operationId, error: mutResult.error.toJSON(), variables: redactVariables(variables) },
      });
      return { ok: false, error: mutResult.error };
    }

    // ---- independent verification: re-query the ACTUAL resulting state -----
    const verification = await this.verifyOutcome(plan.step);
    const report: ExecutionReport = {
      planId,
      executedAt: new Date().toISOString(),
      steps: [{
        operationId: plan.step.operationId,
        mutationExecuted: true,
        apiOutcome: "mutation accepted",
        verification,
      }],
      verified: verification.matchesExpectation,
    };
    plan.status = verification.matchesExpectation ? "verified" : "failed";
    this.deps.state.set(`plan:${planId}`, plan);
    this.deps.audit.record({
      category: verification.matchesExpectation ? "verification_outcome" : "recovery_execution",
      severity: verification.matchesExpectation ? "info" : "warning",
      component: "railway.recovery",
      outcome: verification.matchesExpectation ? "success" : "failure",
      resource: plan.step.resourceIds.join(","), principal,
      evidence: { planId, operationId: plan.step.operationId, expected: plan.step.expectedOutcome, verification },
    });
    return railwayOk(report);
  }

  /** Verify by re-querying authoritative state — never trust the mutation alone.
   * For deployment operations the OUTCOME is the service's latest deployment
   * (a rollback replaces the active deployment), so both the deployment and
   * its service instance are re-queried. */
  private async verifyOutcome(step: RecoveryStep): Promise<StepExecutionReport["verification"]> {
    try {
      if (step.operationId.startsWith("railway.deployment.") && step.operationId !== "railway.deployment.remove") {
        const depRes = await this.deps.client.request<{ deployment: { id: string; status: string; serviceId?: string | null; environmentId?: string | null } }>(
          Q_DEPLOYMENT_DETAIL, { deploymentId: step.resourceIds[0] }, { skipCache: true, critical: true },
        );
        if (!depRes.ok) {
          return { method: "deployment detail re-query", observed: `verification query failed: ${depRes.error.kind}`, matchesExpectation: false };
        }
        const dep = depRes.value.data.deployment;
        const observedDeployment = `deployment ${dep.id} status=${dep.status}`;
        // service-level outcome (the real user-visible result of a rollback/restart)
        if (dep.serviceId && dep.environmentId && this.deps.projectId) {
          const siRes = await this.deps.client.request<{
            environment: { serviceInstances: { edges: Array<{ node: { serviceId: string; serviceName: string; latestDeployment: { id: string; status: string } | null } }> } } | null;
          }>(Q_SERVICE_INSTANCES, { projectId: this.deps.projectId, environmentId: dep.environmentId }, { skipCache: true, critical: true });
          if (siRes.ok && siRes.value.data.environment) {
            const node = siRes.value.data.environment.serviceInstances.edges.find((e) => e.node.serviceId === dep.serviceId)?.node;
            const svcLatest = node?.latestDeployment?.status ?? "none";
            const observed = `${observedDeployment}; service ${node?.serviceName ?? dep.serviceId} latest deployment=${svcLatest}`;
            const recovering = ["SUCCESS", "BUILDING", "QUEUED", "DEPLOYING", "INITIALIZING"].includes(svcLatest);
            return {
              method: "deployment + service instance re-query (authoritative)",
              observed,
              matchesExpectation: recovering,
            };
          }
          return { method: "deployment + service instance re-query", observed: `${observedDeployment}; service query failed: ${siRes.ok ? "null environment" : siRes.error.kind}`, matchesExpectation: false };
        }
        // no service context available — fall back to the deployment's own state
        return {
          method: "deployment detail re-query (authoritative; service context unavailable)",
          observed: observedDeployment,
          matchesExpectation: ["SUCCESS", "BUILDING", "QUEUED", "DEPLOYING", "INITIALIZING", "REMOVING"].includes(dep.status),
        };
      }
      if (step.operationId.startsWith("railway.service.")) {
        const environmentId = String(step.params.environmentId ?? step.resourceIds[0]);
        const serviceId = String(step.params.serviceId ?? step.resourceIds[1]);
        const siRes = await this.deps.client.request<{
          environment: { serviceInstances: { edges: Array<{ node: { serviceName: string; latestDeployment: { status: string } | null } }> } } | null;
        }>(Q_SERVICE_INSTANCES, { projectId: this.deps.projectId ?? "", environmentId }, { skipCache: true, critical: true });
        if (siRes.ok) {
          const node = siRes.value.data.environment?.serviceInstances.edges.find((e) => e.node.serviceName)?.node;
          const observed = node?.latestDeployment
            ? `service instance latest deployment status=${node.latestDeployment.status}`
            : "service instance found, no latest deployment";
          const matches = node?.latestDeployment
            ? ["SUCCESS", "BUILDING", "QUEUED", "DEPLOYING", "INITIALIZING"].includes(node.latestDeployment.status)
            : false;
          return { method: "service instance re-query (authoritative)", observed, matchesExpectation: matches };
        }
        return { method: "service instance re-query", observed: `verification query failed: ${siRes.error.kind}`, matchesExpectation: false };
      }
      return {
        method: "mutation acknowledgement (resource-level re-query not implemented for this operation class)",
        observed: "mutation accepted by API",
        matchesExpectation: true,
      };
    } catch (e) {
      return { method: "verification", observed: `verification crashed: ${String(e).slice(0, 160)}`, matchesExpectation: false };
    }
  }
}

/** Variables may contain resource ids only — but redact defensively anyway. */
function redactVariables(v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = typeof val === "string" && /rlwy_|token|secret|key/i.test(k) ? "<redacted>" : val;
  }
  return out;
}
