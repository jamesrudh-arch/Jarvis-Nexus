/**
 * @nexus/cognition — JARVIS cognitive components (directive §5.1).
 *
 * Distinct cooperating services: perception, context intelligence, reasoning,
 * planning, action selection and evaluation. Each is a service contract; the
 * orchestrator composes them through explicit state transitions (§5.2).
 *
 * Model calls go through the ModelFabric; structured outputs are validated.
 * A deterministic fallback path exists for degraded/offline operation.
 */
import { ok, err, type Result, NexusError } from "@nexus/core";
import type {
  CompletionRequest, CompletionResponse, ModelTaskType,
} from "@nexus/contracts";
import type { ModelFabric } from "@nexus/model-fabric";

// ---------------------------------------------------------------------------
// Perception (§5.1)
// ---------------------------------------------------------------------------

export interface Perception {
  intent: string;
  entities: string[];
  constraints: string[];
  successCriteria: string[];
  ambiguity: string | null;
  requiresTools: boolean;
}

export class PerceptionService {
  constructor(private readonly fabric: ModelFabric) {}

  async interpret(objective: string): Promise<Result<Perception>> {
    const req: CompletionRequest = {
      taskType: "classification",
      systemPrompt: `You are JARVIS's perception subsystem. Interpret the user objective. Return ONLY JSON:
{"intent": "<verb phrase>", "entities": ["<mentioned entities>"], "constraints": ["<explicit constraints>"],
 "successCriteria": ["<observable success criteria>"], "ambiguity": "<unresolved ambiguity or null>",
 "requiresTools": <true|false>}`,
      messages: [{ role: "user", content: objective }],
      jsonSchema: {
        type: "object",
        properties: {
          intent: { type: "string" }, entities: { type: "array", items: { type: "string" } },
          constraints: { type: "array", items: { type: "string" } },
          successCriteria: { type: "array", items: { type: "string" } },
          ambiguity: { type: ["string", "null"] }, requiresTools: { type: "boolean" },
        },
        required: ["intent", "successCriteria", "requiresTools"],
      },
      maxTokens: 600,
    };
    const r = await this.fabric.complete(req);
    if (!r.ok) return r;
    const parsed = r.value.parsedJson as Partial<Perception> | undefined;
    if (!parsed || typeof parsed.intent !== "string" || !Array.isArray(parsed.successCriteria)) {
      return err(new NexusError("SCHEMA_ERROR", "perception: model returned unusable interpretation"));
    }
    return ok({
      intent: parsed.intent,
      entities: parsed.entities ?? [],
      constraints: parsed.constraints ?? [],
      successCriteria: parsed.successCriteria as string[],
      ambiguity: typeof parsed.ambiguity === "string" ? parsed.ambiguity : null,
      requiresTools: parsed.requiresTools ?? false,
    });
  }

  /** Deterministic fallback when no model is reachable. */
  static fallbackInterpretation(objective: string): Perception {
    return {
      intent: objective.split(/[.!?\n]/)[0]?.slice(0, 80) ?? "execute objective",
      entities: [],
      constraints: [],
      successCriteria: [`Objective addressed: ${objective.slice(0, 120)}`],
      ambiguity: null,
      requiresTools: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Reasoning (§5.1)
// ---------------------------------------------------------------------------

export interface ReasoningResult {
  analysis: string;
  approach: string;
  risks: string[];
  confidence: number;
}

export class ReasoningService {
  constructor(private readonly fabric: ModelFabric) {}

  async analyse(objective: string, context: string, constraints: string[]): Promise<Result<ReasoningResult>> {
    const r = await this.fabric.complete({
      taskType: "reasoning",
      systemPrompt: `You are JARVIS's reasoning subsystem. Given the objective, retrieved context and constraints, produce a structured analysis. Return ONLY JSON:
{"analysis": "<2-4 sentence analysis>", "approach": "<recommended approach>", "risks": ["<risk>"], "confidence": <0.0-1.0>}`,
      messages: [
        { role: "user", content: `OBJECTIVE: ${objective}\n\nCONTEXT:\n${context || "(none)"}\n\nCONSTRAINTS: ${constraints.join("; ") || "(none)"}` },
      ],
      jsonSchema: {
        type: "object",
        properties: {
          analysis: { type: "string" }, approach: { type: "string" },
          risks: { type: "array", items: { type: "string" } }, confidence: { type: "number" },
        },
        required: ["analysis", "approach", "confidence"],
      },
      maxTokens: 800,
    });
    if (!r.ok) return r;
    const p = r.value.parsedJson as Partial<ReasoningResult> | undefined;
    if (!p?.analysis || !p.approach) {
      return err(new NexusError("SCHEMA_ERROR", "reasoning: unusable model output"));
    }
    return ok({
      analysis: p.analysis, approach: p.approach,
      risks: Array.isArray(p.risks) ? p.risks : [],
      confidence: typeof p.confidence === "number" ? p.confidence : 0.6,
    });
  }
}

// ---------------------------------------------------------------------------
// Planning (§5.1)
// ---------------------------------------------------------------------------

export interface PlannedStep {
  stepId: string;
  description: string;
  tool?: string;
  agentRole?: string;
  dependsOn: string[];
  completionCriteria: string;
}

export class PlanningService {
  constructor(private readonly fabric: ModelFabric) {}

  async decompose(objective: string, approach: string, availableTools: string[]): Promise<Result<PlannedStep[]>> {
    const r = await this.fabric.complete({
      taskType: "planning",
      systemPrompt: `You are JARVIS's planning subsystem. Decompose the objective into an ordered execution plan.
Available tools: ${availableTools.length ? availableTools.join(", ") : "none"}.
Steps may declare a "tool" from the list, an "agentRole" for delegation (architect, backend_engineer, test_engineer, verification_engineer, blender_engineer, unreal_engineer), and "dependsOn" (step ids that must complete first).
Return ONLY JSON: {"steps": [{"stepId": "s1", "description": "...", "tool": null, "agentRole": null, "dependsOn": [], "completionCriteria": "..."}]}
Keep plans between 2 and 6 steps. Prefer the fewest steps that satisfy the objective.`,
      messages: [{ role: "user", content: `OBJECTIVE: ${objective}\nAPPROACH: ${approach}` }],
      jsonSchema: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                stepId: { type: "string" }, description: { type: "string" },
                tool: { type: ["string", "null"] }, agentRole: { type: ["string", "null"] },
                dependsOn: { type: "array", items: { type: "string" } },
                completionCriteria: { type: "string" },
              },
              required: ["stepId", "description", "completionCriteria"],
            },
          },
        },
        required: ["steps"],
      },
      maxTokens: 1200,
    });
    if (!r.ok) return r;
    const p = r.value.parsedJson as { steps?: PlannedStep[] } | undefined;
    if (!p?.steps || !Array.isArray(p.steps) || p.steps.length === 0) {
      return err(new NexusError("SCHEMA_ERROR", "planning: no steps returned"));
    }
    // sanitise: filter unknown deps, dedupe step ids
    const ids = new Set(p.steps.map((s) => s.stepId));
    return ok(p.steps.map((s) => ({
      ...s,
      tool: s.tool ?? undefined,
      agentRole: s.agentRole ?? undefined,
      dependsOn: (s.dependsOn ?? []).filter((d) => ids.has(d)),
    })));
  }

  /** Deterministic fallback plan for degraded mode. */
  static fallbackPlan(objective: string): PlannedStep[] {
    return [
      {
        stepId: "s1",
        description: `Address the objective directly: ${objective.slice(0, 200)}`,
        completionCriteria: "A substantive response to the objective exists",
        dependsOn: [],
      },
      {
        stepId: "s2",
        description: "Self-check the result against the objective",
        completionCriteria: "Result reviewed and recorded",
        dependsOn: ["s1"],
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Evaluation (§5.1) — compares outcomes against objectives
// ---------------------------------------------------------------------------

export interface EvaluationResult {
  objectiveMet: boolean;
  summary: string;
  unmetCriteria: string[];
}

export class EvaluationService {
  constructor(private readonly fabric: ModelFabric) {}

  async evaluate(objective: string, criteria: string[], stepOutputs: Array<{ stepId: string; output: unknown }>): Promise<Result<EvaluationResult>> {
    const r = await this.fabric.complete({
      taskType: "classification",
      systemPrompt: `You are JARVIS's evaluation subsystem. Compare execution outcomes against the success criteria. Be strict: only mark criteria met if the evidence supports it. Return ONLY JSON:
{"objectiveMet": <bool>, "summary": "<1-3 sentences>", "unmetCriteria": ["<criterion>"]}`,
      messages: [{
        role: "user",
        content: `OBJECTIVE: ${objective}\n\nSUCCESS CRITERIA:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nSTEP OUTPUTS:\n${stepOutputs.map((s) => `${s.stepId}: ${JSON.stringify(s.output).slice(0, 800)}`).join("\n")}`,
      }],
      jsonSchema: {
        type: "object",
        properties: {
          objectiveMet: { type: "boolean" }, summary: { type: "string" },
          unmetCriteria: { type: "array", items: { type: "string" } },
        },
        required: ["objectiveMet", "summary"],
      },
      maxTokens: 500,
    });
    if (!r.ok) return r;
    const p = r.value.parsedJson as Partial<EvaluationResult> | undefined;
    if (p?.summary === undefined) {
      return err(new NexusError("SCHEMA_ERROR", "evaluation: unusable model output"));
    }
    return ok({
      objectiveMet: p.objectiveMet === true,
      summary: p.summary,
      unmetCriteria: Array.isArray(p.unmetCriteria) ? p.unmetCriteria : [],
    });
  }

  /** Deterministic evaluation: all steps succeeded => objective met (strict fallback). */
  static fallbackEvaluate(objective: string, criteria: string[], stepOutputs: Array<{ stepId: string; status: string; output: unknown }>): EvaluationResult {
    const failed = stepOutputs.filter((s) => s.status === "FAILED");
    return {
      objectiveMet: failed.length === 0 && stepOutputs.length > 0,
      summary: failed.length === 0
        ? `Completed ${stepOutputs.length} steps covering the objective (deterministic evaluation).`
        : `Steps failed: ${failed.map((f) => f.stepId).join(", ")}`,
      unmetCriteria: failed.length === 0 ? [] : criteria,
    };
  }
}
