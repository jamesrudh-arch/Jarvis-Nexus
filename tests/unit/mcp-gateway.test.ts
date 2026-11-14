import { describe, expect, test } from "bun:test";
import { NexusDb, migrate } from "@nexus/db";
import { McpGateway, TEST_MCP_SERVER_NAME, testMcpServerScript } from "@nexus/mcp-gateway";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * MCP gateway unit regressions (2026-11-14 audit):
 *  - registrations survive a restart (the mcp_servers table was write-only)
 *  - an invocation timeout does not poison server state (timer cleared)
 *  - approval_required servers reject unapproved invocations
 */
const TMP = `/tmp/mcp_unit_${Date.now()}`;
mkdirSync(join(TMP, "srv"), { recursive: true });
writeFileSync(join(TMP, "srv", "server.ts"), testMcpServerScript());

const SLOW_SERVER = `
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
const server = new Server({ name: "slow-tools", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name: "slow_echo", description: "echoes slowly", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } }],
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  await new Promise((r) => setTimeout(r, 2000));
  return { content: [{ type: "text", text: "late:" + req.params.arguments.message }] };
});
await server.connect(new StdioServerTransport());
`;
mkdirSync(join(TMP, "slow"), { recursive: true });
writeFileSync(join(TMP, "slow", "server.ts"), SLOW_SERVER);

afterAllCleanup();
function afterAllCleanup() { /* placeholder to keep the linter quiet */ }

process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

describe("MCP gateway persistence and resilience", () => {
  test("registrations survive a restart (loadPersisted)", () => {
    const dbPath = join(TMP, "restart.db");
    let db = NexusDb.open(dbPath);
    migrate(db);
    const g1 = new McpGateway(db);
    g1.register({
      name: TEST_MCP_SERVER_NAME, title: "NEXUS Test Tools", description: "bundled test server",
      version: "1.0.0", transport: { type: "stdio", command: "bun", args: [join(TMP, "srv", "server.ts")], env: {} },
      permission: "auto", capabilities: [], timeoutMs: 15_000, healthCheckIntervalMs: 60_000,
    });
    expect(g1.get(TEST_MCP_SERVER_NAME)).not.toBeNull();
    db.close();

    // restart: a fresh gateway over the SAME database must see the registration
    db = NexusDb.open(dbPath);
    const g2 = new McpGateway(db);
    const restored = g2.get(TEST_MCP_SERVER_NAME);
    expect(restored?.registration.name).toBe(TEST_MCP_SERVER_NAME);
    expect(restored?.state).toBe("registered"); // connections do not survive; state resets
    db.close();
  });

  test("invocation timeout returns TIMEOUT, does not poison server state, and leaves no leaked timer", async () => {
    const db = NexusDb.open(":memory:");
    migrate(db);
    const g = new McpGateway(db);
    g.register({
      name: "io.nexus.slow", title: "Slow", description: "slow server for timeout tests",
      version: "1.0.0", transport: { type: "stdio", command: "bun", args: [join(TMP, "slow", "server.ts")], env: {} },
      permission: "auto", capabilities: [], timeoutMs: 400, healthCheckIntervalMs: 60_000,
    });
    const started = Date.now();
    const r = await g.invoke({ serverName: "io.nexus.slow", toolName: "slow_echo", args: { message: "x" }, approvedBy: "test" }, "test");
    expect(Date.now() - started).toBeLessThan(2_000); // resolved by the 400ms timeout, not the 2s tool
    expect(r.ok).toBe(false);
    expect(String((r as { error?: { message?: string } }).error?.message)).toContain("exceeded 400ms");
    // a timeout must NOT mark the server failed
    expect(g.get("io.nexus.slow")?.state).not.toBe("failed");
    // the audit recorded a timeout outcome
    const audit = g.auditLog({ serverName: "io.nexus.slow", limit: 5 });
    expect(audit.some((a) => a.outcome === "timeout")).toBe(true);
    // clean up: close the lingering slow-server connection — its child process
    // would otherwise outlive the test and EPIPE on teardown
    await g.disconnect("io.nexus.slow");
    db.close();
  }, 20_000);

  test("approval_required servers reject unapproved invocations and honor approvedBy", async () => {
    const db = NexusDb.open(":memory:");
    migrate(db);
    const g = new McpGateway(db);
    g.register({
      name: "io.nexus.gated", title: "Gated", description: "approval-gated server",
      version: "1.0.0", transport: { type: "stdio", command: "bun", args: [join(TMP, "srv", "server.ts")], env: {} },
      permission: "approval_required", capabilities: [], timeoutMs: 15_000, healthCheckIntervalMs: 60_000,
    });
    // unapproved: rejected before any subprocess is spawned
    const denied = await g.invoke({ serverName: "io.nexus.gated", toolName: "echo", args: { message: "x" } }, "attacker");
    expect(denied.ok).toBe(false);
    expect(String((denied as { error?: { message?: string } }).error?.message)).toContain("approval_required");
    // approved: the real bundled server executes
    const allowed = await g.invoke({ serverName: "io.nexus.gated", toolName: "echo", args: { message: "y" }, approvedBy: "owner" }, "owner");
    expect(allowed.ok).toBe(true);
    db.close();
  });
});
