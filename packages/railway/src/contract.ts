/**
 * @nexus/railway — API contract intelligence.
 *
 * Directive §3 (API contract resilience): detect schema changes, deprecated
 * fields, removed fields, permission changes, unexpected response structures.
 * The committed baseline (contract/expected-fields.json) was machine-generated
 * from live introspection on 2026-11-15. `introspectLiveFields` re-derives the
 * same shape at runtime; `diffContract` reports drift with severities so a
 * broken integration degrades visibly instead of reporting false health.
 */
import baseline from "../contract/expected-fields.json";
import type { RailwayClient } from "./client";
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";

export interface ContractBaselineShape {
  capturedAt: string;
  endpoint: string;
  types: Record<string, { fields: Record<string, boolean> }>;
  enums: Record<string, string[]>;
  usedQueryFields: string[];
  usedMutationFields: string[];
}

export const CONTRACT_BASELINE = baseline as unknown as ContractBaselineShape;

export type ContractDriftSeverity = "BREAKING" | "WARNING" | "INFO";

export interface ContractDrift {
  type: "type_removed" | "field_removed" | "field_deprecated" | "field_added" | "enum_value_removed";
  typeName: string;
  field?: string;
  severity: ContractDriftSeverity;
  detail: string;
}

/**
 * The exact fields our queries depend on. The unit contract test asserts this
 * map is a subset of the committed baseline — so queries can never silently
 * depend on something the baseline does not guarantee.
 */
export const USED_FIELDS: Record<string, string[]> = {
  Query: [
    "projects", "workspace", "platformStatus", "project", "environment", "deployment",
    "deploymentLogs", "buildLogs", "deploymentEvents", "volumeInstanceBackupList",
    "volumeInstanceBackupScheduleList", "events", "auditLogs", "estimatedUsage",
    "workspaceUsageTotals", "usage",
  ],
  Mutation: [
    "deploymentRestart", "deploymentRedeploy", "deploymentRollback", "deploymentStop",
    "deploymentCancel", "deploymentApprove", "deploymentRemove",
    "serviceInstanceRedeploy", "serviceInstanceDeploy",
    "volumeInstanceBackupCreate", "volumeInstanceBackupRestore",
  ],
  Project: ["id", "name", "description", "createdAt", "updatedAt", "workspaceId", "isPublic", "baseEnvironmentId", "environments"],
  Environment: ["id", "name", "isEphemeral", "createdAt", "updatedAt", "serviceInstances", "deployments", "volumeInstances"],
  ServiceInstance: ["id", "serviceId", "serviceName", "environmentId", "region", "healthcheckPath", "restartPolicyType", "restartPolicyMaxRetries", "numReplicas", "hasEverDeployed", "sleepApplication", "builder", "latestDeployment", "domains"],
  Deployment: ["id", "status", "createdAt", "updatedAt", "statusUpdatedAt", "staticUrl", "url", "serviceId", "environmentId", "projectId", "canRedeploy", "canRollback", "deploymentStopped", "meta", "creator"],
  DeploymentCreator: ["email", "name"],
  AllDomains: ["serviceDomains", "customDomains"],
  ServiceDomain: ["id", "domain", "suffix", "syncStatus", "targetPort"],
  CustomDomain: ["id", "domain", "status"],
  CustomDomainStatus: ["verified", "certificateStatus"],
  VolumeInstance: ["id", "volumeId", "serviceId", "environmentId", "sizeMB", "currentSizeMB", "mountPath", "state", "region", "createdAt"],
  VolumeInstanceBackup: ["id", "name", "createdAt", "expiresAt", "usedMB", "referencedMB", "volumeInstanceSizeMB"],
  VolumeInstanceBackupSchedule: ["id", "name", "kind", "cron", "retentionSeconds", "createdAt"],
  PlatformStatus: ["isStable", "incident", "maintenance"],
  Incident: ["id", "message", "status", "url", "createdAt"],
  Maintenance: ["id", "message", "status", "start", "url"],
  Event: ["id", "action", "object", "severity", "createdAt", "payload", "projectId", "environmentId"],
  AuditLog: ["id", "eventType", "createdAt", "projectId", "environmentId", "workspaceId"],
  AggregatedUsage: ["measurement", "value"],
  EstimatedUsage: ["estimatedValue", "measurement", "projectId"],
  Log: ["message", "severity", "timestamp"],
  DeploymentEvent: ["id", "step", "createdAt", "completedAt"],
  Workspace: ["id", "name", "plan", "projectCount", "createdAt"],
  PageInfo: ["hasNextPage"],
  QueryProjectsConnection: ["edges", "pageInfo"],
  ProjectEnvironmentsConnection: ["edges", "pageInfo"],
  EnvironmentServiceInstancesConnection: ["edges", "pageInfo"],
  EnvironmentDeploymentsConnection: ["edges", "pageInfo"],
  EnvironmentVolumeInstancesConnection: ["edges", "pageInfo"],
  QueryEventsConnection: ["edges", "pageInfo"],
  QueryAuditLogsConnection: ["edges", "pageInfo"],
  QueryDeploymentEventsConnection: ["edges"],
};

/** Unit-testable: are our declared dependencies covered by the baseline? */
export function checkUsedFieldsAgainstBaseline(): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const [typeName, fields] of Object.entries(USED_FIELDS)) {
    const base = CONTRACT_BASELINE.types[typeName];
    if (!base) { violations.push(`type ${typeName} absent from contract baseline`); continue; }
    for (const f of fields) {
      if (!(f in base.fields)) violations.push(`${typeName}.${f} absent from contract baseline`);
    }
  }
  return { ok: violations.length === 0, violations };
}

export type LiveFields = Record<string, Record<string, boolean>>;

/**
 * Single batched introspection over the baseline types (one API request).
 * Returns type -> field -> isDeprecated.
 */
export async function introspectLiveFields(client: RailwayClient): Promise<RailwayResult<LiveFields>> {
  const typeNames = Object.keys(CONTRACT_BASELINE.types).filter((t) => t !== "Query" && t !== "Mutation");
  const parts: string[] = [];
  const aliasToType = new Map<string, string>();
  // Query + Mutation first (explicit aliases, explicit mapping)
  parts.push(`q: __type(name: "Query") { fields(includeDeprecated: true) { name isDeprecated } }`);
  aliasToType.set("q", "Query");
  parts.push(`m: __type(name: "Mutation") { fields(includeDeprecated: true) { name isDeprecated } }`);
  aliasToType.set("m", "Mutation");
  for (const name of typeNames) {
    const alias = `t${parts.length}`;
    parts.push(`${alias}: __type(name: ${JSON.stringify(name)}) { fields(includeDeprecated: true) { name isDeprecated } }`);
    aliasToType.set(alias, name);
  }
  const query = `{ ${parts.join(" ")} }`;
  const res = await client.request<Record<string, { fields: Array<{ name: string; isDeprecated: boolean }> } | null>>(query, {}, { critical: true, skipCache: true });
  if (!res.ok) return { ok: false, error: res.error };

  const live: LiveFields = {};
  for (const [alias, typeName] of aliasToType) {
    const value = res.value.data[alias];
    if (!value) {
      // type no longer exists in the live schema — record as absent
      live[typeName] = {};
      continue;
    }
    live[typeName] = Object.fromEntries((value.fields ?? []).map((f) => [f.name, f.isDeprecated]));
  }
  return railwayOk(live);
}

/**
 * Diff live introspection against the committed baseline.
 * BREAKING drift must degrade the affected capability's health reporting.
 */
export function diffContract(live: LiveFields): ContractDrift[] {
  const drifts: ContractDrift[] = [];
  for (const [typeName, base] of Object.entries(CONTRACT_BASELINE.types)) {
    const liveType = live[typeName];
    if (!liveType) {
      drifts.push({ type: "type_removed", typeName, severity: "BREAKING", detail: `type ${typeName} no longer exists in the live schema` });
      continue;
    }
    for (const field of Object.keys(base.fields)) {
      if (!(field in liveType)) {
        drifts.push({
          type: "field_removed", typeName, field, severity: "BREAKING",
          detail: `${typeName}.${field} was removed from the live Railway schema — affected capability must degrade, not misreport`,
        });
      } else if (liveType[field] && !base.fields[field]) {
        drifts.push({
          type: "field_deprecated", typeName, field, severity: "WARNING",
          detail: `${typeName}.${field} is now marked @deprecated in the live schema — migrate before sunset`,
        });
      }
    }
    for (const field of Object.keys(liveType)) {
      if (!(field in base.fields)) {
        drifts.push({
          type: "field_added", typeName, field, severity: "INFO",
          detail: `${typeName}.${field} is new in the live schema (additive, non-breaking)`,
        });
      }
    }
  }
  return drifts;
}

/** Does the current integration still work against the live schema? */
export function contractIsCompatible(drifts: ContractDrift[]): boolean {
  return !drifts.some((d) => d.severity === "BREAKING");
}
