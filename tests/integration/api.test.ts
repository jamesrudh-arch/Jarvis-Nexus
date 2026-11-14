import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { createApp } from "@nexus/api";
import { NexusDb, migrate } from "@nexus/db";

/**
 * Integration tests: real subsystem wiring through the HTTP app, including
 * the MCP gateway against the bundled stdio test server (directive §4.4).
 *
 * The owner key is injected deterministically (env-independent): this suite
 * must run green in CI where OWNER_KEY is absent. The app under test gets a
 * known test key and the authenticated requests use it — a wiring fix, not a
 * weakened assertion: the 401-without-key cases are asserted separately.
 */
const TMP = `/tmp/nexus_it_${Date.now()}`;
mkdirSync(TMP, { recursive: true });

const TEST_OWNER_KEY = process.env.OWNER_KEY ?? "integration-test-owner-key";

let app: ReturnType<typeof createApp>;
let port: number;
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  app = createApp({
    dbPath: `${TMP}/nexus.db`,
    workspaceRoot: `${TMP}/workspaces`,
    env: { ...process.env, OWNER_KEY: TEST_OWNER_KEY } as Record<string, string>,
  });
  port = 3900 + Math.floor(Math.random() * 100);
  server = Bun.serve({ port, fetch: app.app.fetch });
});

afterAll(() => {
  server.stop(true);
  app.db.close();
  rmSync(TMP, { recursive: true, force: true });
});

const base = () => `http://localhost:${port}`;
const json = async (r: Response): Promise<any> => await r.json(); // eslint-disable-line @typescript-eslint/no-explicit-any
const ownerHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${TEST_OWNER_KEY}` };

describe("API foundation", () => {
  test("root contract", async () => {
    const r = await json(await fetch(base()));
    expect(r.service).toBe("NEXUS API");
    expect(r.contractVersion).toBe("1.0.0");
    expect(r.subsystems).toContain("jarvis");
  });

  test("health reports all components", async () => {
    const r = await json(await fetch(base() + "/health/detailed"));
    expect(["healthy", "degraded", "unhealthy"]).toContain(r.overall);
    const names = r.components.map((c: { component: string }) => c.component);
    for (const expected of ["database", "model_fabric", "mcp_gateway", "world_simulation", "naei"]) {
      expect(names).toContain(expected);
    }
  });

  test("unauthenticated consequential routes are rejected (all of them)", async () => {
    const cases: Array<[string, string, unknown]> = [
      ["POST", "/world/advance", { ticks: 10 }],
      ["POST", "/jarvis/objectives", { objective: "x" }],
      ["POST", "/naei/tasks", { requirement: "x", acceptanceCriteria: ["y"] }],
      ["POST", "/mcp/invoke", { serverName: "io.nexus.test-tools", toolName: "echo", args: { message: "x" } }],
      ["POST", "/world/snapshot", null],
      ["POST", "/world/construct", { request: "park" }],
      ["POST", "/mcp/register", { name: "io.x.y" }],
      ["GET", "/mcp/audit", null],
      ["GET", "/memory/jarvis", null],
      ["POST", "/memory", { scope: "x", title: "t", tier: "semantic", kind: "fact", content: "c", importance: 0.5, confidence: 0.8 }],
      ["POST", "/memory/jarvis/consolidate", null],
      ["POST", "/jarvis/tasks/some-id/approve", null],
      ["POST", "/naei/execute", null],
      ["POST", "/naei/tasks/some-id/approve", null],
      ["POST", "/naei/tasks/some-id/commit", null],
    ];
    const failures: string[] = [];
    for (const [method, path, body] of cases) {
      const r = await fetch(base() + path, {
        method,
        headers: body === null ? undefined : { "Content-Type": "application/json" },
        body: body === null ? undefined : JSON.stringify(body),
      });
      if (r.status !== 401) failures.push(`${method} ${path} -> ${r.status} (expected 401)`);
    }
    expect(failures).toEqual([]);
  });

  test("wrong owner key is rejected; the key never authenticates via query string", async () => {
    const wrong = await fetch(base() + "/world/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer defintely-not-the-key" },
      body: "{}",
    });
    expect(wrong.status).toBe(401);
    const viaQuery = await fetch(base() + `/world/advance?key=${encodeURIComponent(TEST_OWNER_KEY)}`, {
      method: "POST",
      body: "{}",
    });
    expect(viaQuery.status).toBe(401); // header-only auth: tokens must not travel in URLs
  });
});

describe("MCP gateway — integration acceptance (directive §4.4)", () => {
  test("server starts, connects, tools discovered", async () => {
    const r = await fetch(base() + "/mcp/servers/io.nexus.test-tools/tools");
    expect(r.status).toBe(200);
    const body = await json(r);
    const tools = body.data as Array<{ toolName: string }>;
    expect(tools.map((t) => t.toolName)).toEqual(["echo", "add", "world_status"]);
  });

  test("real operation succeeds end-to-end (echo tool, owner-authenticated)", async () => {
    const r = await fetch(base() + "/mcp/invoke", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ serverName: "io.nexus.test-tools", toolName: "echo", args: { message: "nexus-fabric-check" } }),
    });
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.data.ok).toBe(true);
    expect(body.data.result).toBe("echo:nexus-fabric-check");
    expect(body.data.durationMs).toBeGreaterThan(0);
  });

  test("schema validation rejects missing required args", async () => {
    const r = await fetch(base() + "/mcp/invoke", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ serverName: "io.nexus.test-tools", toolName: "add", args: { a: 1 } }),
    });
    expect(r.status).toBe(400);
    const body = await json(r);
    expect(body.error).toContain("missing required args");
  });

  test("audit trail records invocations (owner-visible)", async () => {
    const r = await json(await fetch(base() + "/mcp/audit?limit=10", { headers: { Authorization: `Bearer ${TEST_OWNER_KEY}` } }));
    const entries = r.data as Array<{ serverName: string; toolName: string; outcome: string }>;
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.some((e) => e.outcome === "rejected")).toBe(true);
    expect(entries.some((e) => e.outcome === "success")).toBe(true);
  });
});

describe("NEXUS WORLD via API", () => {
  test("world state is live with bootstrap civilisation", async () => {
    const r = await json(await fetch(base() + "/world/state"));
    expect(r.data.world.name).toBe("NEXUS Prime");
    expect(r.data.residents).toBeGreaterThan(0);
    expect(r.data.properties).toBeGreaterThan(0);
    expect(r.data.economy.total).toBeGreaterThan(0);
  });

  test("simulation advance ticks and generates history (owner auth)", async () => {
    const before = await json(await fetch(base() + "/world/state"));
    const r = await fetch(base() + "/world/advance", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ ticks: 70 }), // 70 x 10min = ~11.7 sim-hours: crosses 09:00 salary run
    });
    expect(r.status).toBe(200);
    const report = await json(r);
    expect(report.data.simTimeAfter).toBeGreaterThan(report.data.simTimeBefore);
    const after = await json(await fetch(base() + "/world/state"));
    expect(after.data.events).toBeGreaterThan(before.data.events);
  });

  test("advance honors simDurationMs as well as ticks", async () => {
    const before = await json(await fetch(base() + "/world/state"));
    const r = await fetch(base() + "/world/advance", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ simDurationMs: 1_200_000 }), // exactly 2 tick steps
    });
    expect(r.status).toBe(200);
    const report = await json(r);
    expect(report.data.simTimeAfter - before.data.world.simulationTime).toBe(1_200_000);
  });

  test("residents expose knowledge derived from experience", async () => {
    const res = await json(await fetch(base() + "/world/residents"));
    const r = await json(await fetch(base() + "/world/residents/" + res.data[0].id));
    expect(r.data.id).toBeTruthy();
    expect(Array.isArray(r.knowledge)).toBe(true);
  });

  test("construction produces a new district (owner auth)", async () => {
    const r = await fetch(base() + "/world/construct", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ request: "a residential neighbourhood with family homes" }),
    });
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.data.created.properties).toBeGreaterThanOrEqual(4);
    expect(body.data.created.residents).toBeGreaterThanOrEqual(4);
  });
});

describe("memory subsystem via API", () => {
  test("create (validated), list, consolidate — owner authenticated", async () => {
    const bad = await fetch(base() + "/memory", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ scope: "integration", tier: "not-a-tier", kind: "fact", title: "x", content: "y", importance: 0.5, confidence: 0.8 }),
    });
    expect(bad.status).toBe(400); // zod-enforced enum — no arbitrary tier strings

    const created = await fetch(base() + "/memory", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ scope: "integration", tier: "semantic", kind: "fact", title: "Integration test memory", content: "The integration suite wrote this memory.", importance: 0.8, confidence: 0.9, tags: ["it"] }),
    });
    expect(created.status).toBe(201);

    const list = await json(await fetch(base() + "/memory/integration", { headers: { Authorization: `Bearer ${TEST_OWNER_KEY}` } }));
    expect((list.data as unknown[]).length).toBeGreaterThan(0);

    const consolidated = await fetch(base() + "/memory/integration/consolidate", { method: "POST", headers: { Authorization: `Bearer ${TEST_OWNER_KEY}` } });
    expect(consolidated.status).toBe(200);
    const body = await json(consolidated);
    expect(typeof body.data.promoted).toBe("number");
  });
});

describe("JARVIS orchestrator via API", () => {
  test("degraded mode is honest: objective completes through deterministic fallbacks when no live provider is configured", async () => {
    // In CI (no credentials) this exercises the fallback path; with live
    // credentials it exercises the live path. Either way the state machine
    // must reach a terminal state — never hang, never fabricate model output.
    const r = await fetch(base() + "/jarvis/objectives", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ objective: "Check the status of the NEXUS WORLD simulation and summarise it in one sentence." }),
    });
    expect(r.status).toBe(201);
    const body = await json(r);
    const task = body.data as { state: string; plan: unknown[]; stepResults: unknown[]; evaluation?: { objectiveMet: boolean } };
    expect(["COMPLETED", "RECOVERY_REQUIRED"]).toContain(task.state);
    expect(task.plan.length).toBeGreaterThan(0);
    if (task.state === "COMPLETED") {
      expect(task.evaluation).toBeDefined();
    }
  });

  test("task repository persists tasks", async () => {
    const r = await json(await fetch(base() + "/jarvis/tasks"));
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data.length).toBeGreaterThan(0);
  });

  test.skipIf(!process.env.CLOUDFLARE_API_TOKEN)("live objective flows through the state machine to completion", async () => {
    const r = await fetch(base() + "/jarvis/objectives", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ objective: "Check the status of the NEXUS WORLD simulation and summarise it in one sentence." }),
    });
    expect(r.status).toBe(201);
    const body = await json(r);
    const task = body.data as { state: string; plan: unknown[]; stepResults: unknown[]; evaluation?: { objectiveMet: boolean } };
    expect(["COMPLETED", "RECOVERY_REQUIRED"]).toContain(task.state);
    expect(task.plan.length).toBeGreaterThan(0);
    if (task.state === "COMPLETED") {
      expect(task.evaluation).toBeDefined();
    }
  });
});

describe("NAEI via API (Scenario B shape)", () => {
  // 3 live model calls (analysis + implementation + verification) need time
  const NAEI_TIMEOUT = 120_000;
  test.skipIf(!process.env.CLOUDFLARE_API_TOKEN)("engineering task: analysis, implementation, independent verification", async () => {
    const submit = await fetch(base() + "/naei/tasks", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        requirement: "Implement a NEXUS vehicle ownership and garage system data model: Vehicle entity with owner reference, garage property type, ownership records with transactional purchase.",
        acceptanceCriteria: [
          "Data model includes vehicle entity with owner reference",
          "Purchase flow is transactional (funds check + ownership transfer)",
          "Ownership records are auditable",
        ],
        affectedSubsystems: ["world", "database"],
      }),
    });
    expect(submit.status).toBe(201);
    const submitted = (await json(submit)).data as { id: string };

    // long-running execution: start + poll to terminal state (directive §6.3)
    const start = await fetch(base() + "/naei/execute", {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_OWNER_KEY}` },
    });
    expect(start.status).toBe(202);

    let task: { id: string; status: string; verification?: { verdict: string; verifierAgentId: string }; assignedAgentId?: string; result?: { analysis: string } } | null = null;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const poll = await json(await fetch(base() + "/naei/tasks/" + submitted.id));
      task = poll.data;
      if (task && ["VERIFIED", "FAILED", "ESCALATED", "AWAITING_APPROVAL"].includes(task.status)) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(task).not.toBeNull();
    expect(["VERIFIED", "FAILED", "ESCALATED", "AWAITING_APPROVAL"]).toContain(task!.status);
    if (task!.status === "VERIFIED") {
      expect(task!.verification!.verdict).toBe("PASS");
      // independent verification: verifier differs from implementer
      expect(task!.verification!.verifierAgentId).not.toBe(task!.assignedAgentId);
      expect(task!.result!.analysis.length).toBeGreaterThan(50);
    }
  }, NAEI_TIMEOUT);
});
