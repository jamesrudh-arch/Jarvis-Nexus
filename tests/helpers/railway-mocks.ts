/**
 * Railway test mocks — MOCKED transport, clearly labelled. No test using this
 * helper ever touches the network. Shapes mirror the verified live schema
 * (contract/expected-fields.json). Live verification lives exclusively in
 * tests/integration/railway-live.test.ts (credential-gated).
 */
import { NexusDb, migrate } from "@nexus/db";
import { RailwayIntel } from "@nexus/railway";
import baselineJson from "../../packages/railway/contract/expected-fields.json";

const BASELINE = baselineJson as unknown as {
  types: Record<string, { fields: Record<string, boolean> }>;
};

export const MOCK = {
  token: "rlwy_wksp_mocktoken_mocktoken_mocktoken1234",
  projectId: "proj-1",
  environmentId: "env-1",
  serviceId: "svc-1",
  domain: "jarvis-nexus-production.up.railway.app",
  failedDeploymentId: "dep-2",
  okDeploymentId: "dep-1",
} as const;

export interface MockDataset {
  latestDeploymentStatus?: string;
  latestCanRollback?: boolean;
  latestCanRedeploy?: boolean;
  historyStatuses?: string[];
  appHealthStatus?: number;       // HTTP status the mock app endpoint returns
  appHealthUnreachable?: boolean; // simulate unreachable app
  volumeCurrentSizeMB?: number;
  estimatedDiskGb?: number;
  events?: Array<{ id: string; action: string; object: string; severity: string; createdAt: string }>;
  mutationsExecuted?: Array<{ query: string; variables: Record<string, unknown> }>;
}

export interface RailwayMock {
  fetchFn: typeof fetch;
  intel: RailwayIntel;
  db: NexusDb;
  dataset: MockDataset;
  requests: Array<{ url: string; query?: string; variables?: Record<string, unknown> }>;
  close(): void;
}

const NOW = "2026-11-15T12:00:00.000Z";

function baseDataset(overrides: MockDataset = {}): MockDataset {
  return {
    latestDeploymentStatus: "SUCCESS",
    latestCanRollback: true,
    latestCanRedeploy: true,
    historyStatuses: ["SUCCESS", "FAILED"],
    appHealthStatus: 200,
    volumeCurrentSizeMB: 200,
    estimatedDiskGb: 0.4,
    events: [{ id: "evt-1", action: "deployment.create", object: "Deployment", severity: "INFO", createdAt: NOW }],
    ...overrides,
  };
}

/** Build a full RailwayIntel wired to a MOCKED fetch (no network). */
export function createRailwayMock(opts: {
  dataset?: MockDataset;
  env?: Record<string, string | undefined>;
  readOnly?: boolean;
} = {}): RailwayMock {
  const db = NexusDb.open(":memory:");
  migrate(db);
  const dataset = baseDataset(opts.dataset);
  const requests: RailwayMock["requests"] = [];

  const fetchFn = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    const method = init?.method ?? "GET";

    // ---- app health checks (GET to any known app domain) ----------------------
    if (method === "GET" && (url.includes(MOCK.domain) || url.includes("custom.example.com"))) {
      requests.push({ url });
      if (dataset.appHealthUnreachable) throw new Error("connect ECONNREFUSED (mock)");
      return new Response(JSON.stringify({
        overall: dataset.appHealthStatus === 200 ? "healthy" : "unhealthy",
        components: [{ component: "database", status: "healthy" }, { component: "railway", status: "degraded" }],
      }), { status: dataset.appHealthStatus ?? 200, headers: { "content-type": "application/json" } });
    }

    // ---- GraphQL API (POST to backboard) --------------------------------------
    const query: string = init?.body ? (JSON.parse(String(init.body)).query as string) : "";
    const variables: Record<string, unknown> | undefined = init?.body ? JSON.parse(String(init.body)).variables : undefined;
    requests.push({ url, query, variables });

    const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json", "x-ratelimit-remaining": "900", ...headers } });

    // mutations — recorded, never actually executed against anything real.
    // After a rollback/redeploy/restart the service transitions (simulated
    // post-mutation state: QUEUED, mirroring real Railway behaviour).
    if (query.trimStart().startsWith("mutation")) {
      (dataset.mutationsExecuted ??= []).push({ query, variables: variables ?? {} });
      if (query.includes("deploymentRestart") || query.includes("deploymentRedeploy") || query.includes("deploymentRollback")) {
        dataset.latestDeploymentStatus = "QUEUED";
      }
      if (query.includes("deploymentRestart")) return json({ deploymentRestart: true });
      if (query.includes("deploymentRedeploy")) return json({ deploymentRedeploy: { id: "dep-new", status: "QUEUED" } });
      if (query.includes("deploymentRollback")) return json({ deploymentRollback: true });
      return json({ result: true });
    }

    if (query.includes("__type") || query.includes("__schema")) {
      // introspection contract check against mock: baseline-shaped fields
      const data: Record<string, unknown> = {};
      const entries = Object.entries(BASELINE.types);
      data["q"] = { fields: Object.keys(entries.find(([n]) => n === "Query")![1].fields).map((f) => ({ name: f, isDeprecated: false })) };
      data["m"] = { fields: Object.keys(entries.find(([n]) => n === "Mutation")![1].fields).map((f) => ({ name: f, isDeprecated: false })) };
      let i = 0;
      for (const [typeName, spec] of entries) {
        if (typeName === "Query" || typeName === "Mutation") continue;
        data[`t${i++}`] = { fields: Object.keys(spec.fields).map((f) => ({ name: f, isDeprecated: false })) };
      }
      return json(data);
    }
    if (query.includes("platformStatus")) return json({ platformStatus: { isStable: true, incident: null, maintenance: null } });
    if (query.includes("workspace(workspaceId")) return json({ workspace: { id: "ws-1", name: "jarvis-workspace", plan: "HOBBY", projectCount: 1, createdAt: NOW } });
    if (query.includes("projects(first")) return json({ projects: { edges: [{ node: { id: MOCK.projectId, name: "reasonable-heart", description: null, createdAt: NOW, updatedAt: NOW, workspaceId: "ws-1", isPublic: false, baseEnvironmentId: MOCK.environmentId } }] } });
    if (query.includes("environments(first")) return json({ project: { id: MOCK.projectId, name: "reasonable-heart", environments: { edges: [{ node: { id: MOCK.environmentId, name: "production", isEphemeral: false, createdAt: NOW, updatedAt: NOW } }] } } });
    if (query.includes("serviceInstances(first")) return json({ environment: { id: MOCK.environmentId, name: "production", serviceInstances: { edges: [{ node: {
      id: "si-1", serviceId: MOCK.serviceId, serviceName: "nexus-api", environmentId: MOCK.environmentId,
      region: "us-west1", healthcheckPath: "/health", restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 5,
      numReplicas: 1, hasEverDeployed: true, sleepApplication: false, builder: "DOCKERFILE",
      latestDeployment: {
        id: dataset.latestDeploymentStatus === "FAILED" ? MOCK.failedDeploymentId : MOCK.okDeploymentId,
        status: dataset.latestDeploymentStatus ?? "SUCCESS",
        createdAt: NOW, updatedAt: NOW, statusUpdatedAt: NOW, staticUrl: `https://${MOCK.domain}`,
        serviceId: MOCK.serviceId, environmentId: MOCK.environmentId, projectId: MOCK.projectId,
        canRedeploy: dataset.latestCanRedeploy ?? true, canRollback: dataset.latestCanRollback ?? true,
        deploymentStopped: false, meta: null, creator: { email: "owner@example.com", name: "Owner" },
      },
      domains: {
        serviceDomains: [{ id: "d-1", domain: MOCK.domain, suffix: "up.railway.app", syncStatus: "ACTIVE", targetPort: 3000 }],
        customDomains: [{ id: "cd-1", domain: "custom.example.com", status: { verified: true, certificateStatus: "CERTIFICATE_STATUS_TYPE_VALID" } }],
      },
    } }] } } });
    if (query.includes("deployments(first")) return json({ environment: { deployments: { edges: (dataset.historyStatuses ?? []).map((status, i) => ({ node: {
      id: status === "FAILED" ? MOCK.failedDeploymentId : `dep-${i + 1}`,
      status, createdAt: NOW, updatedAt: NOW, statusUpdatedAt: NOW,
      serviceId: MOCK.serviceId, environmentId: MOCK.environmentId, projectId: MOCK.projectId,
      staticUrl: `https://${MOCK.domain}`, canRedeploy: true, canRollback: status === "FAILED", deploymentStopped: false, meta: null,
      creator: { email: "owner@example.com", name: "Owner" },
    } })) } } });
    if (query.includes("volumeInstances(first")) return json({ environment: { volumeInstances: { edges: [{ node: {
      id: "volinst-1", volumeId: "vol-1", serviceId: MOCK.serviceId, environmentId: MOCK.environmentId,
      sizeMB: 512, currentSizeMB: dataset.volumeCurrentSizeMB ?? 200, mountPath: "/data",
      state: "READY", region: "us-west1", createdAt: NOW,
    } }] } } });
    if (query.includes("volumeInstanceBackupList")) return json({ volumeInstanceBackupList: [{ id: "bk-1", name: "daily", createdAt: NOW, expiresAt: NOW, usedMB: 200, referencedMB: 150, volumeInstanceSizeMB: 512 }] });
    if (query.includes("volumeInstanceBackupScheduleList")) return json({ volumeInstanceBackupScheduleList: [{ id: "sch-1", name: "daily", kind: "DAILY", cron: "0 0 * * *", retentionSeconds: 604800, createdAt: NOW }] });
    if (query.includes("events(projectId")) return json({ events: { edges: (dataset.events ?? []).map((e) => ({ node: { ...e, payload: null, projectId: MOCK.projectId, environmentId: MOCK.environmentId } })) } });
    if (query.includes("auditLogs(")) return json({ auditLogs: { edges: [{ node: { id: "al-1", eventType: "deployment.create", createdAt: NOW, projectId: MOCK.projectId, environmentId: MOCK.environmentId, workspaceId: "ws-1" } }] } });
    if (query.includes("estimatedUsage")) return json({ estimatedUsage: [
      { estimatedValue: 2.5, measurement: "CPU_USAGE", projectId: MOCK.projectId },
      { estimatedValue: dataset.estimatedDiskGb ?? 0.4, measurement: "DISK_USAGE_GB", projectId: MOCK.projectId },
    ] });
    if (query.includes("workspaceUsageTotals")) return json({ workspaceUsageTotals: [{ measurement: "CPU_USAGE", value: 2.1 }, { measurement: "DISK_USAGE_GB", value: 0.35 }] });
    if (query.includes("deploymentLogs")) return json({ deploymentLogs: [
      { message: "step 1/4: installing", severity: "info", timestamp: NOW },
      { message: "error: build failed — exit code 1", severity: "error", timestamp: NOW },
    ] });
    if (query.includes("buildLogs")) return json({ buildLogs: [{ message: "docker build ok", severity: "info", timestamp: NOW }] });
    if (query.includes("deploymentEvents")) return json({ deploymentEvents: { edges: [{ node: { id: "de-1", step: "BUILD", createdAt: NOW, completedAt: null } }] } });
    if (query.includes("deployment(id:")) {
      const id = (variables as any)?.deploymentId ?? MOCK.okDeploymentId;
      return json({ deployment: {
        id, status: dataset.latestDeploymentStatus ?? "SUCCESS", createdAt: NOW, updatedAt: NOW, statusUpdatedAt: NOW,
        serviceId: MOCK.serviceId, environmentId: MOCK.environmentId, projectId: MOCK.projectId,
        staticUrl: `https://${MOCK.domain}`, url: `https://${MOCK.domain}`, canRedeploy: true, canRollback: true,
        deploymentStopped: false, meta: null, creator: { email: "owner@example.com", name: "Owner" },
      } });
    }
    return json({}, 400); // unknown query -> contract-style error
  }) as unknown as typeof fetch;

  const intel = new RailwayIntel({
    db,
    env: {
      RAILWAY_API_TOKEN: MOCK.token,
      RAILWAY_PROJECT_ID: MOCK.projectId,
      RAILWAY_READ_ONLY: String(opts.readOnly ?? true),
      RAILWAY_CACHE_TTL_MS: "50",
      ...opts.env,
    },
    fetchFn,
  });

  return { fetchFn, intel, db, dataset, requests, close: () => db.close() };
}

export function webhookPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "Deployment.failed",
    details: { id: MOCK.failedDeploymentId, source: "GitHub", status: "FAILED", branch: "main", commitHash: "abc123", commitAuthor: "Owner", commitMessage: "test" },
    resource: {
      workspace: { id: "ws-1", name: "jarvis-workspace" },
      project: { id: MOCK.projectId, name: "reasonable-heart" },
      environment: { id: MOCK.environmentId, name: "production", isEphemeral: false },
      service: { id: MOCK.serviceId, name: "nexus-api" },
      deployment: { id: MOCK.failedDeploymentId },
    },
    severity: "WARNING",
    // default: real current time so receivers running on the real clock accept it;
    // fixed-clock unit tests pass an explicit timestamp override
    timestamp: new Date().toISOString(),
    ...overrides,
  });
}
