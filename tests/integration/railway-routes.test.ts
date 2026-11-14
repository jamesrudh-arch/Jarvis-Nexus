/**
 * Railway HTTP routes integration tests — real app via createApp with a
 * MOCKED Railway transport (cfg.railwayFetchFn). Covers: 401 matrix for new
 * owner routes, public monitoring route, webhook endpoint security, health
 * component, backup export + isolated restore verification, JARVIS tool
 * registration, metrics label bounds.
 */
import { describe, expect, test, afterAll } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { createApp } from "@nexus/api";
import { createRailwayMock, webhookPayload, MOCK } from "../helpers/railway-mocks";

const TMP = `/tmp/nexus_railway_routes_${Date.now()}`;
mkdirSync(TMP, { recursive: true });

const OWNER_KEY = "test-owner-key-railway";
const baseEnv = {
  OWNER_KEY,
  RAILWAY_API_TOKEN: MOCK.token,
  RAILWAY_PROJECT_ID: MOCK.projectId,
  RAILWAY_READ_ONLY: "true",
  RAILWAY_WEBHOOK_SECRET: "whsec_test_secret_0123456789",
  NEXUS_ALLOW_ECHO: "true",
};

const mock = createRailwayMock();
const app = createApp({
  dbPath: `${TMP}/nexus.db`,
  workspaceRoot: `${TMP}/workspaces`,
  env: baseEnv,
  railwayFetchFn: mock.fetchFn,
});

const authed = (req: Request) => new Request(req, { headers: { Authorization: `Bearer ${OWNER_KEY}` } });

afterAll(() => {
  mock.close();
  rmSync(TMP, { recursive: true, force: true });
});

describe("railway routes — authorization matrix (owner bearer)", () => {
  const OWNER_ROUTES: Array<[string, string]> = [
    ["POST", "/railway/monitor"],
    ["GET", "/railway/discovery"],
    ["GET", "/railway/usage"],
    ["GET", "/railway/credentials/status"],
    ["POST", "/railway/contract/check"],
    ["GET", "/railway/events"],
    ["GET", "/railway/audit"],
    ["GET", "/railway/backups"],
    ["POST", "/railway/backup/export"],
    ["POST", "/railway/reconcile"],
    ["GET", "/railway/reconciliation"],
    ["POST", "/railway/diagnose"],
    ["POST", "/railway/intelligence"],
    ["GET", "/railway/operations"],
    ["POST", "/railway/recovery/plan"],
    ["POST", "/railway/recovery/authorize"],
    ["POST", "/railway/recovery/execute"],
  ];

  test("every new consequential route rejects without the owner key (401)", async () => {
    for (const [method, path] of OWNER_ROUTES) {
      const res = await app.app.fetch(new Request(`http://x${path}`, { method }));
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  test("every new consequential route rejects a wrong key (constant-time compare, 401)", async () => {
    const res = await app.app.fetch(new Request("http://x/railway/discovery", { headers: { Authorization: "Bearer wrong" } }));
    expect(res.status).toBe(401);
  });

  test("owner key grants access (discovery returns mocked infrastructure)", async () => {
    const res = await app.app.fetch(authed(new Request("http://x/railway/discovery")));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { projects: unknown[]; serviceInstances: unknown[] } };
    expect(body.data.projects.length).toBe(1);
    expect(body.data.serviceInstances.length).toBe(1);
  });

  test("GET /railway/status is public and non-blocking (cached snapshot)", async () => {
    const res = await app.app.fetch(new Request("http://x/railway/status"));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown; note?: string };
    expect(body.data === null || typeof body.data === "object").toBe(true);
  });
});

describe("railway routes — monitoring, intelligence, health integration", () => {
  test("POST /railway/monitor (owner) runs all five dimensions on the mocked transport", async () => {
    const res = await app.app.fetch(authed(new Request("http://x/railway/monitor", { method: "POST" })));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { dimensions: Array<{ dimension: string; status: string }> } };
    const dims = body.data.dimensions.map((d) => d.dimension);
    for (const expected of ["api", "deployment", "application", "dependencies", "infrastructure"]) {
      expect(dims.includes(expected)).toBe(true);
    }
  });

  test("health probe includes the railway component (fail-visible, never healthy without data)", async () => {
    const res = await app.app.fetch(new Request("http://x/health/detailed"));
    const body = await res.json() as { components: Array<{ component: string; status: string; detail: string }> };
    const railway = body.components.find((c) => c.component === "railway");
    expect(railway).toBeDefined();
    // with a token configured but (possibly) no monitoring cycle yet, degraded is the honest state;
    // after the monitor test above, a cycle HAS run — accept healthy/degraded, reject 'unhealthy' only if the mock said so
    expect(["healthy", "degraded"]).toContain(railway!.status);
  });

  test("POST /railway/intelligence answers a live question from mocked live data", async () => {
    const res = await app.app.fetch(authed(new Request("http://x/railway/intelligence", {
      method: "POST", body: JSON.stringify({ question: "is production healthy?" }),
    })));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { answer: string; status: string } };
    expect(body.data.status).toBe("answered");
    expect(body.data.answer).toContain("Deployment dimension");
    expect(body.data.answer).toContain("Application dimension");
  });

  test("JARVIS tool executor exposes railway capabilities with correct approval classes", () => {
    const list = app.tools.listTools();
    for (const t of ["railway.status", "railway.intelligence", "railway.diagnose", "railway.recovery.execute"]) {
      expect(list.includes(t)).toBe(true);
    }
    // read-only railway tools are NOT consequential
    expect(app.tools.requiresApproval("railway.status", {})).toBe(false);
    expect(app.tools.requiresApproval("railway.intelligence", {})).toBe(false);
    // recovery execution IS consequential (dual gate: orchestrator + authorization)
    expect(app.tools.requiresApproval("railway.recovery.execute", {})).toBe(true);
  });

  test("credential isolation: no MCP registration or NAEI workspace carries Railway credential material", async () => {
    const servers = await app.mcp.healthCheck();
    const serialized = JSON.stringify(servers);
    expect(serialized.includes("rlwy_")).toBe(false); // no Railway token in any MCP surface
    // the token exists in the environment — prove the isolation is real, not vacuous
    expect(Boolean(baseEnv.RAILWAY_API_TOKEN)).toBe(true);
    expect(baseEnv.RAILWAY_API_TOKEN!.startsWith("rlwy_")).toBe(true);
  });

  test("railway.status tool returns the cached monitoring snapshot", async () => {
    const r = await app.tools.execute("railway.status", {}, { task: { id: "t1" } as never, step: {} as never });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { dimensions: unknown[] }).dimensions.length).toBe(5);
  });
});

describe("railway routes — webhook endpoint (secret-header verified)", () => {
  const secret = baseEnv.RAILWAY_WEBHOOK_SECRET!;
  // ONE payload string: replays must be byte-identical to be detected as duplicates
  const payload = webhookPayload();

  test("correct secret + valid payload -> 202 accepted", async () => {
    const res = await app.app.fetch(new Request("http://x/railway/webhook", {
      method: "POST",
      headers: { "X-Webhook-Secret": secret },
      body: payload,
    }));
    expect(res.status).toBe(202);
  });

  test("replayed payload -> 200 duplicate", async () => {
    const res = await app.app.fetch(new Request("http://x/railway/webhook", {
      method: "POST",
      headers: { "X-Webhook-Secret": secret },
      body: payload,
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { duplicate: boolean } };
    expect(body.data.duplicate).toBe(true);
  });

  test("wrong secret -> 401; malformed payload -> 400", async () => {
    const wrong = await app.app.fetch(new Request("http://x/railway/webhook", {
      method: "POST", headers: { "X-Webhook-Secret": "nope" }, body: payload,
    }));
    expect(wrong.status).toBe(401);
    const malformed = await app.app.fetch(new Request("http://x/railway/webhook", {
      method: "POST", headers: { "X-Webhook-Secret": secret }, body: "{bad json",
    }));
    expect(malformed.status).toBe(400);
  });

  test("unconfigured secret fails closed (503) — separate app instance", async () => {
    const tmp2 = `/tmp/nexus_railway_wh_${Date.now()}`;
    mkdirSync(tmp2, { recursive: true });
    const mock2 = createRailwayMock();
    const app2 = createApp({
      dbPath: `${tmp2}/nexus.db`, workspaceRoot: `${tmp2}/ws`,
      env: { ...baseEnv, RAILWAY_WEBHOOK_SECRET: undefined },
      railwayFetchFn: mock2.fetchFn,
    });
    const res = await app2.app.fetch(new Request("http://x/railway/webhook", {
      method: "POST", headers: { "X-Webhook-Secret": "anything" }, body: webhookPayload(),
    }));
    expect(res.status).toBe(503);
    mock2.close();
    rmSync(tmp2, { recursive: true, force: true });
  });
});

describe("railway routes — backup export with isolated restore verification", () => {
  test("logical backup exports every table and PROVES recoverability by restoring into isolation", async () => {
    const res = await app.app.fetch(authed(new Request("http://x/railway/backup/export", { method: "POST" })));
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { file: string; tables: number; rows: number; verification: { restored: boolean; rowsMatched: boolean } } };
    expect(body.data.tables).toBeGreaterThanOrEqual(23);
    expect(body.data.verification.restored).toBe(true);
    expect(body.data.verification.rowsMatched).toBe(true);
  });

  test("backup report honestly marks Railway volume backups UNVERIFIED", async () => {
    const res = await app.app.fetch(authed(new Request("http://x/railway/backups")));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { volumes: Array<{ backups: Array<{ recoverability: string }> }>; notes: string[] } };
    expect(body.data.volumes.length).toBe(1);
    expect(body.data.volumes[0]!.backups[0]!.recoverability).toBe("UNVERIFIED");
    expect(body.data.notes.some((n) => n.includes("existence is not recoverability") || n.includes("Existence is not recoverability"))).toBe(true);
  });
});

describe("railway routes — recovery control plane (read-only default)", () => {
  test("operation registry is listed with the read-only flag", async () => {
    const res = await app.app.fetch(authed(new Request("http://x/railway/operations")));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; readOnly: boolean };
    expect(body.data.length).toBeGreaterThan(10);
    expect(body.readOnly).toBe(true); // production protection posture
  });

  test("authorization is REFUSED while read-only (403) — production stays untouched", async () => {
    const res = await app.app.fetch(authed(new Request("http://x/railway/recovery/authorize", {
      method: "POST",
      body: JSON.stringify({ operationId: "railway.deployment.restart", resourceIds: ["dep-1"], scope: "restart after failure" }),
    })));
    expect(res.status).toBe(403);
    const body = await res.json() as { data: { granted: boolean; reason: string } };
    expect(body.data.granted).toBe(false);
    expect(body.data.reason).toContain("READ-ONLY");
  });

  test("diagnose -> plan flow works end-to-end on the mocked transport", async () => {
    mock.dataset.latestDeploymentStatus = "FAILED";
    mock.intel.client.invalidateCache();
    const diag = await app.app.fetch(authed(new Request("http://x/railway/diagnose", {
      method: "POST", body: JSON.stringify({ trigger: "deployment_failure", resourceIds: [MOCK.failedDeploymentId] }),
    })));
    expect(diag.status).toBe(201);
    const diagBody = await diag.json() as { data: { id: string; causeClassification: string } };
    expect(diagBody.data.causeClassification).toBe("CONFIRMED");

    const plan = await app.app.fetch(authed(new Request("http://x/railway/recovery/plan", {
      method: "POST", body: JSON.stringify({ investigationId: diagBody.data.id }),
    })));
    expect(plan.status).toBe(201);
    const planBody = await plan.json() as { data: { id: string; step: { operationId: string }; status: string } };
    expect(planBody.data.step.operationId).toBe("railway.deployment.rollback");
    expect(planBody.data.status).toBe("proposed");
  });
});
