/**
 * @nexus/railway — permission-based authorization (directive §8).
 *
 * Four levels:
 *   L1 read-only intelligence   — automatic (queries only)
 *   L2 recovery planning        — automatic (no API calls)
 *   L3 authorized execution     — owner-granted, scoped, single-use
 *   L4 critical production ops  — owner-granted, never agent-granted
 *
 * Invariants enforced here (all tested):
 *  - An agent's internal approval is NEVER authorization from the owner:
 *    only principal {type:"user", id:"owner"} can be granted anything.
 *  - Grants are single-use, expire, and are scoped to exact resource ids.
 *  - Read-only mode (default) refuses every mutation regardless of grants.
 *  - Every decision — granted or denied — is written to the hash-chained audit.
 */
import { randomUUID } from "node:crypto";
import type { RailwayPermissionLevel } from "@nexus/contracts";
import { RailwayApiError } from "./errors";
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import type { RailwayAuditLog } from "./audit";
import type { RailwayStateRepo } from "./state";

export interface RailwayOperation {
  id: string;
  mutationName: string;
  level: Exclude<RailwayPermissionLevel, "L1" | "L2">;
  description: string;
  reversible: boolean;
  protectedScopes: string[];
  /** v1: ops with verified simple signatures are executable; input-object
   *  mutations are registered (and denied execution) until schema-validated
   *  input construction is added — honestly declared, never silently absent. */
  executable: boolean;
}

/** The operation registry — every Railway mutation this system could run. */
export const OPERATIONS: readonly RailwayOperation[] = [
  { id: "railway.deployment.restart", mutationName: "deploymentRestart", level: "L3", description: "Restart a deployment", reversible: true, protectedScopes: ["deployment restart"], executable: true },
  { id: "railway.deployment.redeploy", mutationName: "deploymentRedeploy", level: "L3", description: "Redeploy a deployment", reversible: true, protectedScopes: ["deployment replacement"], executable: true },
  { id: "railway.deployment.rollback", mutationName: "deploymentRollback", level: "L3", description: "Roll back to a previous deployment", reversible: true, protectedScopes: ["deployment replacement"], executable: true },
  { id: "railway.deployment.cancel", mutationName: "deploymentCancel", level: "L3", description: "Cancel an in-flight deployment", reversible: false, protectedScopes: ["deployment lifecycle"], executable: true },
  { id: "railway.deployment.approve", mutationName: "deploymentApprove", level: "L3", description: "Approve a deployment awaiting approval", reversible: false, protectedScopes: ["deployment lifecycle"], executable: true },
  { id: "railway.deployment.stop", mutationName: "deploymentStop", level: "L4", description: "Stop a running deployment", reversible: true, protectedScopes: ["service availability"], executable: true },
  { id: "railway.deployment.remove", mutationName: "deploymentRemove", level: "L4", description: "Remove a deployment permanently", reversible: false, protectedScopes: ["infrastructure destruction"], executable: true },
  { id: "railway.service.redeploy", mutationName: "serviceInstanceRedeploy", level: "L3", description: "Redeploy a service instance", reversible: true, protectedScopes: ["deployment replacement"], executable: true },
  { id: "railway.service.deploy", mutationName: "serviceInstanceDeploy", level: "L3", description: "Trigger a service deployment from the connected repo", reversible: true, protectedScopes: ["deployment replacement"], executable: true },
  { id: "railway.volume.backup.create", mutationName: "volumeInstanceBackupCreate", level: "L3", description: "Create a volume backup snapshot", reversible: true, protectedScopes: ["backup creation"], executable: true },
  { id: "railway.volume.backup.restore", mutationName: "volumeInstanceBackupRestore", level: "L4", description: "Restore a volume backup (destructive to current volume data)", reversible: false, protectedScopes: ["volume modification", "database modification", "infrastructure destruction"], executable: true },
  // Declared but NOT executable in v1 — complex input objects require
  // owner-supplied, schema-validated inputs (documented limitation).
  { id: "railway.variable.upsert", mutationName: "variableUpsert", level: "L4", description: "Create/update an environment variable", reversible: true, protectedScopes: ["environment variable changes"], executable: false },
  { id: "railway.variable.delete", mutationName: "variableDelete", level: "L4", description: "Delete an environment variable", reversible: false, protectedScopes: ["environment variable changes"], executable: false },
  { id: "railway.service.update", mutationName: "serviceUpdate", level: "L4", description: "Update service configuration", reversible: true, protectedScopes: ["service configuration changes"], executable: false },
  { id: "railway.service.delete", mutationName: "serviceDelete", level: "L4", description: "Delete a service", reversible: false, protectedScopes: ["infrastructure destruction"], executable: false },
  { id: "railway.service.limits.update", mutationName: "serviceInstanceLimitsUpdate", level: "L4", description: "Update resource limits (scaling)", reversible: true, protectedScopes: ["resource scaling"], executable: false },
  { id: "railway.volume.create", mutationName: "volumeCreate", level: "L4", description: "Create a volume", reversible: true, protectedScopes: ["volume modification"], executable: false },
  { id: "railway.volume.delete", mutationName: "volumeDelete", level: "L4", description: "Delete a volume", reversible: false, protectedScopes: ["volume modification", "infrastructure destruction"], executable: false },
  { id: "railway.domain.create", mutationName: "serviceDomainCreate", level: "L4", description: "Create a service domain", reversible: true, protectedScopes: ["domain changes"], executable: false },
  { id: "railway.domain.delete", mutationName: "serviceDomainDelete", level: "L4", description: "Delete a service domain", reversible: false, protectedScopes: ["domain changes"], executable: false },
  { id: "railway.project.delete", mutationName: "projectDelete", level: "L4", description: "Delete a project", reversible: false, protectedScopes: ["infrastructure destruction"], executable: false },
  { id: "railway.environment.delete", mutationName: "environmentDelete", level: "L4", description: "Delete an environment", reversible: false, protectedScopes: ["infrastructure destruction"], executable: false },
  { id: "railway.usage.limit.remove", mutationName: "usageLimitRemove", level: "L4", description: "Remove usage/spend limits", reversible: true, protectedScopes: ["spending configuration"], executable: false },
] as const;

export interface AuthorizationRequest {
  operationId: string;
  resourceIds: string[];
  scope: string;
  justification?: string;
  principal: { type: "user" | "agent"; id: string };
}

export interface AuthorizationDecision {
  granted: boolean;
  grantId?: string;
  reason: string;
  operation?: RailwayOperation;
  at: string;
}

export interface StoredGrant {
  grantId: string;
  operationId: string;
  resourceIds: string[];
  scope: string;
  principal: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

const GRANT_TTL_MS = 15 * 60 * 1000;

export interface AuthorizationDeps {
  audit: RailwayAuditLog;
  state: RailwayStateRepo;
  now?: () => number;
}

export class AuthorizationService {
  private readonly readOnly: boolean;

  constructor(
    private readonly deps: AuthorizationDeps,
    opts: { readOnly?: boolean } = {},
  ) {
    this.readOnly = opts.readOnly ?? true;
  }

  isReadOnly(): boolean {
    return this.readOnly;
  }

  getOperation(operationId: string): RailwayOperation | undefined {
    return OPERATIONS.find((o) => o.id === operationId);
  }

  listOperations(): readonly RailwayOperation[] {
    return OPERATIONS;
  }

  /** Request an explicit, scoped, single-use authorization. */
  requestAuthorization(req: AuthorizationRequest): AuthorizationDecision {
    const at = new Date((this.deps.now ?? Date.now)()).toISOString();
    const op = this.getOperation(req.operationId);
    const deny = (reason: string): AuthorizationDecision => {
      this.deps.audit.record({
        category: "authorized_operation", severity: "warning", component: "railway.authorization",
        outcome: "rejected", resource: req.resourceIds[0] ?? req.operationId,
        principal: `${req.principal.type}:${req.principal.id}`,
        evidence: { operationId: req.operationId, scope: req.scope, reason },
      });
      return { granted: false, reason, at };
    };

    if (!op) return deny(`unknown operation: ${req.operationId}`);
    if (!op.executable) return deny(`operation ${op.id} is registered but not executable in this version (complex input requires owner-supplied schema-validated arguments)`);
    if (req.principal.type === "agent") {
      return deny("agent principals can never be granted infrastructure operations — an agent's internal approval is not owner authorization (directive §8)");
    }
    if (req.principal.id !== "owner") {
      return deny(`user principal '${req.principal.id}' is not the owner`);
    }
    if (this.readOnly) {
      return deny("system is in READ-ONLY mode (RAILWAY_READ_ONLY=true default): all Railway mutations are refused regardless of grants");
    }
    if (req.resourceIds.length === 0) return deny("authorization must identify the exact affected resources");
    if (!req.scope || req.scope.trim().length === 0) return deny("authorization must state the intended scope");

    const grantId = `nexus_gnt_${randomUUID()}`;
    const nowMs = (this.deps.now ?? Date.now)();
    const grant: StoredGrant = {
      grantId, operationId: op.id, resourceIds: req.resourceIds, scope: req.scope,
      principal: `${req.principal.type}:${req.principal.id}`,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + GRANT_TTL_MS).toISOString(),
      consumedAt: null,
    };
    this.deps.state.set(`grant:${grantId}`, grant);
    this.deps.audit.record({
      category: "authorized_operation", severity: "info", component: "railway.authorization",
      outcome: "success", resource: req.resourceIds.join(","),
      principal: `${req.principal.type}:${req.principal.id}`,
      evidence: { operationId: op.id, level: op.level, scope: req.scope, grantId, expiresAt: grant.expiresAt, justification: req.justification ?? null },
    });
    return { granted: true, grantId, reason: `granted ${op.level} operation '${op.id}' for [${req.resourceIds.join(", ")}], scope '${req.scope}', single-use, expires ${grant.expiresAt}`, operation: op, at };
  }

  /** Validate + consume a grant (execution path). Single-use enforcement. */
  consumeGrant(grantId: string, operationId: string, resourceIds: string[]): RailwayResult<StoredGrant> {
    const grant = this.deps.state.get<StoredGrant>(`grant:${grantId}`);
    const reject = (reason: string): RailwayResult<StoredGrant> => ({
      ok: false,
      error: new RailwayApiError({ kind: "PERMISSION", message: reason }),
    });
    if (!grant) return reject("grant not found");
    if (grant.consumedAt) return reject("grant already consumed (single-use)");
    if ((this.deps.now ?? Date.now)() > Date.parse(grant.expiresAt)) return reject("grant expired");
    if (grant.operationId !== operationId) return reject(`grant is for operation ${grant.operationId}, not ${operationId}`);
    const grantedSet = new Set(grant.resourceIds);
    for (const id of resourceIds) {
      if (!grantedSet.has(id)) return reject(`resource ${id} is not covered by the grant scope [${grant.resourceIds.join(", ")}]`);
    }
    const consumed: StoredGrant = { ...grant, consumedAt: new Date((this.deps.now ?? Date.now)()).toISOString() };
    this.deps.state.set(`grant:${grantId}`, consumed);
    return railwayOk(consumed);
  }

  getGrant(grantId: string): StoredGrant | null {
    return this.deps.state.get<StoredGrant>(`grant:${grantId}`);
  }
}
