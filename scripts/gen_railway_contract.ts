/**
 * Generates the committed Railway API contract artifact
 * (packages/railway/contract/expected-fields.json) from the LIVE schema
 * snapshot captured on 2026-11-15. Zero API requests — offline derivation.
 *
 * The artifact is the versioned contract baseline used by:
 *  - unit contract tests (queries may only depend on fields present here)
 *  - live drift detection (field removed / deprecated / added vs this file)
 * Usage: bun scripts/gen_railway_contract.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const snap = JSON.parse(readFileSync("data/railway/schema_full_snapshot.json", "utf8"));
const types: any[] = snap.schema.types;
const byName = new Map(types.map((t) => [t.name, t]));

const OBJECT_TYPES = [
  "Query", "Mutation",
  "Project", "Environment", "ServiceInstance", "Deployment", "DeploymentCreator",
  "AllDomains", "ServiceDomain", "CustomDomain", "CustomDomainStatus", "VolumeInstance", "VolumeInstanceBackup",
  "VolumeInstanceBackupSchedule", "PlatformStatus", "Incident", "Maintenance",
  "Event", "AuditLog", "AggregatedUsage", "EstimatedUsage", "Log", "DeploymentEvent",
  "Workspace", "PageInfo",
  "QueryProjectsConnection", "ProjectEnvironmentsConnection",
  "EnvironmentServiceInstancesConnection", "EnvironmentDeploymentsConnection",
  "EnvironmentVolumeInstancesConnection", "QueryEventsConnection",
  "QueryAuditLogsConnection", "QueryDeploymentEventsConnection",
  "QueryProjectsConnectionEdge", "ProjectEnvironmentsConnectionEdge",
  "EnvironmentServiceInstancesConnectionEdge", "EnvironmentDeploymentsConnectionEdge",
  "EnvironmentVolumeInstancesConnectionEdge", "QueryEventsConnectionEdge",
  "QueryAuditLogsConnectionEdge", "QueryDeploymentEventsConnectionEdge",
];

const ENUM_TYPES = [
  "DeploymentStatus", "VolumeState", "EventSeverity", "IncidentStatus", "MaintenanceStatus",
  "MetricMeasurement", "CustomDomainStatus", "ServiceDomainSyncStatus", "RestartPolicyType",
  "Builder", "Plan", "DeploymentInstanceStatus",
];

const out: any = {
  capturedAt: snap.capturedAt,
  endpoint: snap.endpoint,
  note: "Machine-generated from live introspection. Queries in packages/railway/src/queries.ts may only depend on these fields; drift detection compares live schema against this baseline.",
  types: {} as Record<string, { fields: Record<string, boolean> }>,
  enums: {} as Record<string, string[]>,
};

for (const name of OBJECT_TYPES) {
  const t = byName.get(name);
  if (!t) { console.error(`MISSING TYPE: ${name}`); continue; }
  const fields: Record<string, boolean> = {};
  for (const f of t.fields ?? []) fields[f.name] = Boolean(f.isDeprecated);
  out.types[name] = { fields };
}

for (const name of ENUM_TYPES) {
  const t = byName.get(name);
  if (!t) { console.error(`MISSING ENUM: ${name}`); continue; }
  out.enums[name] = (t.enumValues ?? []).map((v: any) => v.name);
}

// Fields our integration actually uses on Query/Mutation (for tight contract tests).
const query = byName.get("Query");
const mutation = byName.get("Mutation");
out.usedQueryFields = (query?.fields ?? []).filter((f: any) => [
  "projects", "workspace", "platformStatus", "project", "environment", "deployment",
  "deploymentLogs", "buildLogs", "deploymentEvents", "volumeInstance", "volumeInstanceBackupList",
  "volumeInstanceBackupScheduleList", "events", "auditLogs", "estimatedUsage",
  "workspaceUsageTotals", "usage",
].includes(f.name)).map((f: any) => f.name);
out.usedMutationFields = (mutation?.fields ?? []).filter((f: any) => [
  "deploymentRestart", "deploymentRedeploy", "deploymentRollback", "deploymentStop",
  "deploymentCancel", "deploymentApprove", "deploymentRemove",
  "serviceInstanceRedeploy", "serviceInstanceDeploy",
  "volumeInstanceBackupCreate", "volumeInstanceBackupRestore",
].includes(f.name)).map((f: any) => f.name);

writeFileSync("packages/railway/contract/expected-fields.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify({
  written: "packages/railway/contract/expected-fields.json",
  objectTypes: Object.keys(out.types).length,
  enums: Object.keys(out.enums).length,
  usedQueryFields: out.usedQueryFields.length,
  usedMutationFields: out.usedMutationFields.length,
  backupScheduleFields: Object.keys(out.types["VolumeInstanceBackupSchedule"]?.fields ?? {}),
}, null, 2));
