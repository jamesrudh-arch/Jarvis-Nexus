import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "@nexus/api";
import { NexusDb, migrate } from "@nexus/db";
import { testMcpServerScript } from "@nexus/mcp-gateway";

/**
 * Security matrix regressions (2026-11-14 audit):
 *  - bounded metric cardinality (raw paths must not mint metric rows)
 *  - API contract errors: 404s and unknown-server 502
 *  - /health fails visible: 503 (not 200) when a component is unhealthy
 *  - restart recovery never self-approves approval_required MCP tools
 */
const TMP = `/tmp/nexus_sec_${Date.now()}`;
mkdirSync(TMP, { recursive: true });
writeFileSync(join(TMP, "server.ts"), testMcpServerScript());

const TEST_OWNER_KEY = "security-test-owner-key";
let app: ReturnType<typeof createApp>;
let port: number;
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  app = createApp({
    dbPath: `${TMP}/nexus.db`,
    workspaceRoot: `${TMP}/workspaces`,
    env: { ...process.env, OWNER_KEY: TEST_OWNER_KEY } as Record<string, string>,
  });
  port = 4100 + Math.floor(Math.random() * 100);
  server = Bun.serve({ port, fetch: app.app.fetch });
});

afterAll(() => {
  server.stop(true);
  app.db.close();
  rmSync(TMP, { recursive: true, force: true });
});

const base = () => `http://localhost:${port}`;
const ownerHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${TEST_OWNER_KEY}` };

describe("security and contract regressions", () => {
  test("metric labels are bounded: raw paths cannot mint metric rows", async () => {
    // 30 unique paths that would previously create 30 distinct label sets
    for (let i = 0; i < 30; i++) {
      await fetch(base() + `/cardinality-probe-${i}/deep/nested/${i}`);
      await fetch(base() + `/health`);
    }
    const r = (await (await fetch(base() + "/metrics")).json()) as { counters: Array<{ name: string; labels: Record<string, string> }> };
    const httpCounters = (r.counters as Array<{ name: string; labels: Record<string, string> }>)
      .filter((c) => c.name === "http_requests_total");
    expect(httpCounters.length).toBeGreaterThan(0);
    const allowed = new Set(["health", "world", "jarvis", "naei", "mcp", "memory", "metrics", "models", "other"]);
    for (const c of httpCounters) {
      expect(allowed.has(c.labels.route ?? "")).toBe(true); // every label is from the fixed allowlist
    }
    const cardProbe = httpCounters.find((c) => String(c.labels.route).startsWith("cardinality"));
    expect(cardProbe).toBeUndefined();
  });

  test("API contract errors: 404s and unknown-server 502", async () => {
    const t404a = await fetch(base() + "/jarvis/tasks/does-not-exist");
    expect(t404a.status).toBe(404);
    const t404b = await fetch(base() + "/naei/tasks/does-not-exist");
    expect(t404b.status).toBe(404);
    const t404c = await fetch(base() + "/world/residents/does-not-exist");
    expect(t404c.status).toBe(404);
    const t502 = await fetch(base() + "/mcp/servers/io.nexus.unknown-server/tools");
    expect(t502.status).toBe(502);
    const v400 = await fetch(base() + "/jarvis/objectives", {
      method: "POST", headers: ownerHeaders, body: "{}",
    });
    expect(v400.status).toBe(400);
    const n400 = await fetch(base() + "/naei/tasks", {
      method: "POST", headers: ownerHeaders, body: JSON.stringify({ requirement: "x" }), // missing acceptanceCriteria
    });
    expect(n400.status).toBe(400);
    const e404 = await fetch(base() + "/naei/execute", { method: "POST", headers: { Authorization: `Bearer ${TEST_OWNER_KEY}` } });
    expect(e404.status).toBe(404); // empty queue — but NOT 401: the key was valid
  });

  test("restart recovery never self-approves approval_required MCP tools (landmine regression)", async () => {
    // register an approval-gated server backed by the bundled test script
    const reg = await fetch(base() + "/mcp/register", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        name: "io.nexus.gated-it", title: "Gated IT", description: "approval-gated server for the security suite",
        version: "1.0.0", transport: { type: "stdio", command: "bun", args: [join(TMP, "server.ts")], env: {} },
        permission: "approval_required", capabilities: [], timeoutMs: 15_000, healthCheckIntervalMs: 60_000,
      }),
    });
    expect(reg.status).toBe(201);

    // forge a task that was mid-EXECUTION when the process died, with a
    // consequential mcp.invoke step still pending
    const t = app.orchestrator.receive("recovery security probe");
    t.state = "EXECUTING";
    t.plan = [{
      stepId: "s1", description: "gated tool call", tool: "mcp.invoke",
      params: { serverName: "io.nexus.gated-it", toolName: "echo", args: { message: "recovery-probe" } },
      dependsOn: [], completionCriteria: "echo executed",
    }];
    t.stepResults = [{ stepId: "s1", status: "PENDING" }];
    app.orchestrator.repo.save(t);

    await app.orchestrator.recoverInterrupted();

    // BEFORE the fix: the api tool wiring defaulted approvedBy to "jarvis",
    // silently self-approving on the recovery path (audit outcome: success).
    // AFTER the fix: the gateway must reject for lack of owner approval.
    const audit = app.mcp.auditLog({ serverName: "io.nexus.gated-it", limit: 10 });
    const rejected = audit.find((a) => a.toolName === "echo");
    expect(rejected).toBeDefined();
    expect(rejected!.outcome).toBe("rejected");
    expect(String((rejected as unknown as { errorDetail?: string }).errorDetail)).toContain("approval_required");
  });

  test("health fails visible: unhealthy aggregate returns 503, not 200", async () => {
    // before poisoning: healthy/degraded returns 200
    const before = await fetch(base() + "/health");
    expect([200, 503]).toContain(before.status);

    // poison: a component probe that always throws
    app.health.register("probe_throws", () => { throw new Error("synthetic failure"); });
    const r = await fetch(base() + "/health");
    expect(r.status).toBe(503);
    const body = (await r.json()) as { overall: string; components: Array<{ component: string; status: string }> };
    expect(body.overall).toBe("unhealthy");
    expect(body.components.some((c) => c.component === "probe_throws" && c.status === "unhealthy")).toBe(true);
  });
});
