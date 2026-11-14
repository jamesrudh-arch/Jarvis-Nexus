/**
 * @nexus/api — NEXUS API service.
 *
 * Single deployable that hosts all subsystems behind versioned HTTP contracts
 * (ADR-003): JARVIS orchestrator, NAEI workforce, NEXUS WORLD simulation,
 * MCP gateway, memory, model fabric, observability. Internal boundaries are
 * package-level contracts, so services can be split into separate processes
 * without changing contracts.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { NexusDb, migrate, createRepos } from "@nexus/db";
import { fabricFromEnv } from "@nexus/model-fabric";
import { MemoryService } from "@nexus/memory";
import { JarvisOrchestrator, type ToolExecutor } from "@nexus/orchestrator";
import { NaeiEngine } from "@nexus/naei";
import { WorldRuntime, createWorld } from "@nexus/world";
import { McpGateway, TEST_MCP_SERVER_NAME, testMcpServerScript } from "@nexus/mcp-gateway";
import { NexusLogger, HealthRegistry, MetricsCollector, newCorrelationId } from "@nexus/observability";
import { ok, err, safeJsonStringify, NexusError } from "@nexus/core";
import { railwayFromEnv, introspectLiveFields, diffContract, contractIsCompatible, BackupService } from "@nexus/railway";
import { CreateObjectiveRequest, CreateNaeiTaskRequest, AdvanceWorldRequest, CreateMemoryRequest, CONTRACT_VERSION, RailwayDiagnoseRequest, RailwayRecoveryPlanRequest, RailwayExecuteRequest, RailwayAuthorizationRequestSchema } from "@nexus/contracts";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { join } from "node:path";

export interface NexusApiConfig {
  dbPath: string;
  workspaceRoot: string;
  env: Record<string, string | undefined>;
  /** Test seam: inject a MOCKED Railway transport (never used in production wiring). */
  railwayFetchFn?: typeof fetch;
}

export function createApp(cfg: NexusApiConfig) {
  // ---- wiring ---------------------------------------------------------------
  mkdirSync(cfg.workspaceRoot, { recursive: true });
  const db = NexusDb.open(cfg.dbPath);
  const migrationReport = migrate(db);
  const repos = createRepos(db);

  const logger = new NexusLogger();
  const metrics = new MetricsCollector(repos.metrics);
  const health = new HealthRegistry();

  const { fabric, providers } = fabricFromEnv(cfg.env, (e) => {
    metrics.increment("model_calls_total", { provider: e.provider, success: String(e.success) });
    metrics.gauge("model_latency_ms", e.latencyMs, { model: e.modelId });
  });
  const memory = MemoryService.withDb(db, repos);

  // MCP gateway + bundled test server (integration acceptance §4.4)
  const mcp = new McpGateway(db);
  const testServerDir = join(cfg.workspaceRoot, "_mcp_test_server");
  mkdirSync(testServerDir, { recursive: true });
  writeFileSync(join(testServerDir, "server.ts"), testMcpServerScript());
  mcp.register({
    name: TEST_MCP_SERVER_NAME,
    title: "NEXUS Test Tools",
    description: "Bundled test MCP server proving the gateway end-to-end",
    version: "1.0.0",
    transport: { type: "stdio", command: "bun", args: [join(testServerDir, "server.ts")], env: {} },
    permission: "auto",
    capabilities: ["echo", "arithmetic", "world_probe"],
    timeoutMs: 15_000,
    healthCheckIntervalMs: 60_000,
  });

  const worldRuntime = new WorldRuntime(db);
  const naei = new NaeiEngine({ db, fabric, workspaceRoot: join(cfg.workspaceRoot, "naei") });
  if (naei.agents.list().length === 0) naei.agents.seedDefaultRoster();

  // JARVIS tool executor — internal capabilities + MCP + NAEI delegation
  const CONSEQUENTIAL_TOOLS = new Set(["world.construct", "mcp.invoke", "railway.recovery.execute"]);
  const tools: ToolExecutor = {
    listTools: () => [
      "memory.store", "memory.search",
      "world.advance", "world.status", "world.events", "world.construct",
      "naei.delegate",
      "mcp.invoke",
      "models.list",
      "railway.status", "railway.intelligence", "railway.diagnose", "railway.recovery.execute",
    ],
    requiresApproval: (tool) => CONSEQUENTIAL_TOOLS.has(tool),
    async execute(tool, params, ctx) {
      metrics.increment("tool_calls_total", { tool });
      switch (tool) {
        case "memory.store": {
          const m = memory.create({
            scope: "jarvis", tier: (params.tier as never) ?? "semantic",
            kind: (params.kind as never) ?? "fact",
            title: String(params.title ?? "note"), content: String(params.content ?? ""),
            importance: Number(params.importance ?? 0.5), source: "agent", sourceId: ctx.task.id,
          });
          return ok({ memoryId: m.id });
        }
        case "memory.search": {
          const results = memory.retrieve({ scope: "jarvis", textQuery: String(params.query ?? ""), limit: 5 });
          return ok(results.map((r) => ({ id: r.id, title: r.title, tier: r.tier })));
        }
        case "world.advance": {
          const worldId = String(params.worldId ?? defaultWorldId());
          const world = worldRuntime.store.getWorld(worldId);
          if (!world) return err(new NexusError("NOT_FOUND", "world not found"));
          const report = worldRuntime.simulation.advance(world, { ticks: Number(params.ticks ?? 10) });
          return ok(report);
        }
        case "world.status": {
          const worldId = String(params.worldId ?? defaultWorldId());
          const world = worldRuntime.store.getWorld(worldId);
          if (!world) return err(new NexusError("NOT_FOUND", "world not found"));
          return ok({
            worldId, simTime: world.simulationTime, timeOfDay: world.environment.timeOfDay,
            weather: world.environment.weather, season: world.environment.season,
            residents: worldRuntime.store.listResidents(worldId).length,
            events: db.count("SELECT COUNT(*) AS n FROM world_events WHERE world_id = ?", worldId),
          });
        }
        case "world.events": {
          const worldId = String(params.worldId ?? defaultWorldId());
          const events = worldRuntime.store.events(worldId, { limit: Number(params.limit ?? 20) });
          return ok(events.map((e) => ({ id: e.id, type: e.type, simTime: e.simTime })));
        }
        case "world.construct": {
          const worldId = String(params.worldId ?? defaultWorldId());
          const world = worldRuntime.store.getWorld(worldId);
          if (!world) return err(new NexusError("NOT_FOUND", "world not found"));
          const r = worldRuntime.creation.construct(world, String(params.request ?? "city district"));
          return r.ok ? ok({ specId: r.value.spec.specId, created: r.value.created, eventId: r.value.event.id }) : r;
        }
        case "naei.delegate": {
          const task = naei.submit({
            requirement: String(params.requirement ?? "unspecified requirement"),
            acceptanceCriteria: (params.acceptanceCriteria as string[]) ?? ["Requirement addressed"],
            preferredRole: params.role as never,
          });
          const exec = await naei.executeOne(params.role as never);
          return ok({ naeiTaskId: task.id, status: exec.ok ? exec.value.status : "FAILED", verification: exec.ok ? exec.value.verification : undefined });
        }
        case "mcp.invoke": {
          // approval is never self-granted: without an explicit owner approval
          // (ctx.approvedBy), approval_required servers must reject — the
          // previous `?? "jarvis"` default silently self-approved on the
          // restart-recovery path.
          const r = await mcp.invoke({
            serverName: String(params.serverName), toolName: String(params.toolName),
            args: (params.args as Record<string, unknown>) ?? {},
            approvedBy: ctx.approvedBy,
          }, "jarvis");
          return r.ok ? ok(r.value) : r;
        }
        case "models.list":
          return ok(fabric.listModels().map((m) => ({ id: m.id, taskTypes: m.capabilities.taskTypes })));
        case "railway.status": {
          // L1 read-only: cached monitoring snapshot; never blocks on the API.
          const report = railway.latestMonitoring();
          if (!report) return err(new NexusError("DEPENDENCY_ERROR", "railway monitoring not yet executed (no cached report)"));
          return ok({ overall: report.overall, dimensions: report.dimensions.map((d) => ({ dimension: d.dimension, status: d.status, detail: d.detail })) });
        }
        case "railway.intelligence": {
          const answer = await railway.intelligence.ask(String(params.question ?? "what is happening with my infrastructure"));
          return answer.ok ? ok(answer.value) : err(new NexusError("DEPENDENCY_ERROR", answer.error.message));
        }
        case "railway.diagnose": {
          const inv = await railway.diagnostics.investigate({
            kind: (String(params.trigger ?? "manual") as never),
            resourceIds: (params.resourceIds as string[]) ?? [],
            note: params.note ? String(params.note) : undefined,
          });
          return inv.ok
            ? ok({ investigationId: inv.value.id, classification: inv.value.causeClassification, rootCause: inv.value.rootCause, confidence: inv.value.confidence, recommendations: inv.value.recommendations.map((r) => ({ action: r.action, operationId: r.operationId, requiredLevel: r.requiredLevel })) })
            : err(new NexusError("DEPENDENCY_ERROR", inv.error.message));
        }
        case "railway.recovery.execute": {
          // Consequential: the orchestrator approval gate stalls plans here
          // until the owner approves, AND the railway authorization layer
          // still requires a single-use owner grant — two independent gates.
          const r = await railway.recovery.execute(String(params.planId), String(params.grantId), ctx.approvedBy ?? "agent");
          return r.ok ? ok(r.value) : err(new NexusError("UNAUTHORIZED", r.error.message));
        }
        default:
          return err(new NexusError("VALIDATION_ERROR", `unknown tool: ${tool}`));
      }
    },
  };

  const orchestrator = new JarvisOrchestrator({
    db, fabric, memory, tools,
    memoryScope: "jarvis",
    approvalGate: async (task, opts) => {
      const consequential = task.plan.some((s) => s.tool && tools.requiresApproval(s.tool, s.params));
      // release only when the caller carries an explicit approval — supplied
      // by the owner-authenticated /jarvis/tasks/:id/approve route. Without
      // this, the approve endpoint could never release a consequential task.
      return { required: consequential, granted: Boolean(opts?.approvedBy), by: opts?.approvedBy };
    },
  });

  // Railway infrastructure intelligence (owner directive 2026-11-15).
  // Credential isolation: the Railway token stays inside @nexus/railway —
  // it is never forwarded to MCP servers, NAEI workspaces or tool params.
  const railway = railwayFromEnv({
    db, env: cfg.env,
    fetchFn: cfg.railwayFetchFn,
    memory: (m) => {
      try {
        memory.create({
          scope: "railway", tier: "operational", kind: "fact",
          title: m.title, content: m.content,
          importance: m.importance, confidence: 0.9,
          source: "observation", sourceId: m.sourceId,
        });
      } catch { /* memory failures must never break monitoring */ }
    },
    metrics: {
      increment: (name, labels, by) => metrics.increment(name, labels, by),
      gauge: (name, value, labels) => metrics.gauge(name, value, labels),
    },
  });

  // ---- default world bootstrap ------------------------------------------------
  function defaultWorldId(): string {
    const worlds = worldRuntime.store.listWorlds();
    return worlds[0]?.id ?? "";
  }
  if (worldRuntime.store.listWorlds().length === 0) {
    const world = createWorld({ name: "NEXUS Prime", residentTargetPopulation: 24 });
    worldRuntime.store.saveWorld(world);
    const construction = worldRuntime.creation.construct(world, "Construct a residential neighbourhood with homes");
    logger.info("world", "bootstrap world created", { worldId: world.id, construction: construction.ok });
    worldRuntime.store.snapshot(world.id, "bootstrap");
  }

  // ---- health probes ------------------------------------------------------------
  health.register("database", () => ({
    component: "database",
    // real check: this read throws when the store is broken (the registry
    // catches it and reports unhealthy) — the previous `>= 0` tautology could
    // never fail
    status: db.count("SELECT COUNT(*) AS n FROM schema_migrations") >= 1 ? "healthy" : "unhealthy",
    detail: `migrations applied: ${migrationReport.applied.length + migrationReport.skipped.length}`,
    checkedAt: new Date().toISOString(),
  }));
  health.register("model_fabric", async () => {
    const providerList = providers.map((p) => `${p}:available`).join(",");
    return {
      component: "model_fabric",
      status: providers.length > 1 ? "healthy" : "degraded",
      detail: `providers: ${providerList}; openai blocked from sandbox egress region is expected (ADR-007)`,
      checkedAt: new Date().toISOString(),
    };
  });
  health.register("mcp_gateway", async () => {
    const servers = await mcp.healthCheck();
    const failed = servers.filter((s) => s.state === "failed").length;
    return {
      component: "mcp_gateway",
      status: servers.length === 0 ? "degraded" : failed > 0 ? "degraded" : "healthy",
      detail: safeJsonStringify(servers),
      checkedAt: new Date().toISOString(),
    };
  });
  health.register("world_simulation", () => {
    const worlds = worldRuntime.store.listWorlds();
    return {
      component: "world_simulation",
      status: worlds.length > 0 ? "healthy" : "degraded",
      detail: `${worlds.length} world(s); residents: ${worlds.length ? worldRuntime.store.listResidents(worlds[0]!.id).length : 0}`,
      checkedAt: new Date().toISOString(),
    };
  });
  health.register("naei", () => ({
    component: "naei",
    status: naei.agents.list({ active: true }).length > 0 ? "healthy" : "degraded",
    detail: `${naei.agents.list().length} agents registered`,
    checkedAt: new Date().toISOString(),
  }));
  // Railway intelligence probe — cached + non-blocking (never calls the API
  // on the health path); unconfigured is DEGRADED, never healthy (fail-visible).
  health.register("railway", () => {
    const h = railway.healthComponent();
    return { component: h.component, status: h.status, detail: h.detail, checkedAt: h.checkedAt };
  });

  // ---- HTTP app ---------------------------------------------------------------
  const app = new Hono();
  app.use("*", cors());

  // owner authentication for consequential routes (directive §13).
  // Constant-time comparison; header-only — the owner key never travels in a
  // URL/query string (those leak into proxy and access logs).
  const ownerKey = cfg.env.OWNER_KEY;
  const tokenMatches = (provided: string | undefined, expected: string): boolean => {
    if (!provided) return false;
    const a = createHash("sha256").update(provided).digest();
    const b = createHash("sha256").update(expected).digest();
    return timingSafeEqual(a, b);
  };
  const requireOwner = async (c: any, next: any) => {
    const auth = c.req.header("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!ownerKey || !token || !tokenMatches(token, ownerKey)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };

  // request correlation + metrics
  app.use("*", async (c: any, next: any) => {
    const correlationId = c.req.header("X-Correlation-Id") ?? newCorrelationId();
    c.set("correlationId", correlationId);
    // bounded label: fixed route allowlist. Labelling by any raw path component
    // would let any client mint unbounded metric rows (one per unique URL).
    const KNOWN_ROUTES = new Set(["health", "world", "jarvis", "naei", "mcp", "memory", "metrics", "models", "railway"]);
    const firstSegment = new URL(c.req.url).pathname.split("/")[1] ?? "";
    const route = KNOWN_ROUTES.has(firstSegment) ? firstSegment : "other";
    metrics.increment("http_requests_total", { route });
    await next();
  });

  app.get("/", (c) => c.json({
    service: "NEXUS API",
    version: "1.0.0",
    contractVersion: CONTRACT_VERSION,
    subsystems: ["jarvis", "naei", "world", "mcp", "memory", "models", "observability", "railway"],
  }));

  app.get("/health", async (c) => {
    const h = await health.check();
    // fail visible: an unhealthy aggregate is a 503, not a 200 — the Railway
    // healthcheck and external monitors must see real failures
    return c.json(h, h.overall === "unhealthy" ? 503 : 200);
  });
  app.get("/health/detailed", async (c) => c.json(await health.check()));
  app.get("/metrics", (c) => c.json({ counters: metrics.snapshot(), db: repos.metrics.sumByName() }));

  // -- JARVIS ----------------------------------------------------------------
  // model spend and autonomous execution are consequential: unauthenticated
  // users must not be able to run objectives or enqueue NAEI work
  app.post("/jarvis/objectives", requireOwner, async (c) => {
    const parse = CreateObjectiveRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parse.success) return c.json({ error: "validation", issues: parse.error.issues }, 400);
    const task = orchestrator.receive(parse.data.objective, parse.data.origin);
    const run = await orchestrator.run(task.id);
    return c.json({ data: run.ok ? run.value : { id: task.id, state: "RECOVERY_REQUIRED" }, error: run.ok ? undefined : run.error.message }, 201);
  });
  app.get("/jarvis/tasks", (c) => c.json({ data: orchestrator.repo.list() }));
  app.get("/jarvis/tasks/:id", (c) => {
    const task = orchestrator.repo.get(c.req.param("id"));
    return task ? c.json({ data: task }) : c.json({ error: "not_found" }, 404);
  });
  app.post("/jarvis/tasks/:id/approve", requireOwner, async (c) => {
    const run = await orchestrator.run(c.req.param("id"), { approvedBy: "owner" });
    return c.json({ data: run.ok ? run.value : null, error: run.ok ? undefined : run.error.message });
  });

  // -- NAEI --------------------------------------------------------------------
  app.get("/naei/agents", (c) => c.json({ data: naei.agents.list() }));
  app.post("/naei/tasks", requireOwner, async (c) => {
    const parse = CreateNaeiTaskRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parse.success) return c.json({ error: "validation", issues: parse.error.issues }, 400);
    const task = naei.submit(parse.data);
    return c.json({ data: task }, 201);
  });
  app.post("/naei/execute", requireOwner, async (c) => {
    // long-running pattern (§6.3): execution is started in the background;
    // clients poll GET /naei/tasks/:id for the terminal status
    const queued = naei.tasks.ready();
    if (queued.length === 0) return c.json({ data: null, error: "no ready NAEI tasks" }, 404);
    const taskId = queued[0]!.id;
    void naei.executeOne().then(
      (r) => logger.info("naei", "background execution finished", { taskId, status: r.ok ? r.value.status : r.error.message }),
      (e) => logger.error("naei", "background execution crashed", { taskId, error: String(e).slice(0, 300) }),
    );
    return c.json({ data: { started: true, taskId } }, 202);
  });
  app.get("/naei/tasks", (c) => c.json({ data: naei.tasks.list() }));
  app.get("/naei/tasks/:id", (c) => {
    const t = naei.tasks.get(c.req.param("id"));
    return t ? c.json({ data: t }) : c.json({ error: "not_found" }, 404);
  });
  app.post("/naei/tasks/:id/approve", requireOwner, (c) => {
    const r = naei.approve(c.req.param("id"), "owner");
    return c.json({ data: r.ok ? r.value : null, error: r.ok ? undefined : r.error.message });
  });
  app.post("/naei/tasks/:id/commit", requireOwner, (c) => {
    const r = naei.commit(c.req.param("id"));
    return c.json({ data: r.ok ? r.value : null, error: r.ok ? undefined : r.error.message });
  });

  // -- WORLD -------------------------------------------------------------------
  app.get("/world/state", (c) => {
    const worlds = worldRuntime.store.listWorlds();
    if (worlds.length === 0) return c.json({ error: "not_found" }, 404);
    const w = worlds[0]!;
    return c.json({
      data: {
        world: w,
        residents: worldRuntime.store.listResidents(w.id).length,
        properties: worldRuntime.store.listProperties(w.id).length,
        businesses: worldRuntime.store.listBusinesses(w.id).length,
        vehicles: worldRuntime.store.listVehicles(w.id).length,
        economy: worldRuntime.economy.moneySupply(w.id),
        events: db.count("SELECT COUNT(*) AS n FROM world_events WHERE world_id = ?", w.id),
      },
    });
  });
  app.post("/world/advance", requireOwner, async (c) => {
    const parse = AdvanceWorldRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parse.success) return c.json({ error: "validation", issues: parse.error.issues }, 400);
    const worlds = worldRuntime.store.listWorlds();
    if (worlds.length === 0) return c.json({ error: "not_found" }, 404);
    const world = worlds[0]!;
    // one tick step = 10 sim-minutes (600_000 sim-ms): honor both request forms
    const ticks = parse.data.ticks ?? Math.max(1, Math.ceil((parse.data.simDurationMs ?? 600_000) / 600_000));
    const report = worldRuntime.simulation.advance(world, { ticks });
    return c.json({ data: report });
  });
  app.get("/world/residents", (c) => {
    const worlds = worldRuntime.store.listWorlds();
    return c.json({ data: worldRuntime.store.listResidents(worlds[0]?.id ?? "") });
  });
  app.get("/world/residents/:id", (c) => {
    const r = worldRuntime.store.getResident(c.req.param("id"));
    return r ? c.json({ data: r, knowledge: worldRuntime.life.residentKnowledge(r.worldId, r).slice(0, 20) }) : c.json({ error: "not_found" }, 404);
  });
  app.get("/world/events", (c) => {
    const worlds = worldRuntime.store.listWorlds();
    const limit = Number(c.req.query("limit") ?? 50);
    const type = c.req.query("type") ?? undefined;
    return c.json({ data: worldRuntime.store.events(worlds[0]?.id ?? "", { limit, type }) });
  });
  app.post("/world/snapshot", requireOwner, (c) => {
    const worlds = worldRuntime.store.listWorlds();
    if (worlds.length === 0) return c.json({ error: "not_found" }, 404);
    const r = worldRuntime.store.snapshot(worlds[0]!.id, "manual");
    return c.json({ data: r.ok ? r.value : null, error: r.ok ? undefined : r.error.message });
  });
  app.post("/world/construct", requireOwner, async (c) => {
    const worlds = worldRuntime.store.listWorlds();
    if (worlds.length === 0) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => ({}));
    const r = worldRuntime.creation.construct(worlds[0]!, String(body.request ?? ""));
    return c.json({ data: r.ok ? { spec: r.value.spec, created: r.value.created, eventId: r.value.event.id } : null, error: r.ok ? undefined : r.error.message });
  });

  // -- MCP -----------------------------------------------------------------------
  app.get("/mcp/servers", async (c) => c.json({ data: await mcp.healthCheck() }));
  app.get("/mcp/servers/:name/tools", async (c) => {
    const name = c.req.param("name");
    let entry = mcp.get(name);
    if (!entry || entry.tools.length === 0) {
      const conn = await mcp.connect(name);
      if (!conn.ok) return c.json({ error: conn.error.message }, 502);
      entry = mcp.get(name)!;
    }
    return c.json({ data: entry.tools });
  });
  app.post("/mcp/register", requireOwner, async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "validation" }, 400);
    const r = mcp.register(body);
    return c.json({ data: r.ok ? r.value : null, error: r.ok ? undefined : r.error.message }, r.ok ? 201 : 400);
  });
  app.post("/mcp/invoke", requireOwner, async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.serverName || !body?.toolName) return c.json({ error: "validation" }, 400);
    const r = await mcp.invoke({
      serverName: body.serverName, toolName: body.toolName,
      args: body.args ?? {}, approvedBy: "owner",
    }, "owner");
    return c.json({ data: r.ok ? r.value : null, error: r.ok ? undefined : r.error.message }, r.ok ? 200 : 400);
  });
  app.get("/mcp/audit", requireOwner, (c) => c.json({ data: mcp.auditLog({ limit: Number(c.req.query("limit") ?? 50) }) }));

  // -- MEMORY ---------------------------------------------------------------------
  app.get("/memory/:scope", requireOwner, (c) => c.json({ data: memory.listScope(c.req.param("scope")).slice(0, 100) }));
  app.post("/memory", requireOwner, async (c) => {
    // zod-validated: tier/kind enums enforced, importance/confidence bounded,
    // string lengths capped — the previous hand-rolled parsing accepted
    // arbitrary tier strings and NaN importance
    const parse = CreateMemoryRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parse.success) return c.json({ error: "validation", issues: parse.error.issues }, 400);
    const m = memory.create({
      scope: parse.data.scope, tier: parse.data.tier, kind: parse.data.kind,
      title: parse.data.title, content: parse.data.content,
      importance: parse.data.importance, confidence: parse.data.confidence,
      tags: parse.data.tags, accessLevel: parse.data.accessLevel,
      source: parse.data.provenance.source, sourceId: parse.data.provenance.sourceId,
      expiresAt: parse.data.expiresAt,
    });
    return c.json({ data: m }, 201);
  });
  app.post("/memory/:scope/consolidate", requireOwner, (c) => {
    return c.json({ data: memory.consolidate(c.req.param("scope")) });
  });

  // -- MODELS -----------------------------------------------------------------------
  app.get("/models/providers", (c) => c.json({ data: providers }));
  app.get("/models/catalog", (c) => c.json({ data: fabric.listModels() }));
  app.get("/models/health", (c) => c.json({ data: fabric.providerHealth() }));

  // -- RAILWAY (infrastructure intelligence) -----------------------------------------
  // Public: cached monitoring snapshot (non-blocking, fail-visible).
  // Evidence details are owner-only — the public view carries statuses, not topology.
  app.get("/railway/status", (c) => {
    const report = railway.latestMonitoring();
    if (!report) return c.json({ data: null, note: "no monitoring cycle executed yet — POST /railway/monitor (owner) to run one" });
    return c.json({
      data: {
        asOf: report.asOf,
        overall: report.overall,
        dimensions: report.dimensions.map((d) => ({ dimension: d.dimension, status: d.status, detail: d.detail })),
      },
    });
  });
  app.post("/railway/monitor", requireOwner, async (c) => {
    const report = await railway.runMonitoringCycle();
    return c.json({ data: report });
  });
  app.get("/railway/discovery", requireOwner, async (c) => {
    const r = await railway.discovery.discoverAll();
    return r.ok ? c.json({ data: r.value }) : c.json({ error: r.error.toJSON() }, 502);
  });
  app.get("/railway/usage", requireOwner, async (c) => {
    const snap = await railway.discovery.discoverAll();
    const r = await railway.usage.report(snap.ok ? snap.value : null);
    return r.ok ? c.json({ data: r.value }) : c.json({ error: r.error.toJSON() }, 502);
  });
  app.get("/railway/credentials/status", requireOwner, (c) =>
    c.json({ data: railway.credentials.fullStatus(), mode: railway.mode }));
  app.post("/railway/contract/check", requireOwner, async (c) => {
    const live = await introspectLiveFields(railway.client);
    if (!live.ok) return c.json({ error: live.error.toJSON() }, 502);
    const drifts = diffContract(live.value);
    return c.json({ data: { compatible: contractIsCompatible(drifts), drifts } });
  });
  app.get("/railway/events", requireOwner, (c) =>
    c.json({ data: railway.events.list({ limit: Number(c.req.query("limit") ?? 100) }) }));
  app.get("/railway/audit", requireOwner, (c) => {
    const chainVerification = c.req.query("verify") === "true" ? railway.audit.verify() : undefined;
    return c.json({ data: railway.audit.query({ limit: Number(c.req.query("limit") ?? 100) }), chainVerification });
  });
  app.get("/railway/backups", requireOwner, async (c) => {
    const snap = await railway.discovery.discoverAll();
    if (!snap.ok) return c.json({ error: snap.error.toJSON() }, 502);
    return c.json({ data: await railway.backup.report(snap.value) });
  });
  app.post("/railway/backup/export", requireOwner, (c) => {
    // app-level logical backup of THIS deployment's own store + isolated restore verification
    const doc = BackupService.exportLogicalBackup(db);
    const verification = BackupService.verifyLogicalBackup(doc);
    const dir = join(cfg.workspaceRoot, "backups");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${doc.exportedAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(doc));
    return c.json({ data: { file, tables: doc.tables.length, rows: doc.tables.reduce((n, t) => n + t.rows, 0), verification } }, 201);
  });
  app.post("/railway/reconcile", requireOwner, async (c) => {
    const r = await railway.reconciliation.reconcile();
    return r.ok ? c.json({ data: r.value }) : c.json({ error: r.error.toJSON() }, 502);
  });
  app.get("/railway/reconciliation", requireOwner, (c) => c.json({ data: railway.reconciliation.history() }));
  app.post("/railway/diagnose", requireOwner, async (c) => {
    const parse = RailwayDiagnoseRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parse.success) return c.json({ error: "validation", issues: parse.error.issues }, 400);
    const r = await railway.diagnostics.investigate({ kind: parse.data.trigger, resourceIds: parse.data.resourceIds, note: parse.data.note });
    return r.ok ? c.json({ data: r.value }, 201) : c.json({ error: r.error.toJSON() }, 502);
  });
  app.get("/railway/investigations/:id", requireOwner, (c) => {
    const inv = railway.diagnostics.getInvestigation(c.req.param("id"));
    return inv ? c.json({ data: inv }) : c.json({ error: "not_found" }, 404);
  });
  app.post("/railway/intelligence", requireOwner, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const r = await railway.intelligence.ask(String(body?.question ?? ""));
    return r.ok ? c.json({ data: r.value }) : c.json({ error: r.error.toJSON() }, 502);
  });
  app.get("/railway/operations", requireOwner, (c) =>
    c.json({ data: railway.authorization.listOperations(), readOnly: railway.authorization.isReadOnly() }));
  app.post("/railway/recovery/plan", requireOwner, async (c) => {
    const parse = RailwayRecoveryPlanRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parse.success) return c.json({ error: "validation", issues: parse.error.issues }, 400);
    const inv = railway.diagnostics.getInvestigation(parse.data.investigationId);
    if (!inv) return c.json({ error: "not_found" }, 404);
    const r = railway.recovery.createPlan(inv);
    return r.ok ? c.json({ data: r.value }, 201) : c.json({ error: r.error.toJSON() }, 400);
  });
  app.post("/railway/recovery/authorize", requireOwner, async (c) => {
    // The principal is ALWAYS the owner (this route is owner-bearer-authenticated);
    // a client-supplied principal claim must never be trusted.
    const parse = RailwayAuthorizationRequestSchema.omit({ principal: true }).safeParse(await c.req.json().catch(() => ({})));
    if (!parse.success) return c.json({ error: "validation", issues: parse.error.issues }, 400);
    const decision = railway.authorization.requestAuthorization({ ...parse.data, principal: { type: "user", id: "owner" } });
    return c.json({ data: decision }, decision.granted ? 201 : 403);
  });
  app.post("/railway/recovery/execute", requireOwner, async (c) => {
    const parse = RailwayExecuteRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parse.success) return c.json({ error: "validation", issues: parse.error.issues }, 400);
    const r = await railway.recovery.execute(parse.data.planId, parse.data.grantId, "owner");
    return r.ok ? c.json({ data: r.value }) : c.json({ error: r.error.toJSON() }, r.error.kind === "READ_ONLY" || r.error.kind === "PERMISSION" ? 403 : 400);
  });
  app.get("/railway/recovery/plans/:id", requireOwner, (c) => {
    const plan = railway.recovery.getPlan(c.req.param("id"));
    return plan ? c.json({ data: plan }) : c.json({ error: "not_found" }, 404);
  });
  app.post("/railway/webhook", async (c) => {
    // Authenticated by the per-project webhook secret (constant-time), not the
    // owner bearer key: Railway's webhook sender cannot present the owner key.
    // Events are prompts, not truth — each is reconciled against the API.
    const body = await c.req.text();
    const r = await railway.webhook.handle({ "x-webhook-secret": c.req.header("X-Webhook-Secret") }, body);
    if (!r.ok) {
      const status = r.error.kind === "AUTH" ? 401 : r.error.kind === "UNCONFIGURED" ? 503 : r.error.kind === "VALIDATION" ? 400 : 500;
      return c.json({ error: r.error.toJSON() }, status as 401 | 503 | 400 | 500);
    }
    return c.json({ data: r.value }, r.value.duplicate ? 200 : 202);
  });

  return { app, db, orchestrator, naei, worldRuntime, mcp, memory, fabric, logger, metrics, health, railway, tools };
}

export type NexusApp = ReturnType<typeof createApp>;
