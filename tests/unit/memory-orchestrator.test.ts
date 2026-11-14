import { describe, expect, test, beforeEach } from "bun:test";
import { NexusDb, migrate, createRepos } from "@nexus/db";
import { MemoryService } from "@nexus/memory";
import { JarvisOrchestrator, TaskRepository, type ToolExecutor } from "@nexus/orchestrator";
import { NexusError } from "@nexus/core";
import { ModelFabric, EchoAdapter } from "@nexus/model-fabric";

let db: NexusDb;
beforeEach(() => {
  db = NexusDb.open(":memory:");
  migrate(db);
});

describe("memory subsystem (directive §5.4)", () => {
  test("create + ranked retrieval by relevance", () => {
    const mem = MemoryService.withDb(db, createRepos(db));
    mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "Owner name", content: "The owner is James.", importance: 0.9, source: "user" });
    mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "Preferred stack", content: "The project uses Bun and TypeScript.", importance: 0.6, source: "user" });
    mem.create({ scope: "jarvis", tier: "episodic", kind: "event_record", title: "Deploy day", content: "We deployed to Railway successfully.", importance: 0.7, source: "system" });

    const results = mem.retrieve({ scope: "jarvis", textQuery: "who is the owner", limit: 2 });
    expect(results.length).toBe(2);
    expect(results[0]!.title).toBe("Owner name"); // relevance-ranked first

    const deploy = mem.retrieve({ scope: "jarvis", textQuery: "deployment railway", limit: 1 });
    expect(deploy[0]!.title).toBe("Deploy day");
  });

  test("knowledge kinds are distinguished (fact vs assumption vs preference)", () => {
    const mem = MemoryService.withDb(db, createRepos(db));
    mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "F1", content: "Verified fact", importance: 0.5 });
    mem.create({ scope: "jarvis", tier: "semantic", kind: "assumption", title: "A1", content: "Unverified assumption", importance: 0.5 });
    mem.create({ scope: "jarvis", tier: "personal", kind: "preference", title: "P1", content: "Owner prefers dark mode", importance: 0.8 });
    const all = mem.listScope("jarvis");
    const kinds = new Set(all.map((m) => m.kind));
    expect(kinds.has("fact")).toBe(true);
    expect(kinds.has("assumption")).toBe(true);
    expect(kinds.has("preference")).toBe(true);
  });

  test("consolidation promotes repeated episodic themes to semantic summaries", () => {
    const mem = MemoryService.withDb(db, createRepos(db));
    for (let i = 0; i < 3; i++) {
      mem.create({ scope: "jarvis", tier: "episodic", kind: "event_record", title: "Morning Deployment", content: `Deployment ${i} completed`, importance: 0.5, source: "system" });
    }
    const result = mem.consolidate("jarvis");
    expect(result.promoted).toBe(1);
    const semantic = mem.retrieve({ scope: "jarvis", tiers: ["semantic"], textQuery: "deployment", limit: 5 });
    expect(semantic.some((m) => m.title.startsWith("Pattern:"))).toBe(true);
  });

  test("consolidation detects contradictions", () => {
    const mem = MemoryService.withDb(db, createRepos(db));
    mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "Deploy Target", content: "The service deploys to Railway.", importance: 0.8 });
    mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "Deploy Target", content: "The service does not deploy to Railway.", importance: 0.8 });
    const result = mem.consolidate("jarvis");
    expect(result.contradictions.length).toBe(1);
  });

  test("supersession tombstones old memories", () => {
    const mem = MemoryService.withDb(db, createRepos(db));
    const old = mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "Old model", content: "We use GPT-3", importance: 0.6 });
    const newer = mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "New model", content: "We use a model fabric", importance: 0.6 });
    mem.supersede(old.id, newer.id);
    // superseded memories are excluded from retrieval
    const results = mem.retrieve({ scope: "jarvis", textQuery: "model", limit: 10 });
    expect(results.some((m) => m.id === old.id)).toBe(false);
    expect(results.some((m) => m.id === newer.id)).toBe(true);
  });

  test("scopes are isolated", () => {
    const mem = MemoryService.withDb(db, createRepos(db));
    mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "J memory", content: "private to jarvis", importance: 0.5 });
    mem.create({ scope: "naei:architect", tier: "semantic", kind: "fact", title: "N memory", content: "private to naei", importance: 0.5 });
    const j = mem.retrieve({ scope: "jarvis", textQuery: "memory", limit: 10 });
    expect(j.length).toBe(1);
    expect(j[0]!.title).toBe("J memory");
  });
});

describe("JARVIS orchestrator (directive §5.2)", () => {
  function makeOrchestrator(toolResults: Record<string, unknown> = {}) {
    const fabric = new ModelFabric({ providers: { echo: new EchoAdapter() } });
    const memory = MemoryService.withDb(db, createRepos(db));
    const tools: ToolExecutor = {
      listTools: () => Object.keys(toolResults).length ? Object.keys(toolResults) : ["internal.step"],
      requiresApproval: (t) => t === "consequential.tool",
      async execute(tool) {
        if (tool in toolResults) return { ok: true, value: toolResults[tool] } as const;
        return { ok: true, value: { done: true, tool } } as const;
      },
    };
    return new JarvisOrchestrator({ db, fabric, memory, tools });
  }

  test("objective reaches COMPLETED with persisted state transitions", async () => {
    const orch = makeOrchestrator({ "world.status": { worldId: "w", residents: 8 } });
    const task = orch.receive("Check world status", "user");
    const r = await orch.run(task.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe("COMPLETED");
      expect(r.value.evaluation).toBeDefined();
      expect(Date.parse(r.value.updatedAt)).toBeGreaterThanOrEqual(Date.parse(r.value.createdAt));
    }
    // persisted
    const reloaded = new TaskRepository(db).get(task.id);
    expect(reloaded!.state).toBe("COMPLETED");
  });

  test("failed tool step skips dependents and triggers bounded recovery", async () => {
    const fabric = new ModelFabric({ providers: { echo: new EchoAdapter() } });
    const memory = MemoryService.withDb(db, createRepos(db));
    const tools: ToolExecutor = {
      listTools: () => ["failing.tool"],
      requiresApproval: () => false,
      async execute(tool) {
        if (tool === "failing.tool") {
          return { ok: false, error: new NexusError("TOOL_ERROR", "tool exploded", { retryable: false }) } as const;
        }
        return { ok: true, value: null } as const;
      },
    };
    const orch = new JarvisOrchestrator({ db, fabric, memory, tools, maxRecoveryAttempts: 1 });
    const task = orch.receive("Use the failing tool", "user");
    const r = await orch.run(task.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // bounded recovery: ends COMPLETED (with unmet criteria) or RECOVERY_REQUIRED, never infinite loop
      expect(["COMPLETED", "RECOVERY_REQUIRED"]).toContain(r.value.state);
      expect(r.value.recoveryAttempts).toBeLessThanOrEqual(1);
    }
  });

  test("cyclic plans are rejected by validation", async () => {
    const orch = makeOrchestrator();
    // inject a cyclic plan directly to test the validator
    const orchInternal = orch as unknown as { validatePlan(plan: unknown[]): { ok: boolean } };
    const cyclic = [
      { stepId: "s1", description: "a", completionCriteria: "x", dependsOn: ["s2"], params: {} },
      { stepId: "s2", description: "b", completionCriteria: "y", dependsOn: ["s1"], params: {} },
    ];
    expect(orchInternal.validatePlan(cyclic).ok).toBe(false);
    const unknownDep = [
      { stepId: "s1", description: "a", completionCriteria: "x", dependsOn: ["nope"], params: {} },
    ];
    expect(orchInternal.validatePlan(unknownDep).ok).toBe(false);
  });

  test("interrupted tasks are recoverable after restart", async () => {
    const orch = makeOrchestrator({ "memory.search": [] });
    const task = orch.receive("Remember something then check it", "user");
    // simulate crash mid-flight: set state to EXECUTING directly
    const repo = new TaskRepository(db);
    const t = repo.get(task.id)!;
    t.state = "EXECUTING";
    (repo as unknown as { touch(t: typeof task): void }).touch?.(t);
    db.run("UPDATE jarvis_tasks SET state = 'EXECUTING', doc = ? WHERE id = ?", JSON.stringify(t), t.id);
    // recovery on "restart"
    const recovered = await orch.recoverInterrupted();
    expect(recovered.length).toBe(1);
    expect(["COMPLETED", "RECOVERY_REQUIRED"]).toContain(recovered[0]!.state);
  });
});
