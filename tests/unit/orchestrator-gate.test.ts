import { describe, expect, test, beforeEach } from "bun:test";
import { NexusDb, migrate, createRepos } from "@nexus/db";
import { MemoryService } from "@nexus/memory";
import { JarvisOrchestrator, type ToolExecutor, type ToolExecutionContext } from "@nexus/orchestrator";
import type { ModelFabric } from "@nexus/model-fabric";
import { ok, type Result } from "@nexus/core";
import type { CompletionResponse } from "@nexus/contracts";

/**
 * Orchestrator approval-gate regressions (2026-11-14 audit):
 *  - consequential plans stall at VALIDATED until owner approval
 *  - approval propagates approvedBy to the tool context
 *  - plan tool params flow through to tools.execute (not wiped to {})
 *  - the reasoning subsystem's approach drives planning (not a constant)
 */
let db: NexusDb;
beforeEach(() => {
  db = NexusDb.open(":memory:");
  migrate(db);
});

// scripted fabric: returns usable JSON per service by schema shape
function scriptedFabric() {
  const responses: Record<string, unknown> = {
    perception: { intent: "probe", entities: [], constraints: [], successCriteria: ["echo executed"], requiresTools: true },
    reasoning: { analysis: "analysis", approach: "scripted-approach", risks: [], confidence: 0.9 },
    plan: {
      steps: [{
        stepId: "s1", description: "gated call", tool: "mcp.invoke",
        params: { serverName: "io.nexus.test-tools", toolName: "echo", args: { message: "gate-probe" } },
        dependsOn: [], completionCriteria: "echo executed",
      }],
    },
    evaluation: { objectiveMet: true, summary: "criteria met", unmetCriteria: [] },
  };
  const fake = {
    complete: async (req: { jsonSchema?: { properties?: Record<string, unknown> } }): Promise<Result<CompletionResponse>> =>
      ok({
        modelId: "scripted", content: "", provider: "echo" as const,
        parsedJson: req.jsonSchema?.properties?.steps ? responses.plan
          : req.jsonSchema?.properties?.objectiveMet ? responses.evaluation
          : req.jsonSchema?.properties?.intent ? responses.perception
          : req.jsonSchema?.properties?.analysis ? responses.reasoning
          : {},
        usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1,
      }),
  };
  return fake as unknown as ModelFabric;
}

describe("JARVIS approval gate (directive §5.2)", () => {
  test("consequential plan stalls at VALIDATED; no tool executes without owner approval", async () => {
    const calls: Array<{ tool: string; params: Record<string, unknown>; approvedBy?: string }> = [];
    const tools: ToolExecutor = {
      listTools: () => ["mcp.invoke", "world.status"],
      requiresApproval: (tool) => tool === "mcp.invoke",
      execute: async (tool, params, ctx: ToolExecutionContext) => {
        calls.push({ tool, params, approvedBy: ctx.approvedBy });
        return ok({ done: true });
      },
    };
    const orchestrator = new JarvisOrchestrator({
      db, fabric: scriptedFabric(), memory: MemoryService.withDb(db, createRepos(db)), tools,
      approvalGate: async (task, opts) => ({
        required: task.plan.some((s) => s.tool !== undefined && tools.requiresApproval(s.tool, s.params)),
        granted: Boolean(opts?.approvedBy), by: opts?.approvedBy, // like the API wiring: explicit approval releases
      }),
    });

    const task = orchestrator.receive("run the gated probe");
    const first = await orchestrator.run(task.id);
    if (!first.ok) throw new Error("first run failed");
    expect(first.value.state).toBe("VALIDATED"); // blocked before AUTHORISED
    expect(calls.length).toBe(0); // nothing executed

    // owner approval releases the gate
    const second = await orchestrator.run(task.id, { approvedBy: "owner" });
    if (!second.ok) throw new Error("second run failed");
    expect(["COMPLETED", "EVALUATING", "RECOVERY_REQUIRED"]).toContain(second.value.state);
    expect(calls.length).toBe(1);
    expect(calls[0]!.tool).toBe("mcp.invoke");
    // params flowed through to the executor (the params:{} wipe is gone)
    expect(calls[0]!.params).toEqual({ serverName: "io.nexus.test-tools", toolName: "echo", args: { message: "gate-probe" } });
    // approval context propagated
    expect(calls[0]!.approvedBy).toBe("owner");
  });
});
