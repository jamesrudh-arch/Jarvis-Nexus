/**
 * @nexus/mcp-gateway — NEXUS MCP Fabric (directive §4).
 *
 * Central MCP management: server registry (MCP Registry server.json-style
 * manifests), connection management, tool discovery, schema validation,
 * invocation routing, permissions, timeouts, health tracking, audit trail.
 *
 * Transports: stdio (subprocess) and streamable HTTP, via the official
 * @modelcontextprotocol/sdk. Integration acceptance criteria (§4.4) are
 * enforced: an MCP is not "integrated" until tools are discovered and a real
 * operation succeeds.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolResultSchema, ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  nexusId, ID_PREFIXES, ok, err, safeJsonStringify,
  type Result, NexusError, systemClock, type Clock,
} from "@nexus/core";
import type {
  McpServerRegistration, McpToolDescriptor, McpInvocation,
  McpInvocationResult, McpAuditEntry,
} from "@nexus/contracts";
import type { NexusDb } from "@nexus/db";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface RegisteredServer {
  registration: McpServerRegistration;
  registeredAt: string;
  state: "registered" | "connected" | "failed";
  lastError?: string;
  tools: McpToolDescriptor[];
}

export class McpGateway {
  private servers = new Map<string, RegisteredServer>();
  private clients = new Map<string, Client>();
  private readonly clock: Clock;

  constructor(
    private readonly db: NexusDb,
    opts?: { clock?: Clock },
  ) {
    this.clock = opts?.clock ?? systemClock;
    this.loadPersisted();
  }

  /**
   * Re-register servers persisted in mcp_servers so registrations survive
   * restarts (the table was previously write-only — a restart silently lost
   * every dynamically registered server). Connections do not survive the
   * process: state resets to "registered" and reconnects on first use.
   */
  private loadPersisted(): void {
    try {
      const rows = this.db.all<{ name: string; doc: string }>("SELECT name, doc FROM mcp_servers");
      for (const row of rows) {
        try {
          const entry = JSON.parse(row.doc) as RegisteredServer;
          if (entry?.registration?.name && !this.servers.has(entry.registration.name)) {
            entry.state = "registered"; // stdio/http connections cannot survive a restart
            entry.tools = entry.tools ?? [];
            this.servers.set(entry.registration.name, entry);
          }
        } catch { /* skip corrupt rows */ }
      }
    } catch { /* table missing on a fresh database */ }
  }

  // -- lifecycle (§4.1) ------------------------------------------------------

  register(reg: McpServerRegistration): Result<RegisteredServer> {
    if (this.servers.has(reg.name)) {
      return err(new NexusError("CONFLICT", `server ${reg.name} already registered`));
    }
    const entry: RegisteredServer = {
      registration: reg,
      registeredAt: this.clock.now().toISOString(),
      state: "registered",
      tools: [],
    };
    this.servers.set(reg.name, entry);
    this.db.run(
      `INSERT INTO mcp_servers (name, doc) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET doc=excluded.doc`,
      reg.name, safeJsonStringify(entry),
    );
    return ok(entry);
  }

  list(): RegisteredServer[] {
    return [...this.servers.values()];
  }

  get(name: string): RegisteredServer | null {
    return this.servers.get(name) ?? null;
  }

  remove(name: string): boolean {
    const existed = this.servers.delete(name);
    this.clients.delete(name);
    return existed;
  }

  /** Connect + discover tools (§4.4 acceptance: connection + discovery). */
  async connect(name: string): Promise<Result<McpToolDescriptor[]>> {
    const entry = this.servers.get(name);
    if (!entry) return err(new NexusError("NOT_FOUND", `server ${name} not registered`));
    if (entry.registration.permission === "disabled") {
      return err(new NexusError("FORBIDDEN", `server ${name} is disabled`));
    }
    try {
      const client = new Client({ name: "nexus-mcp-gateway", version: "1.0.0" }, { capabilities: {} });
      const transport =
        entry.registration.transport.type === "stdio"
          ? new StdioClientTransport({
              command: entry.registration.transport.command,
              args: entry.registration.transport.args,
              env: entry.registration.transport.env as Record<string, string> | undefined,
            })
          : new StreamableHTTPClientTransport(new URL(entry.registration.transport.url), {
              requestInit: entry.registration.transport.token
                ? { headers: { Authorization: `Bearer ${entry.registration.transport.token}` } }
                : undefined,
            });
      await client.connect(transport);
      const toolsRes = await client.listTools();
      const allow = entry.registration.toolAllowlist;
      entry.tools = (toolsRes.tools ?? []).map((t) => ({
        serverName: name,
        toolName: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
      })).filter((t) => (allow ? allow.includes(t.toolName) : true));
      entry.state = "connected";
      entry.lastError = undefined;
      this.clients.set(name, client);
      this.persist(entry);
      return ok(entry.tools);
    } catch (e) {
      entry.state = "failed";
      entry.lastError = String(e).slice(0, 300);
      this.persist(entry);
      return err(new NexusError("TOOL_ERROR", `connect ${name} failed: ${entry.lastError}`));
    }
  }

  async disconnect(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      try { await client.close(); } catch { /* already closed */ }
      this.clients.delete(name);
    }
    const entry = this.servers.get(name);
    if (entry) { entry.state = "registered"; this.persist(entry); }
  }

  /** Health check across all servers (§4.2). */
  async healthCheck(): Promise<Array<{ name: string; state: string; tools: number; lastError?: string }>> {
    for (const entry of this.servers.values()) {
      if (entry.state === "connected" && !this.clients.has(entry.registration.name)) {
        entry.state = "registered"; // stale connection after restart
        this.persist(entry);
      }
    }
    return this.list().map((s) => ({ name: s.registration.name, state: s.state, tools: s.tools.length, lastError: s.lastError }));
  }

  // -- invocation (§4.2) -----------------------------------------------------

  /**
   * Route a tool invocation with schema validation, permission enforcement,
   * timeout, and audit. Returns a machine-checkable result.
   */
  async invoke(inv: McpInvocation, invokedBy = "system"): Promise<Result<McpInvocationResult>> {
    const started = this.clock.nowMs();
    const entry = this.servers.get(inv.serverName);
    const auditBase: Omit<McpAuditEntry, "outcome" | "durationMs"> = {
      id: nexusId(ID_PREFIXES.audit),
      serverName: inv.serverName, toolName: inv.toolName,
      args: inv.args, invokedBy, at: new Date().toISOString(),
    };

    if (!entry) {
      return this.auditFail(auditBase, "rejected", `server ${inv.serverName} not registered`, started);
    }
    if (entry.registration.permission === "disabled") {
      return this.auditFail(auditBase, "rejected", "server disabled", started);
    }
    if (entry.registration.permission === "approval_required" && !inv.approvedBy) {
      return this.auditFail(auditBase, "rejected", "approval_required: invokedBy must hold approval (approvedBy missing)", started);
    }

    let client = this.clients.get(inv.serverName);
    if (!client) {
      const c = await this.connect(inv.serverName);
      if (!c.ok) return this.auditFail(auditBase, "error", c.error.message, started);
      client = this.clients.get(inv.serverName)!;
    }

    const tool = entry.tools.find((t) => t.toolName === inv.toolName);
    if (!tool) {
      return this.auditFail(auditBase, "rejected", `tool ${inv.toolName} not discovered on ${inv.serverName}`, started);
    }
    // basic schema validation: required properties present
    const schema = tool.inputSchema as { required?: string[]; properties?: Record<string, unknown> } | undefined;
    if (schema?.required) {
      const missing = schema.required.filter((k) => !(k in inv.args));
      if (missing.length > 0) {
        return this.auditFail(auditBase, "rejected", `missing required args: ${missing.join(", ")}`, started);
      }
    }

    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new NexusError("TIMEOUT", `tool invocation exceeded ${entry.registration.timeoutMs}ms`)), entry.registration.timeoutMs);
      });
      let result;
      try {
        result = await Promise.race([
          client.callTool({ name: inv.toolName, arguments: inv.args as Record<string, unknown> }, CallToolResultSchema),
          timeout,
        ]);
      } finally {
        clearTimeout(timer); // never leak the timer past the invocation
      }
      const content = (result.content as Array<{ type: string; text?: string }> | undefined)?.[0]?.text;
      const durationMs = this.clock.nowMs() - started;
      const payload: McpInvocationResult = {
        ok: result.isError !== true,
        serverName: inv.serverName, toolName: inv.toolName,
        result: content !== undefined ? safeParseJson(content) : result,
        durationMs, auditId: auditBase.id,
      };
      this.recordAudit({ ...auditBase, outcome: result.isError === true ? "error" : "success", durationMs, errorDetail: result.isError === true ? content?.slice(0, 300) : undefined });
      return ok(payload);
    } catch (e) {
      const msg = String(e).slice(0, 400);
      const durationMs = this.clock.nowMs() - started;
      const isTimeout = e instanceof NexusError && e.code === "TIMEOUT";
      const outcome: McpAuditEntry["outcome"] = isTimeout ? "timeout" : "error";
      if (!isTimeout) {
        // transport failure degrades the server state and drops the connection;
        // a timeout alone must not poison a healthy server
        entry.state = "failed";
        entry.lastError = msg;
        const c = this.clients.get(inv.serverName);
        this.clients.delete(inv.serverName);
        if (c) void c.close().catch(() => { /* already closed */ });
        this.persist(entry);
      }
      return this.auditFail(auditBase, outcome, msg, started);
    }
  }

  auditLog(filter?: { serverName?: string; limit?: number }): McpAuditEntry[] {
    const rows = filter?.serverName
      ? this.db.all<{ id: string; server_name: string; tool_name: string; outcome: string; invoked_by: string; at: string }>(
        "SELECT id, server_name, tool_name, outcome, invoked_by, at FROM mcp_audit WHERE server_name = ? ORDER BY at DESC LIMIT ?",
        filter.serverName, filter.limit ?? 50,
      )
      : this.db.all<{ id: string; server_name: string; tool_name: string; outcome: string; invoked_by: string; at: string }>(
        "SELECT id, server_name, tool_name, outcome, invoked_by, at FROM mcp_audit ORDER BY at DESC LIMIT ?",
        filter?.limit ?? 50,
      );
    return rows.map((r) => {
      const detail = this.db.get<{ value: string }>("SELECT value FROM kv WHERE key = ?", `audit:${r.id}`);
      const full = detail ? (safeParse(r.id, detail.value) as McpAuditEntry | null) : null;
      return full ?? {
        id: r.id, serverName: r.server_name, toolName: r.tool_name,
        args: {}, outcome: r.outcome as McpAuditEntry["outcome"],
        durationMs: 0, invokedBy: r.invoked_by, at: r.at,
      };
    });
  }

  private auditFail(audit: Omit<McpAuditEntry, "outcome" | "durationMs">, outcome: McpAuditEntry["outcome"], message: string, started: number): Result<McpInvocationResult> {
    const durationMs = this.clock.nowMs() - started;
    this.recordAudit({ ...audit, outcome, errorDetail: message.slice(0, 300), durationMs });
    return err(new NexusError("TOOL_ERROR", `${audit.serverName}.${audit.toolName}: ${message}`));
  }

  private recordAudit(a: Omit<McpAuditEntry, "outcome" | "durationMs"> & { outcome: McpAuditEntry["outcome"]; durationMs: number; errorDetail?: string }): void {
    this.db.run(
      `INSERT INTO mcp_audit (id, server_name, tool_name, outcome, invoked_by, at) VALUES (?, ?, ?, ?, ?, ?)`,
      a.id, a.serverName, a.toolName, a.outcome, a.invokedBy, a.at,
    );
    // full details (args, duration, errors) stored in kv under audit id
    this.db.run(
      `INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      `audit:${a.id}`, safeJsonStringify(a),
    );
  }

  private persist(entry: RegisteredServer): void {
    this.db.run(
      `INSERT INTO mcp_servers (name, doc) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET doc=excluded.doc`,
      entry.registration.name, safeJsonStringify(entry),
    );
  }
}

function safeParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

function safeParse(id: string, text: string): unknown {
  try { return JSON.parse(text); } catch { return { id, args: {}, outcome: "error" }; }
}

// ---------------------------------------------------------------------------
// Bundled test MCP server — proves the fabric end-to-end (§4.4)
// ---------------------------------------------------------------------------

export const TEST_MCP_SERVER_NAME = "io.nexus.test-tools";

/** Spin up an in-process MCP server over stdio; returns its launch command registration. */
export function testMcpServerScript(): string {
  return `
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "nexus-test-tools", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      description: "Echo a message back",
      inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
    },
    {
      name: "add",
      description: "Add two numbers",
      inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] },
    },
    {
      name: "world_status",
      description: "Return a canned world status probe",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (name === "echo") return { content: [{ type: "text", text: "echo:" + args.message }] };
  if (name === "add") return { content: [{ type: "text", text: JSON.stringify({ sum: args.a + args.b }) }] };
  if (name === "world_status") return { content: [{ type: "text", text: JSON.stringify({ status: "running", tick: 42 }) }] };
  return { isError: true, content: [{ type: "text", text: "unknown tool: " + name }] };
});

await server.connect(new StdioServerTransport());
`;
}

export { Server, StdioServerTransport, Client, StdioClientTransport, StreamableHTTPClientTransport };
