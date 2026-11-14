import { describe, expect, test } from "bun:test";
import { PlanningService } from "@nexus/cognition";
import type { ModelFabric } from "@nexus/model-fabric";
import { ok, type Result } from "@nexus/core";
import type { CompletionResponse } from "@nexus/contracts";

/**
 * Planner param regression (2026-11-14 audit): the planner contract now
 * includes per-step tool params, and the sanitiser passes them through
 * (previously every tool step executed with params: {}).
 */
const scriptedPlan = {
  steps: [
    {
      stepId: "s1", description: "Check world status", tool: "world.status",
      params: { worldId: "nexus_world_probe", extra: { nested: true } },
      dependsOn: [], completionCriteria: "status retrieved",
    },
    {
      stepId: "s2", description: "Summarise", tool: null, agentRole: null,
      dependsOn: ["s1"], completionCriteria: "summary written",
    },
  ],
};

const fakeFabric = {
  complete: async (): Promise<Result<CompletionResponse>> =>
    ok({
      modelId: "scripted", content: "", provider: "echo" as const,
      parsedJson: scriptedPlan,
      usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1,
    }),
} as unknown as ModelFabric;

describe("planner params (directive §5.1)", () => {
  test("planner passes tool params through the sanitiser", async () => {
    const plan = await new PlanningService(fakeFabric).decompose("objective", "approach", ["world.status"]);
    if (!plan.ok) throw new Error(`planning failed: ${plan.error.message}`);
    const steps = plan.value as Array<{ tool?: string; params?: Record<string, unknown> }>;
    expect(steps[0]!.tool).toBe("world.status");
    expect(steps[0]!.params).toEqual({ worldId: "nexus_world_probe", extra: { nested: true } });
    // steps without params default to {} (never undefined)
    expect(steps[1]!.params).toEqual({});
  });
});
