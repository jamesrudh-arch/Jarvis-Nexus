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
import { mkdirSync, writeFileSync, readdirSync, statSync, rmSync, readFileSync, existsSync, openSync, writeSync, fsyncSync, closeSync, renameSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { join, basename } from "node:path";
import type { LogicalBackupDoc } from "@nexus/railway";

export interface NexusApiConfig {
  dbPath: string;
  workspaceRoot: string;
  env: Record<string, string | undefined>;
  /** Test seam: inject a MOCKED Railway transport (never used in production wiring). */
  railwayFetchFn?: typeof fetch;
  /** Test seam (Stage 2.4B): injectable clock for DETERMINISTIC time control in
   * rate-limit/lockout tests. Production uses Date.now(). */
  nowFn?: () => number;
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
    // Stage 2 Phase 3: honest semantics — report CONFIGURED providers, never
    // "available" (configuration is not verification; use POST /models/verify).
    const status = fabric.providerStatus();
    const configured = status.filter((s) => s.configured);
    const realProviders = configured.filter((s) => s.provider !== "echo");
    const verifiedReal = realProviders.filter((s) => s.verified === true);
    const providerList = configured.map((s) => `${s.provider}:configured${s.verified === true ? "+verified" : s.verified === false ? "+verify-failed" : ""}`).join(",");
    return {
      component: "model_fabric",
      status: realProviders.length === 0 ? "degraded" : verifiedReal.length > 0 ? "healthy" : "degraded",
      detail: `providers: ${providerList || "none"}; verification via POST /models/verify (owner)`,
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

  // CORS allowlist (Stage 2 Phase 3): least-privilege default — NO cross-origin
  // access unless the owner explicitly lists origins in CORS_ALLOWED_ORIGINS
  // (comma-separated exact origins, e.g. https://jarvis-nexus-production.up.railway.app).
  const corsAllowedOrigins = (cfg.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (corsAllowedOrigins.length > 0) {
    app.use("*", cors({
      // Hono 4: origin-as-function receives (origin, context) and RETURNS the
      // allowed origin (or undefined to deny). Exact-match allowlist only.
      origin: (origin: string) => (corsAllowedOrigins.includes(origin) ? origin : undefined),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Webhook-Secret", "X-Correlation-Id"],
      maxAge: 86400,
    }));
  }
  // When unset: no CORS middleware at all — same-origin only. The Railway
  // webhook is server-to-server and never needs CORS.

  // Rate limiting (Stage 2 Phase 3): in-memory fixed window per client IP.
  // Railway terminates TLS and provides X-Forwarded-For; first hop is the client.
  // Three independent budgets (Stage 2.4B hardened):
  //  - GLOBAL (default 240/min): every route. Generous for the owner's
  //    interactive use; caps abuse and metric/log spam.
  //  - AUTH-FAIL (default 60/min per identity): failed owner-auth attempts.
  //  - AUTH-FAIL-GLOBAL (default 300/min across ALL identities, Stage 2.4B):
  //    bounds TOTAL failed-auth throughput so rotating the client-controlled
  //    identity header cannot multiply the brute-force budget (F-2.4A-02).
  // Lockout semantics: an exhausted auth-fail budget locks out ALL protected
  // routes for that identity for the remainder of the window — even valid
  // tokens are refused while locked — but never public routes (health,
  // metrics, world state stay readable; a brute-forcing identity must not
  // blind Railway healthchecks or public state).
  const now = cfg.nowFn ?? (() => Date.now());
  const RATE_LIMIT_PER_MIN = Math.max(1, Number(cfg.env.RATE_LIMIT_PER_MIN ?? 240));
  const AUTH_FAIL_LIMIT_PER_MIN = Math.max(1, Number(cfg.env.AUTH_FAIL_LIMIT_PER_MIN ?? 60));
  const AUTH_FAIL_GLOBAL_LIMIT_PER_MIN = Math.max(1, Number(cfg.env.AUTH_FAIL_GLOBAL_LIMIT_PER_MIN ?? 300));
  const AUTH_WINDOW_MS = 60_000;
  // The global backstop lives in the same map under a reserved key. A client
  // literally sending "__global__" as its X-Forwarded-For identity would alias
  // this entry — every consequence of that alias is STRICTER (its failures
  // would double-count against the shared budget), never looser. Benign by
  // design; documented here so it is not rediscovered as a mystery.
  const GLOBAL_AF_KEY = "authfail:__global__";
  const rateBuckets = new Map<string, { windowStart: number; count: number }>();
  const authFailBuckets = new Map<string, { windowStart: number; count: number }>();
  const clientIpOf = (c: any): string => {
    const xff = String(c.req.header("X-Forwarded-For") ?? "");
    const first = xff.split(",")[0]?.trim();
    return first || c.req.header("X-Real-IP") || "unknown";
  };
  const hitBucket = (buckets: Map<string, { windowStart: number; count: number }>, key: string, limit: number, nowMs: number): { allowed: boolean; retryAfterSec: number } => {
    const WINDOW_MS = 60_000;
    let b = buckets.get(key);
    if (!b || nowMs - b.windowStart >= WINDOW_MS) {
      b = { windowStart: nowMs, count: 0 };
      buckets.set(key, b);
    }
    if (b.count >= limit) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((b.windowStart + WINDOW_MS - nowMs) / 1000)) };
    }
    b.count += 1;
    return { allowed: true, retryAfterSec: 0 };
  };
  // opportunistic sweep so the maps cannot grow without bound under IP churn
  const sweepBuckets = (buckets: Map<string, { windowStart: number; count: number }>, nowMs: number) => {
    if (buckets.size < 10_000) return;
    for (const [k, b] of buckets) if (nowMs - b.windowStart >= 120_000) buckets.delete(k);
  };
  app.use("*", async (c: any, next: any) => {
    const nowMs = now();
    sweepBuckets(rateBuckets, nowMs);
    sweepBuckets(authFailBuckets, nowMs);
    const ip = clientIpOf(c);
    const r = hitBucket(rateBuckets, ip, RATE_LIMIT_PER_MIN, nowMs);
    if (!r.allowed) {
      return c.json({ error: "rate_limited" }, 429, { "Retry-After": String(r.retryAfterSec) });
    }
    // NOTE: the auth-fail budget is enforced inside requireOwner (protected
    // routes only) — public routes are never collateral damage of lockout.
    await next();
  });

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
    const ip = clientIpOf(c);
    const nowMs = now();
    // ---- per-identity lockout, WITH window expiry (Stage 2.4B, F-2.4A-01) ----
    // Pre-fix, this check had no expiry clause: once count >= limit, the
    // identity stayed locked FOREVER — the only reset lived inside hitBucket
    // on the failed-auth path, which is unreachable while locked, so recovery
    // required a process restart (independently reproduced against main
    // 6a788348: valid key still 429 70 s after the last failure).
    const afKey = `authfail:${ip}`;
    const af = authFailBuckets.get(afKey);
    if (af) {
      if (nowMs - af.windowStart < AUTH_WINDOW_MS) {
        if (af.count >= AUTH_FAIL_LIMIT_PER_MIN) {
          // fail-closed while the window is live: even a VALID token is
          // refused — that is what makes brute force pointless
          const retry = Math.max(1, Math.ceil((af.windowStart + AUTH_WINDOW_MS - nowMs) / 1000));
          return c.json({ error: "rate_limited" }, 429, { "Retry-After": String(retry), "x-lockout-scope": "identity" });
        }
      } else {
        // window expired: reset safely. This whole section is synchronous
        // (no await between read and delete), so concurrent requests can
        // never observe a half-reset state — and the next failed attempt
        // re-opens a FRESH window via hitBucket.
        authFailBuckets.delete(afKey);
      }
    }
    // ---- global backstop, identical expiry semantics ----
    const g = authFailBuckets.get(GLOBAL_AF_KEY);
    if (g) {
      if (nowMs - g.windowStart < AUTH_WINDOW_MS) {
        if (g.count >= AUTH_FAIL_GLOBAL_LIMIT_PER_MIN) {
          const retry = Math.max(1, Math.ceil((g.windowStart + AUTH_WINDOW_MS - nowMs) / 1000));
          return c.json({ error: "rate_limited" }, 429, { "Retry-After": String(retry), "x-lockout-scope": "global" });
        }
      } else {
        authFailBuckets.delete(GLOBAL_AF_KEY);
      }
    }
    const auth = c.req.header("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!ownerKey || !token || !tokenMatches(token, ownerKey)) {
      // failed auth consumes BOTH budgets for this identity
      hitBucket(authFailBuckets, afKey, AUTH_FAIL_LIMIT_PER_MIN, nowMs);
      hitBucket(authFailBuckets, GLOBAL_AF_KEY, AUTH_FAIL_GLOBAL_LIMIT_PER_MIN, nowMs);
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
    const residents = worldRuntime.store.listResidents(w.id);
    const actionDistribution: Record<string, number> = {};
    for (const r of residents) {
      actionDistribution[r.currentActivity] = (actionDistribution[r.currentActivity] ?? 0) + 1;
    }
    return c.json({
      data: {
        world: w,
        residents: residents.length,
        properties: worldRuntime.store.listProperties(w.id).length,
        businesses: worldRuntime.store.listBusinesses(w.id).length,
        vehicles: worldRuntime.store.listVehicles(w.id).length,
        economy: worldRuntime.economy.moneySupply(w.id),
        economyRecent: worldRuntime.economy.transactionLog(w.id, 8),
        events: db.count("SELECT COUNT(*) AS n FROM world_events WHERE world_id = ?", w.id),
        memories: db.count("SELECT COUNT(*) AS n FROM memories"),
        actionDistribution,
        recentEvents: worldRuntime.store.events(w.id, { limit: 10 }),
      },
    });
  });
  // Stage 2 Phase 5 V2/V3: layout geometry for the 3D world view — regions,
  // properties (positions/types) and businesses, straight from the store.
  app.get("/world/layout", (c) => {
    const worlds = worldRuntime.store.listWorlds();
    if (worlds.length === 0) return c.json({ error: "not_found" }, 404);
    const w = worlds[0]!;
    return c.json({
      data: {
        worldId: w.id,
        regions: w.regions,
        properties: worldRuntime.store.listProperties(w.id).map((p) => ({
          id: p.id, type: p.type, regionId: p.regionId, location: p.location,
          valuation: p.valuation, ownerId: p.ownerId ?? null,
        })),
        businesses: worldRuntime.store.listBusinesses(w.id).map((b) => ({
          id: b.id, name: b.name, kind: b.kind, regionId: b.regionId,
          openHours: b.openHours,
        })),
        roads: [],
        note: "road graph not yet represented in the backend store — honest empty array",
      },
    });
  });
  app.post("/world/advance", requireOwner, async (c) => {
    // Phase 9 adversarial finding: malformed JSON must be a 400, never silently
    // coerced to {} (which would default ticks=1 and advance the world on garbage)
    const raw = await c.req.json().catch(() => undefined);
    if (raw === undefined || raw === null || typeof raw !== "object") {
      return c.json({ error: "malformed_json" }, 400);
    }
    const parse = AdvanceWorldRequest.safeParse(raw);
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
    // malformed JSON is a 400 — construction must never run on garbage input
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined || body === null || typeof body !== "object") {
      return c.json({ error: "malformed_json" }, 400);
    }
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
  app.get("/models/providers", (c) => c.json({ data: fabric.activeProviderIds() }));
  app.get("/models/catalog", (c) => c.json({ data: fabric.listModels() }));
  // Stage 2 Phase 3 — honest health semantics: provider-level status (configured
  // vs verified vs never-probed) PLUS the pre-existing per-model runtime records.
  // An empty per-model list on a fresh boot is expected and now no longer reads
  // as "no health".
  app.get("/models/health", (c) => c.json({
    data: fabric.providerHealth(),
    providers: fabric.providerStatus(),
    semantics: "data[] = per-model runtime records (empty until first call); providers[] = configured/verified provider status; POST /models/verify (owner) runs live round-trips",
  }));
  // Owner-gated live provider verification — honest credential checks. This is
  // how the OpenAI configuration question ("is the key actually valid?") is
  // answered with evidence instead of assumptions.
  app.post("/models/verify", requireOwner, async (c) => {
    const results = await fabric.verifyProviders();
    return c.json({ data: results });
  });

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
    const volumeReport = await railway.backup.report(snap.value);
    // Layer 2 (Stage 2 Phase 4): application-level logical backup status —
    // schedule, retention, history and last verification outcome.
    const logical = listLogicalBackups();
    return c.json({ data: { ...volumeReport, logical } });
  });
  app.post("/railway/backup/export", requireOwner, (c) => {
    // app-level logical backup of THIS deployment's own store + isolated restore
    // verification. Stage 2.4B: a failed verification writes NO artifact and the
    // route answers 500 — a bad backup is never persisted anywhere.
    const result = runLogicalBackup();
    if (!result.ok) return c.json({ error: "backup_failed", data: result }, 500);
    return c.json({ data: result }, 201);
  });
  app.post("/railway/backup/restore", requireOwner, async (c) => {
    // Stage 2.2 (G-01): productized restore-verification. NON-DESTRUCTIVE by
    // construction: the backup is restored into an ISOLATED verification
    // database under <workspaceRoot>/restore-verifications/. The live store
    // is never touched by this route. Destructive restores are CLI-only and
    // require --confirm-destructive (apps/nexus-api/src/restore-cli.ts).
    const body = (await c.req.json().catch(() => ({}))) as { file?: string };
    const name = String(body.file ?? "");
    if (!/^[\w-]+\.json$/.test(name)) return c.json({ error: "validation", detail: "file must be a backup filename from the backup directory" }, 400);
    const src = join(backupDir, name);
    if (!existsSync(src)) return c.json({ error: "not_found", detail: "no such backup in the backup directory" }, 404);
    let doc: LogicalBackupDoc;
    let encrypted = false;
    try {
      const parsed: unknown = JSON.parse(readFileSync(src, "utf8"));
      const decoded = BackupService.decodeBackupDoc(parsed, encKeyInfo.configured && encKeyInfo.key ? encKeyInfo.key : null);
      doc = decoded.doc;
      encrypted = decoded.encrypted;
    } catch (e) {
      return c.json({ error: "validation", detail: `backup could not be decoded: ${e instanceof Error ? e.message : String(e)}` }, 400);
    }
    const id = `restore-${Date.now()}`;
    const dir = join(cfg.workspaceRoot, "restore-verifications", id);
    mkdirSync(dir, { recursive: true });
    const targetPath = join(dir, "nexus.db");
    const target = NexusDb.open(targetPath);
    let report;
    try {
      report = BackupService.restoreLogicalBackup(target, doc);
    } finally {
      const logPath = join(dir, "restore-log.json");
      writeFileSync(logPath, JSON.stringify({ id, source: src, target: targetPath, generatedAt: new Date().toISOString(), encrypted, report }, null, 2));
      target.close();
    }
    return c.json({ data: { id, source: src, target: targetPath, log: join(dir, "restore-log.json"), encrypted, report } }, report.restored ? 200 : 422);
  });
  app.get("/railway/backup/export/:file/download", requireOwner, (c) => {
    // Stage 2.2 (G-03 minimal): owner-gated off-volume export enabler —
    // streams a backup artifact with integrity headers so the owner can
    // copy it off-site. No provider assumed; no recurring cost.
    const name = c.req.param("file");
    if (!/^[\w-]+\.json$/.test(name)) return c.json({ error: "validation", detail: "invalid backup filename" }, 400);
    const src = join(backupDir, name);
    if (!existsSync(src)) return c.json({ error: "not_found" }, 404);
    const bytes = statSync(src).size;
    const sha256 = createHash("sha256").update(readFileSync(src)).digest("hex");
    const fmt = BackupService.peekBackupFormat(src);
    return c.body(readFileSync(src), 200, {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${name}"`,
      "x-backup-sha256": sha256,
      "x-backup-bytes": String(bytes),
      "x-backup-encrypted": fmt === "encrypted" ? "true" : "false",
    });
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
  // -- BACKUP SCHEDULER (Stage 2 Phase 4; hardened Stage 2.4B, F-2.4A-06) ------
  // Application-level logical backups: snapshot-consistent export -> REAL
  // isolated restore-verify (a backup that has never been restored is not
  // proven recoverable) -> ATOMIC on-volume write (<file>.tmp + fsync +
  // rename: an interrupted run can never leave a half-written artifact) ->
  // verified ENCRYPTED off-volume copy when configured -> two-sided retention
  // pruning. In-process timer is correct for this single-instance deployment;
  // a future multi-instance topology must externalise the schedule.
  const backupDir = join(cfg.workspaceRoot, "backups");
  const BACKUP_INTERVAL_HOURS = Math.max(0, Number(cfg.env.NEXUS_BACKUP_INTERVAL_HOURS ?? 24));
  const BACKUP_RETENTION = Math.max(1, Number(cfg.env.NEXUS_BACKUP_RETENTION ?? 14));
  // Stage 2.2 (G-03 minimal): off-volume copy target for the newest backup.
  // Zero-cost, provider-independent; effective on Railway when another
  // volume/mount is attached. S3/object-storage push stays owner-gated (D-2.1-03).
  const OFFSITE_DIR = (cfg.env.NEXUS_BACKUP_OFFSITE_DIR ?? "").trim();
  // Stage 2.4B (F-2.4A-06): off-volume artifacts are ALWAYS encrypted — a
  // plaintext copy must never leave the volume. Without a valid key the
  // off-volume copy is SKIPPED with a visible alert instead (never silent).
  const encKeyInfo = BackupService.parseBackupEncryptionKey(cfg.env.NEXUS_BACKUP_ENCRYPTION_KEY);
  // Stage 2.4B: optional zero-cost alert webhook (owner-chosen URL, opt-in).
  // The URL itself is never logged or exposed in any status view.
  const ALERT_WEBHOOK_URL = (cfg.env.NEXUS_ALERT_WEBHOOK_URL ?? "").trim();

  const backupAlerts: Array<{ at: string; code: string; detail: string }> = [];
  let lastWebhookDelivery: { at: string; ok: boolean; status?: number; error?: string } | null = null;
  const recordBackupAlert = (code: string, detail: string): void => {
    backupAlerts.push({ at: new Date().toISOString(), code, detail });
    if (backupAlerts.length > 20) backupAlerts.splice(0, backupAlerts.length - 20);
    metrics.increment("backup_failures_total", { code });
    logger.error?.("backup", `backup alert: ${code}`, { detail });
    if (ALERT_WEBHOOK_URL) {
      fetch(ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "backup.alert", at: new Date().toISOString(), code, detail }),
        signal: AbortSignal.timeout(5_000),
      }).then(
        (r) => { lastWebhookDelivery = { at: new Date().toISOString(), ok: true, status: r.status }; },
        (e) => { lastWebhookDelivery = { at: new Date().toISOString(), ok: false, error: String((e as Error)?.name ?? e) }; },
      );
    }
  };
  if (encKeyInfo.invalid) {
    // surfaced at boot so a typo'd key cannot silently disable off-volume
    // protection; visible on every listing until fixed.
    recordBackupAlert("OFFSITE_KEY_INVALID", `${encKeyInfo.error ?? "invalid NEXUS_BACKUP_ENCRYPTION_KEY"}; off-volume copies are disabled until it is fixed (on-volume backups continue as plaintext v1 with this alert visible)`);
  }

  /** Atomic durable write (Stage 2.4B): tmp file -> fsync -> rename. A crash
   * between any two steps can only leave a complete file or a junk .tmp —
   * never a truncated artifact under the real name. */
  const atomicWrite = (path: string, bytes: Buffer): void => {
    const tmp = `${path}.tmp`;
    const fd = openSync(tmp, "w");
    try {
      let off = 0;
      while (off < bytes.length) off += writeSync(fd, bytes, off);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  };

  /** Retention + stale-tmp sweep shared by both volumes (Stage 2.4B).
   * `*.json.tmp` junk (remnants of interrupted runs) is removed
   * unconditionally — it can never be a valid backup. */
  const pruneBackupDir = (dir: string, keep: number): { pruned: number; tmpSwept: number } => {
    let pruned = 0;
    let tmpSwept = 0;
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".json.tmp")) { rmSync(join(dir, f), { force: true }); tmpSwept += 1; }
      }
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const old of files.slice(keep)) {
        rmSync(join(dir, old.f), { force: true });
        pruned += 1;
      }
    } catch { /* directory may not exist yet — nothing to prune */ }
    return { pruned, tmpSwept };
  };

  interface BackupRunResult {
    ok: boolean;
    code?: string;
    file: string;
    tables: number;
    rows: number;
    rowsMatched?: boolean;
    encrypted: boolean;
    verification: ReturnType<typeof BackupService.verifyLogicalBackup> | null;
    pruned: number;
    tmpSwept: number;
    prunedOffsite: number;
    offsite: { dir: string; copied: boolean; encrypted: boolean; file?: string; error?: string } | null;
  }
  let lastBackupRun: (BackupRunResult & { at?: string }) | null = null;
  let backupInFlight = false;

  const runLogicalBackup = (): BackupRunResult => {
    if (backupInFlight) {
      // Unreachable today (the whole run is synchronous); guards a future
      // async refactor from interleaving two runs. Honest refusal, never a queue.
      throw new Error("backup run overlap refused: another run is in flight");
    }
    backupInFlight = true;
    try {
      // 1) snapshot-consistent export
      let doc: LogicalBackupDoc;
      try {
        doc = BackupService.exportLogicalBackup(db);
      } catch (e) {
        recordBackupAlert("EXPORT_FAILED", String(e));
        return { ok: false, code: "EXPORT_FAILED", file: "", tables: 0, rows: 0, encrypted: false, verification: null, pruned: 0, tmpSwept: 0, prunedOffsite: 0, offsite: null };
      }
      const rows = doc.tables.reduce((n, t) => n + t.rows, 0);
      // 2) REAL isolated restore verification — the gate: a failed
      //    verification writes NO artifact anywhere.
      const verification = BackupService.verifyLogicalBackup(doc);
      if (!verification.rowsMatched || verification.contentMatched === false) {
        recordBackupAlert("VERIFY_FAILED", `isolated restore verification failed (rowsMatched=${verification.rowsMatched}, contentMatched=${verification.contentMatched}); NO backup artifact was written`);
        return { ok: false, code: "VERIFY_FAILED", file: "", tables: doc.tables.length, rows, encrypted: false, verification, pruned: 0, tmpSwept: 0, prunedOffsite: 0, offsite: null };
      }
      // 3) encode — AES-256-GCM envelope when a key is configured; honest
      //    plaintext v1 on-volume otherwise (see the offsite rule below)
      const encKey = encKeyInfo.configured ? encKeyInfo.key : undefined;
      const encrypted = encKey !== undefined;
      const bytes = Buffer.from(JSON.stringify(encrypted ? BackupService.encryptBackupDoc(doc, encKey) : doc), "utf8");
      // 4) atomic on-volume write
      mkdirSync(backupDir, { recursive: true });
      const file = join(backupDir, `${doc.exportedAt.replace(/[:.]/g, "-")}.json`);
      try {
        atomicWrite(file, bytes);
      } catch (e) {
        recordBackupAlert("WRITE_FAILED", `${String(e)} (on-volume artifact NOT written)`);
        return { ok: false, code: "WRITE_FAILED", file, tables: doc.tables.length, rows, encrypted, verification, pruned: 0, tmpSwept: 0, prunedOffsite: 0, offsite: null };
      }
      // 5) off-volume copy — encrypted ONLY, verified by read-back hash
      let offsite: BackupRunResult["offsite"] = null;
      let prunedOffsite = 0;
      if (OFFSITE_DIR) {
        if (!encrypted) {
          recordBackupAlert("OFFSITE_SKIPPED_NO_KEY", "NEXUS_BACKUP_OFFSITE_DIR is configured but no valid NEXUS_BACKUP_ENCRYPTION_KEY is set; off-volume copy SKIPPED — a plaintext artifact must never leave the volume");
          offsite = { dir: OFFSITE_DIR, copied: false, encrypted: false, error: "no valid encryption key configured" };
        } else {
          try {
            mkdirSync(OFFSITE_DIR, { recursive: true });
            const dest = join(OFFSITE_DIR, basename(file));
            atomicWrite(dest, bytes);
            const srcHash = createHash("sha256").update(bytes).digest("hex");
            const destHash = createHash("sha256").update(readFileSync(dest)).digest("hex");
            if (srcHash !== destHash) {
              rmSync(dest, { force: true });
              recordBackupAlert("OFFSITE_VERIFY_MISMATCH", "off-volume copy failed read-back hash verification; the suspect copy was deleted");
              offsite = { dir: OFFSITE_DIR, copied: false, encrypted: true, error: "read-back hash mismatch" };
            } else {
              offsite = { dir: OFFSITE_DIR, copied: true, encrypted: true, file: dest };
              prunedOffsite = pruneBackupDir(OFFSITE_DIR, BACKUP_RETENTION).pruned;
            }
          } catch (e) {
            recordBackupAlert("OFFSITE_COPY_FAILED", String(e));
            offsite = { dir: OFFSITE_DIR, copied: false, encrypted: true, error: String(e) };
          }
        }
      }
      // 6) on-volume retention + junk sweep
      const onVol = pruneBackupDir(backupDir, BACKUP_RETENTION);
      const result: BackupRunResult = {
        ok: true,
        file, tables: doc.tables.length, rows, rowsMatched: true, encrypted, verification,
        pruned: onVol.pruned, tmpSwept: onVol.tmpSwept, prunedOffsite,
        offsite,
      };
      lastBackupRun = { ...result, at: doc.exportedAt };
      metrics.increment("backup_runs_total", { result: "success" });
      logger.info("backup", "logical backup executed", {
        file, rowsMatched: true, pruned: onVol.pruned, tmpSwept: onVol.tmpSwept, prunedOffsite,
        encrypted, offsiteCopied: offsite?.copied ?? false,
      });
      return result;
    } finally {
      backupInFlight = false;
    }
  };

  const listLogicalBackups = () => {
    let history: Array<{ file: string; bytes: number; at: string; encrypted: boolean }> = [];
    try {
      history = readdirSync(backupDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({
          file: f,
          bytes: statSync(join(backupDir, f)).size,
          at: statSync(join(backupDir, f)).mtime.toISOString(),
          encrypted: BackupService.peekBackupFormat(join(backupDir, f)) === "encrypted",
        }))
        .sort((a, b) => b.at.localeCompare(a.at));
    } catch { /* directory may not exist yet — no backups taken */ }
    const lastOk = lastBackupRun?.ok ? lastBackupRun : null;
    return {
      schedule: {
        intervalHours: BACKUP_INTERVAL_HOURS,
        enabled: BACKUP_INTERVAL_HOURS > 0,
        retentionCount: BACKUP_RETENTION,
        note: "in-process scheduler (single-instance); volume backup schedules are reported in the volumes layer",
        offsiteDir: OFFSITE_DIR || null,
        offsiteNote: "off-volume copy target (NEXUS_BACKUP_OFFSITE_DIR); copies are ALWAYS encrypted (Stage 2.4B) and skipped with a visible alert when no valid key is configured; full object-storage push remains owner-gated (D-2.1-03)",
      },
      encryption: {
        configured: encKeyInfo.configured,
        invalid: encKeyInfo.invalid,
        algorithm: "aes-256-gcm" as const,
        note: encKeyInfo.configured
          ? "artifacts (on-volume AND off-volume) are AES-256-GCM encrypted"
          : encKeyInfo.invalid
            ? `${encKeyInfo.error ?? "invalid key"} — on-volume backups continue as plaintext v1 with a visible alert; off-volume copies are skipped`
            : "not configured — on-volume backups are plaintext v1 (the Stage 2.4A posture); off-volume copies are skipped (a plaintext artifact must never leave the volume)",
      },
      alerting: {
        webhookConfigured: ALERT_WEBHOOK_URL.length > 0,
        lastDelivery: lastWebhookDelivery,
        note: "alerts are recorded in-app (this list), counted in /metrics and logged; the optional webhook URL is never exposed",
      },
      alerts: backupAlerts.slice(-10),
      lastRun: lastBackupRun,
      historyCount: history.length,
      history: history.slice(0, 20),
      rpo: {
        objectiveHours: BACKUP_INTERVAL_HOURS,
        meaning: "maximum acceptable data loss window = one backup interval (plus any unexported writes)",
        offVolume: lastOk?.offsite?.copied
          ? { enabled: true, encrypted: true, lastCopiedAt: lastOk.at ?? null }
          : { enabled: false, encrypted: false, lastCopiedAt: null },
        offVolumeNote: "RPO for VOLUME-LOSS scenarios is unbounded until an off-volume copy is configured AND verified — never claim data-loss protection the deployment does not have",
      },
      rto: {
        objectiveMinutes: 15,
        meaning: "logical restore = redeploy image + mount volume + import backup via the product CLI (verified by isolated restore in CI and at every backup run); the Stage 2.4B drill measures the real figure",
      },
    };
  };

  let backupTimer: ReturnType<typeof setInterval> | null = null;
  let backupFirstTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduledBackupRun = (): void => {
    try {
      runLogicalBackup();
    } catch (e) {
      recordBackupAlert("RUN_EXCEPTION", String(e));
      logger.error?.("backup", "scheduled backup failed", { error: String(e) });
    }
  };
  if (BACKUP_INTERVAL_HOURS > 0) {
    // first backup shortly after boot (staggered to avoid boot-latency impact), then on interval
    backupFirstTimer = setTimeout(scheduledBackupRun, 30_000);
    backupFirstTimer.unref?.();
    backupTimer = setInterval(scheduledBackupRun, BACKUP_INTERVAL_HOURS * 3_600_000);
    backupTimer.unref?.();
  }

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

  return {
    app, db, orchestrator, naei, worldRuntime, mcp, memory, fabric, logger, metrics, health, railway, tools,
    runLogicalBackup, listLogicalBackups,
    /** Read-only bucket-size observability (Stage 2.4B): counts ONLY — no
     * identities, no counters. Exists so the memory-bound regression test can
     * assert the sweep actually reclaims expired buckets. */
    debugBucketSizes: () => ({ authFail: authFailBuckets.size, rate: rateBuckets.size }),
    stopBackupScheduler: () => { if (backupTimer) clearInterval(backupTimer); if (backupFirstTimer) clearTimeout(backupFirstTimer); },
  };
}

export type NexusApp = ReturnType<typeof createApp>;
