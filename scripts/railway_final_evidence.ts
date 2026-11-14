/**
 * Final live evidence collection (READ-ONLY against production Railway).
 * Closes the last live-verification gaps: deployment detail/logs/events
 * queries (diagnostics evidence sources) and a real reconciliation cycle.
 * Saves the evidence bundle to data/railway/final_evidence.json.
 * Usage: bun scripts/railway_final_evidence.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { RailwayIntel, RailwayClient, CredentialManager, queries } from "@nexus/railway";
const { Q_DEPLOYMENT_DETAIL, Q_DEPLOYMENT_LOGS, Q_DEPLOYMENT_EVENTS } = queries;
import { NexusDb, migrate } from "@nexus/db";

const db = NexusDb.open(":memory:");
migrate(db);
const intel = new RailwayIntel({ db, env: { ...process.env, RAILWAY_READ_ONLY: "true" } as Record<string, string | undefined> });
const evidence: Record<string, unknown> = { capturedAt: new Date().toISOString(), mode: "READ-ONLY live verification" };

// 1. discovery snapshot
const snap = await intel.discovery.discoverAll();
if (!snap.ok) { console.error("discovery failed:", snap.error.toJSON()); process.exit(1); }
const si = snap.value.serviceInstances[0];
const latest = si?.latestDeployment;
evidence.discovery = {
  project: snap.value.projects[0]?.name,
  environment: snap.value.environments[0]?.name,
  serviceInstance: si?.serviceName,
  latestDeployment: latest ? { id: latest.id, status: latest.status, createdAt: latest.createdAt } : null,
  domains: si?.domains.map((d) => `${d.kind}:${d.domain}(${d.status})`),
  volumes: snap.value.volumes.map((v) => ({ id: v.id, state: v.state, sizeMB: v.sizeMB, currentSizeMB: v.currentSizeMB, mountPath: v.mountPath })),
  volumeBackups: snap.value.volumeBackups.length,
  classifications: snap.value.classifications,
  recentEvents: snap.value.recentEvents.length,
  platformStatus: snap.value.platformStatus,
};

// 2. monitoring cycle (all five dimensions against real infrastructure)
const monitoring = await intel.runMonitoringCycle();
evidence.monitoring = monitoring
  ? { overall: monitoring.overall, dimensions: monitoring.dimensions.map((d) => ({ dimension: d.dimension, status: d.status, detail: d.detail.slice(0, 200) })) }
  : null;

// 3. diagnostics evidence sources LIVE: deployment detail + logs + lifecycle events
if (latest) {
  const plain = new RailwayClient({ credentials: new CredentialManager({ RAILWAY_API_TOKEN: process.env.RAILWAY_API_TOKEN! }), fetchFn: fetch, sleepFn: async () => {} });
  const detail = await plain.request<{ deployment: { id: string; status: string; serviceId: string | null } }>(Q_DEPLOYMENT_DETAIL, { deploymentId: latest.id }, { critical: true });
  const logs = await plain.request<{ deploymentLogs: Array<{ message: string; severity?: string }> }>(Q_DEPLOYMENT_LOGS, { deploymentId: latest.id, limit: 5 }, { critical: true });
  const events = await plain.request<{ deploymentEvents: { edges: Array<{ node: { step: string; createdAt: string } }> } }>(Q_DEPLOYMENT_EVENTS, { deploymentId: latest.id, first: 10 }, { critical: true });
  evidence.diagnosticsSources = {
    deploymentDetail: detail.ok ? { status: detail.value.data.deployment.status } : detail.error.toJSON(),
    deploymentLogs: logs.ok ? { count: logs.value.data.deploymentLogs.length, sample: logs.value.data.deploymentLogs.slice(0, 2).map((l) => l.message.slice(0, 120)) } : logs.error.toJSON(),
    deploymentEvents: events.ok ? { steps: events.value.data.deploymentEvents.edges.map((e) => e.node.step) } : events.error.toJSON(),
  };
}

// 4. live reconciliation cycle: persist snapshot, re-discover, compare
intel.reconciliation.persistSnapshot(snap.value);
intel.client.invalidateCache();
const recon = await intel.reconciliation.reconcile();
evidence.reconciliation = recon.ok
  ? { discrepancies: recon.value.discrepancies.length, kinds: recon.value.discrepancies.map((d) => d.kind), summary: recon.value.summary }
  : recon.error.toJSON();

// 5. usage snapshot
const usage = await intel.usage.report(snap.value);
evidence.usage = usage.ok
  ? { measured: usage.value.measured, estimated: usage.value.estimated, anomalies: usage.value.anomalies.length }
  : usage.error.toJSON();

// 6. audit chain verification on the (in-memory) store
evidence.auditChain = intel.audit.verify();

mkdirSync("data/railway", { recursive: true });
writeFileSync("data/railway/final_evidence.json", JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2).slice(0, 3500));
db.close();
