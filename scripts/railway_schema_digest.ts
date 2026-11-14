/**
 * Offline digest of the captured Railway schema snapshot (zero API requests).
 * Prints exact field shapes for the types the Railway intelligence package needs.
 * Usage: bun scripts/railway_schema_digest.ts
 */
import { readFileSync } from "node:fs";

const snap = JSON.parse(readFileSync("data/railway/schema_full_snapshot.json", "utf8"));
const types: any[] = snap.schema.types;
const byName = new Map(types.map((t) => [t.name, t]));

function typeRef(t: any): string {
  if (!t) return "?";
  if (t.kind === "NON_NULL" || t.kind === "LIST") return `${t.kind === "NON_NULL" ? "!" : "[]"}${typeRef(t.ofType)}`;
  return t.name ?? t.kind;
}
function fieldSig(f: any): string {
  const args = (f.args ?? []).map((a: any) => `${a.name}:${typeRef(a.type)}`).join(", ");
  return `${f.name}${args ? `(${args})` : ""}: ${typeRef(f.type)}${f.isDeprecated ? ` [DEPRECATED: ${String(f.deprecationReason).slice(0, 60)}]` : ""}`;
}
function showType(name: string, fieldFilter?: (f: any) => boolean) {
  const t = byName.get(name);
  if (!t) { console.log(`\n=== ${name}: NOT FOUND ===`); return; }
  console.log(`\n=== ${name} (${t.kind}) ===`);
  const fields = (t.fields ?? []).filter((f: any) => !fieldFilter || fieldFilter(f));
  for (const f of fields) console.log(`  ${fieldSig(f)}`);
  if (t.enumValues?.length) console.log(`  enum: ${t.enumValues.map((v: any) => v.name).join(" | ")}`);
  if (t.inputFields?.length) { console.log("  inputFields:"); for (const f of t.inputFields) console.log(`    ${f.name}: ${typeRef(f.type)}`); }
}

// --- Query entry points and their argument shapes
const q = byName.get("Query");
console.log("### QUERY ENTRY POINTS OF INTEREST");
for (const f of q?.fields ?? []) {
  if (["projects", "project", "projectsByIds", "workspace", "environments", "environment", "deployments", "deployment", "deploymentEvents", "deploymentLogs", "buildLogs", "service", "serviceInstance", "domains", "customDomain", "railwayDomain", "variables", "metrics", "httpMetrics", "estimatedUsage", "usage", "workspaceUsageTotals", "projectServiceUsage", "events", "auditLogs", "volumeInstance", "volumeInstanceBackupList", "volumeInstanceBackupScheduleList", "platformStatus", "notificationRules", "me", "apiTokens"].includes(f.name)) {
    console.log(`  ${fieldSig(f)}`);
  }
}

// --- Mutation surface for the operation registry (recovery actions)
const m = byName.get("Mutation");
console.log("\n### MUTATIONS OF INTEREST (for L3/L4 operation registry — NOT to be executed)");
const KEYWORDS = ["deploy", "restart", "remove", "delete", "update", "create", "variable", "domain", "volume", "backup", "restore", "redeploy", "rollback", "cancel", "stop", "start", "scale", "upsert"];
for (const f of m?.fields ?? []) {
  const n = f.name.toLowerCase();
  if (KEYWORDS.some((k) => n.includes(k))) console.log(`  ${fieldSig(f)}`);
}

// --- Core entity types
for (const name of ["Project", "Environment", "Service", "ServiceInstance", "Deployment", "DeploymentCollection", "Workspace", "VolumeInstance", "VolumeInstanceBackup", "PlatformStatus", "Event", "AuditLog", "CustomDomain", "RailwayDomain", "ServiceInstanceUsage", "EstimatedUsage", "UsageMetric", "MetricsResponse"]) {
  showType(name);
}

// --- Connection/pagination shapes
console.log("\n### PAGINATION SHAPES");
for (const name of ["QueryProjectsConnection", "QueryProjectsConnectionEdge", "ProjectServicesConnection", "ProjectEnvironmentsConnection", "EnvironmentDeploymentsConnection"]) {
  showType(name);
}

// --- Status enums
console.log("\n### STATUS ENUMS");
for (const name of types.filter((t) => t.kind === "ENUM" && /status|state|severity|health/i.test(t.name)).map((t) => t.name)) {
  showType(name);
}
