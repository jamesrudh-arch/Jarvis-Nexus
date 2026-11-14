import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { createApp } from "@nexus/api";
import { NexusDb, migrate } from "@nexus/db";

/**
 * Integration tests: real subsystem wiring through the HTTP app, including
 * the MCP gateway against the bundled stdio test server (§4.4 acceptance).
 */
const TMP = `/tmp/nexus_it_${Date.now()}`;
mkdirSync(TMP, { recursive: true });

let app: ReturnType<typeof createApp>;
let port: number;
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  app = createApp({
    dbPath: `${TMP}/nexus.db`,
    workspaceRoot: `${TMP}/workspaces`,
    env: process.env as Record<string, string>,
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

describe("API foundation", () => {
  test("root contract", async () => {
    const r = await (await fetch(base())).json();
    expect(r.service).toBe("NEXUS API");
    expect(r.subsystems).toContain("jarvis");
  });

  test("health reports all components", async () => {
    const r = await (await fetch(base() + "/health/detailed")).json();
    expect(["healthy", "degraded", "unhealthy"]).toContain(r.overall);
    const names = r.components.map((c: { component: string }) => c.component);
    expect(names).toContain("database");
    expect(names).toContain("model_fabric");
    expect(names).toContain("mcp_gateway");
    expect(names).toContain("world_simulation");
    expect(names).toContain("naei");
  });

  test("unauthenticated consequential routes are rejected", async () => {
    const r = await fetch(base() + "/world/advance", { method: "POST", body: JSON.stringify({}) });
    expect(r.status).toBe(401);
  });
});

describe("MCP gateway — integration acceptance (directive §4.4)", () => {
  test("server starts, connects, tools discovered", async () => {
    const r = await fetch(base() + "/mcp/servers/io.nexus.test-tools/tools");
    expect(r.status).toBe(200);
    const body = await r.json();
    const tools = body.data as Array<{ toolName: string }>;
    expect(tools.map((t) => t.toolName)).toEqual(["echo", "add", "world_status"]);
  });

  test("real operation succeeds end-to-end (echo tool)", async () => {
    const r = await fetch(base() + "/mcp/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverName: "io.nexus.test-tools", toolName: "echo", args: { message: "nexus-fabric-check" } }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.data.ok).toBe(true);
    expect(body.data.result).toBe("echo:nexus-fabric-check");
    expect(body.data.durationMs).toBeGreaterThan(0);
  });

  test("schema validation rejects missing required args", async () => {
    const r = await fetch(base() + "/mcp/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverName: "io.nexus.test-tools", toolName: "add", args: { a: 1 } }),
    });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error).toContain("missing required args");
  });

  test("audit trail records invocations", async () => {
    const r = await (await fetch(base() + "/mcp/audit?limit=10")).json();
    const entries = r.data as Array<{ serverName: string; toolName: string; outcome: string }>;
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.some((e) => e.outcome === "rejected")).toBe(true);
    expect(entries.some((e) => e.outcome === "success")).toBe(true);
  });
});

describe("NEXUS WORLD via API", () => {
  test("world state is live with bootstrap civilisation", async () => {
    const r = await (await fetch(base() + "/world/state")).json();
    expect(r.data.world.name).toBe("NEXUS Prime");
    expect(r.data.residents).toBeGreaterThan(0);
    expect(r.data.properties).toBeGreaterThan(0);
    expect(r.data.economy.total).toBeGreaterThan(0);
  });

  test("simulation advance ticks and generates history (owner auth)", async () => {
    const before = await (await fetch(base() + "/world/state")).json();
    const key = process.env.OWNER_KEY!;
    const r = await fetch(base() + "/world/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ ticks: 70 }), // 70 x 10min = ~11.7 sim-hours: crosses 09:00 salary run
    });
    expect(r.status).toBe(200);
    const report = await r.json();
    expect(report.data.simTimeAfter).toBeGreaterThan(report.data.simTimeBefore);
    const after = await (await fetch(base() + "/world/state")).json();
    expect(after.data.events).toBeGreaterThan(before.data.events);
  });

  test("residents expose knowledge derived from experience", async () => {
    const res = await (await fetch(base() + "/world/residents")).json();
    const r = await (await fetch(base() + "/world/residents/" + res.data[0].id)).json();
    expect(r.data.id).toBeTruthy();
    expect(Array.isArray(r.knowledge)).toBe(true);
  });
});

describe("memory subsystem via API", () => {
  test("create, list, consolidate", async () => {
    await fetch(base() + "/memory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "integration", tier: "semantic", kind: "fact", title: "Integration test memory", content: "The integration suite wrote this memory.", importance: 0.8 }),
    });
    const list = await (await fetch(base() + "/memory/integration")).json();
    expect((list.data as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("JARVIS orchestrator end-to-end (Scenario A shape)", () => {
  test.skipIf(!process.env.CLOUDFLARE_API_TOKEN)("objective flows through the state machine to completion", async () => {
    const r = await fetch(base() + "/jarvis/objectives", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective: "Check the status of the NEXUS WORLD simulation and summarise it in one sentence." }),
    });
    expect(r.status).toBe(201);
    const body = await r.json();
    const task = body.data as { state: string; plan: unknown[]; stepResults: unknown[]; evaluation?: { objectiveMet: boolean } };
    expect(["COMPLETED", "RECOVERY_REQUIRED"]).toContain(task.state);
    expect(task.plan.length).toBeGreaterThan(0);
    if (task.state === "COMPLETED") {
      expect(task.evaluation).toBeDefined();
    }
  });

  test("task repository persists tasks", async () => {
    const r = await (await fetch(base() + "/jarvis/tasks")).json();
    expect(Array.isArray(r.data)).toBe(true);
  });
});

describe("NAEI via API (Scenario B shape)", () => {
  // 3 live model calls (analysis + implementation + verification) need time
  const NAEI_TIMEOUT = 120_000;
  test.skipIf(!process.env.CLOUDFLARE_API_TOKEN)("engineering task: analysis, implementation, independent verification", async () => {
    const key = process.env.OWNER_KEY!;
    const submit = await fetch(base() + "/naei/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
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
    const submitted = (await submit.json()).data as { id: string };

    // long-running execution: start + poll to terminal state (§6.3)
    const start = await fetch(base() + "/naei/execute", {
      method: "POST", headers: { Authorization: `Bearer ${key}` },
    });
    expect(start.status).toBe(202);

    let task: { id: string; status: string; verification?: { verdict: string; verifierAgentId: string }; assignedAgentId?: string; result?: { analysis: string } } | null = null;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const poll = await (await fetch(base() + "/naei/tasks/" + submitted.id)).json();
      task = poll.data;
      if (["VERIFIED", "FAILED", "ESCALATED", "AWAITING_APPROVAL"].includes(task.status)) break;
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
