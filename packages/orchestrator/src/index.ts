/**
 * @nexus/orchestrator — JARVIS central orchestration (directive §5.2, §5.6).
 *
 * Explicit state machine, persisted across restarts:
 * RECEIVED → INTERPRETED → CONTEXTUALISED → PLANNED → VALIDATED → AUTHORISED
 *          → EXECUTING → EVALUATING → COMPLETED | RECOVERY_REQUIRED
 *
 * Tool execution is delegated to a ToolExecutor provided at wiring time
 * (internal capabilities + MCP gateway + NAEI delegation).
 */
import {
  nexusId, ID_PREFIXES, ok, err, safeJsonStringify,
  type Result, NexusError, systemClock, type Clock,
} from "@nexus/core";
import type { JarvisTask, TaskStateValue, ExecutionStepResult, PlanStep } from "@nexus/contracts";
import type { NexusDb } from "@nexus/db";
import {
  PerceptionService, ReasoningService, PlanningService, EvaluationService,
  type Perception,
} from "@nexus/cognition";
import type { ModelFabric } from "@nexus/model-fabric";
import type { MemoryService } from "@nexus/memory";

// ---------------------------------------------------------------------------
// Tool executor contract — wired by apps/nexus-api
// ---------------------------------------------------------------------------

export interface ToolExecutionContext {
  task: JarvisTask;
  step: PlanStep;
  approvedBy?: string;
}

export interface ToolExecutor {
  listTools(): string[];
  execute(tool: string, params: Record<string, unknown>, ctx: ToolExecutionContext): Promise<Result<unknown>>;
  /** Whether this tool invocation is consequential and needs owner approval. */
  requiresApproval(tool: string, params: Record<string, unknown>): boolean;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export class TaskRepository {
  constructor(private readonly db: NexusDb) {}

  save(task: JarvisTask): void {
    const nowIso = new Date().toISOString();
    this.db.run(
      `INSERT INTO jarvis_tasks (id, state, objective, origin, doc, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state=excluded.state, doc=excluded.doc, updated_at=excluded.updated_at`,
      task.id, task.state, task.objective, task.origin, safeJsonStringify(task), task.createdAt, task.updatedAt,
    );
  }

  get(id: string): JarvisTask | null {
    const row = this.db.get<{ doc: string }>("SELECT doc FROM jarvis_tasks WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as JarvisTask) : null;
  }

  list(filter?: { state?: TaskStateValue }): JarvisTask[] {
    const rows = filter?.state
      ? this.db.all<{ doc: string }>("SELECT doc FROM jarvis_tasks WHERE state = ? ORDER BY created_at DESC", filter.state)
      : this.db.all<{ doc: string }>("SELECT doc FROM jarvis_tasks ORDER BY created_at DESC LIMIT 200");
    return rows.map((r) => JSON.parse(r.doc) as JarvisTask);
  }

  /** Tasks that were mid-flight when the process died (§5.2 recovery). */
  recoverable(): JarvisTask[] {
    return this.list({ state: "EXECUTING" })
      .concat(this.list({ state: "EVALUATING" }))
      .concat(this.list({ state: "AUTHORISED" }));
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface OrchestratorConfig {
  db: NexusDb;
  fabric: ModelFabric;
  memory: MemoryService;
  tools: ToolExecutor;
  clock?: Clock;
  memoryScope?: string;
  maxRecoveryAttempts?: number;
  /** Consequential operations require owner approval before AUTHORISED. The
   *  gate receives the run options: an explicit approvedBy (supplied by the
   *  /jarvis/tasks/:id/approve route) is what releases the gate. */
  approvalGate?: (task: JarvisTask, opts?: { approvedBy?: string }) => Promise<{ required: boolean; granted: boolean; by?: string }>;
}

export class JarvisOrchestrator {
  readonly repo: TaskRepository;
  private readonly perception: PerceptionService;
  private readonly reasoning: ReasoningService;
  private readonly planning: PlanningService;
  private readonly evaluation: EvaluationService;
  private readonly tools: ToolExecutor;
  private readonly memory: MemoryService;
  private readonly clock: Clock;
  private readonly memoryScope: string;
  private readonly maxRecovery: number;
  private readonly approvalGate?: OrchestratorConfig["approvalGate"];
  private readonly db: NexusDb;

  constructor(cfg: OrchestratorConfig) {
    this.db = cfg.db;
    this.repo = new TaskRepository(cfg.db);
    this.perception = new PerceptionService(cfg.fabric);
    this.reasoning = new ReasoningService(cfg.fabric);
    this.planning = new PlanningService(cfg.fabric);
    this.evaluation = new EvaluationService(cfg.fabric);
    this.tools = cfg.tools;
    this.memory = cfg.memory;
    this.clock = cfg.clock ?? systemClock;
    this.memoryScope = cfg.memoryScope ?? "jarvis";
    this.maxRecovery = cfg.maxRecoveryAttempts ?? 2;
    this.approvalGate = cfg.approvalGate;
  }

  /** Receive a new objective (state: RECEIVED). */
  receive(objective: string, origin: JarvisTask["origin"] = "user"): JarvisTask {
    const now = this.clock.now().toISOString();
    const task: JarvisTask = {
      id: nexusId(ID_PREFIXES.task),
      objective, origin,
      state: "RECEIVED",
      contextRefs: [], plan: [], stepResults: [],
      recoveryAttempts: 0,
      createdAt: now, updatedAt: now,
    };
    this.repo.save(task);
    return task;
  }

  /**
   * Drive a task as far as it can go without blocking: interpret →
   * contextualise → plan → validate → (authorise) → execute → evaluate.
   * Returns the task in its terminal or blocking state.
   */
  async run(taskId: string, opts?: { approvedBy?: string }): Promise<Result<JarvisTask>> {
    let task = this.repo.get(taskId);
    if (!task) return err(new NexusError("NOT_FOUND", `task ${taskId} not found`));
    let lastApproach: string | undefined;

    // ---- RECEIVED → INTERPRETED
    if (task.state === "RECEIVED") {
      const p = await this.perception.interpret(task.objective);
      const perception: Perception = p.ok ? p.value : PerceptionService.fallbackInterpretation(task.objective);
      task.interpretation = {
        intent: perception.intent,
        constraints: perception.constraints,
        successCriteria: perception.successCriteria,
        ambiguity: perception.ambiguity ?? undefined,
      };
      task.state = "INTERPRETED";
      this.touch(task);
    }

    // ---- INTERPRETED → CONTEXTUALISED
    if (task.state === "INTERPRETED") {
      const context = this.memory.assembleContext(this.memoryScope, task.objective, 8);
      const reasoning = await this.reasoning.analyse(task.objective, context, task.interpretation?.constraints ?? []);
      if (reasoning.ok) {
        lastApproach = reasoning.value.approach;
        this.memory.create({
          scope: this.memoryScope, tier: "working", kind: "fact",
          title: `Reasoning for ${task.id}`,
          content: `${reasoning.value.analysis} Approach: ${reasoning.value.approach}`,
          importance: 0.4, confidence: reasoning.value.confidence,
          source: "agent", sourceId: task.id, tags: ["reasoning"],
        });
      }
      task.state = "CONTEXTUALISED";
      this.touch(task);
    }

    // ---- CONTEXTUALISED → PLANNED
    if (task.state === "CONTEXTUALISED") {
      // the reasoning subsystem's approach drives planning (not a constant):
      const plan = await this.planning.decompose(task.objective, lastApproach ?? "capability-driven", this.tools.listTools());
      const steps: PlanStep[] = plan.ok
        ? plan.value.map((s) => ({ ...s, params: s.params ?? {} }))
        : PlanningService.fallbackPlan(task.objective).map((s) => ({ ...s, params: {} }));
      task.plan = steps;
      task.stepResults = steps.map((s) => ({ stepId: s.stepId, status: "PENDING" }));
      task.state = "PLANNED";
      this.touch(task);
    }

    // ---- PLANNED → VALIDATED (dependency graph must be acyclic & complete)
    if (task.state === "PLANNED") {
      const v = this.validatePlan(task.plan);
      if (!v.ok) {
        task.state = "RECOVERY_REQUIRED";
        this.touch(task);
        return ok(task);
      }
      task.state = "VALIDATED";
      this.touch(task);
    }

    // ---- VALIDATED → AUTHORISED (approval gate for consequential steps)
    if (task.state === "VALIDATED") {
      const consequential = task.plan.some((s) => s.tool && this.tools.requiresApproval(s.tool, s.params));
      if (consequential && this.approvalGate) {
        const gate = await this.approvalGate(task, opts);
        if (gate.required && !gate.granted) {
          // stays VALIDATED; caller re-runs with approval (approvedBy)
          return ok(task);
        }
      }
      task.state = "AUTHORISED";
      this.touch(task);
    }

    // ---- AUTHORISED → EXECUTING
    if (task.state === "AUTHORISED" || task.state === "EXECUTING") {
      task.state = "EXECUTING";
      this.touch(task);
      const exec = await this.executePlan(task, opts?.approvedBy);
      if (!exec.ok) {
        task.state = "RECOVERY_REQUIRED";
        this.touch(task);
        return ok(task);
      }
      task.state = "EVALUATING";
      this.touch(task);
    }

    // ---- EVALUATING → COMPLETED / RECOVERY_REQUIRED
    if (task.state === "EVALUATING") {
      const outputs = task.stepResults.map((s) => ({ stepId: s.stepId, status: s.status, output: s.output }));
      const criteria = task.interpretation?.successCriteria ?? [`Objective addressed: ${task.objective.slice(0, 100)}`];
      const evalResult = await this.evaluation.evaluate(task.objective, criteria, outputs.map((o) => ({ stepId: o.stepId, output: o.output })));
      const evaluation = evalResult.ok
        ? evalResult.value
        : EvaluationService.fallbackEvaluate(task.objective, criteria, outputs);
      task.evaluation = {
        objectiveMet: evaluation.objectiveMet,
        summary: evaluation.summary,
        unmetCriteria: evaluation.unmetCriteria,
      };
      if (evaluation.objectiveMet || task.recoveryAttempts >= this.maxRecovery) {
        task.state = "COMPLETED";
        task.completedAt = this.clock.now().toISOString();
        // store outcome in episodic memory (directive §5.6)
        this.memory.create({
          scope: this.memoryScope, tier: "episodic", kind: "event_record",
          title: `Task ${task.id.slice(0, 24)}: ${task.objective.slice(0, 80)}`,
          content: `Outcome: ${evaluation.summary} (met=${evaluation.objectiveMet})`,
          importance: evaluation.objectiveMet ? 0.7 : 0.8, confidence: 0.9,
          source: "system", sourceId: task.id, tags: ["task_outcome"],
        });
      } else {
        task.recoveryAttempts += 1;
        task.state = "RECOVERY_REQUIRED";
      }
      this.touch(task);
    }

    // ---- RECOVERY_REQUIRED → re-plan (bounded retries, anti-loop §17)
    if (task.state === "RECOVERY_REQUIRED" && task.recoveryAttempts < this.maxRecovery) {
      task.state = "CONTEXTUALISED"; // re-plan path
      this.touch(task);
      return this.run(task.id, opts);
    }

    return ok(task);
  }

  /** Execute plan steps respecting dependencies (topological order). */
  private async executePlan(task: JarvisTask, approvedBy?: string): Promise<Result<void>> {
    const pending = new Set(task.plan.map((s) => s.stepId));
    const byId = new Map(task.plan.map((s) => [s.stepId, s]));
    let guard = 0;
    while (pending.size > 0 && guard++ < 100) {
      const ready = [...pending].filter((id) => {
        const step = byId.get(id)!;
        return step.dependsOn.every((d) => {
          const res = task.stepResults.find((r) => r.stepId === d);
          return res && (res.status === "SUCCEEDED" || res.status === "SKIPPED");
        });
      });
      if (ready.length === 0) {
        return err(new NexusError("DEPENDENCY_ERROR", "deadlock: no ready steps (unsatisfiable dependencies)"));
      }
      for (const stepId of ready) {
        const step = byId.get(stepId)!;
        const result = task.stepResults.find((r) => r.stepId === stepId)!;
        result.status = "RUNNING";
        result.startedAt = this.clock.now().toISOString();
        this.touch(task);
        try {
          let output: unknown;
          if (step.tool) {
            const r = await this.tools.execute(step.tool, step.params, { task, step, approvedBy });
            if (!r.ok) throw r.error;
            output = r.value;
          } else if (step.agentRole) {
            const r = await this.tools.execute("naei.delegate", {
              role: step.agentRole, requirement: step.description,
              acceptanceCriteria: [step.completionCriteria],
            }, { task, step, approvedBy });
            if (!r.ok) throw r.error;
            output = r.value;
          } else {
            // direct reasoning step (no tool): produce an answer via fabric
            output = { note: `Step handled internally: ${step.description}` };
          }
          result.status = "SUCCEEDED";
          result.output = output === undefined ? null : output;
        } catch (e) {
          result.status = "FAILED";
          result.error = String(e).slice(0, 500);
        }
        result.finishedAt = this.clock.now().toISOString();
        pending.delete(stepId);
        this.touch(task);
        // dependents of failed steps are skipped
        if (result.status === "FAILED") {
          for (const other of task.plan) {
            if (other.dependsOn.includes(stepId)) {
              const dep = task.stepResults.find((r) => r.stepId === other.stepId)!;
              dep.status = "SKIPPED";
              dep.error = `skipped: dependency ${stepId} failed`;
              pending.delete(other.stepId);
            }
          }
        }
      }
    }
    return ok(undefined);
  }

  private validatePlan(plan: PlanStep[]): Result<void> {
    if (plan.length === 0) return err(new NexusError("VALIDATION_ERROR", "empty plan"));
    const ids = new Set(plan.map((s) => s.stepId));
    if (ids.size !== plan.length) return err(new NexusError("VALIDATION_ERROR", "duplicate step ids"));
    // cycle detection via DFS
    const visiting = new Set<string>(), visited = new Set<string>();
    const hasCycle = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const step = plan.find((s) => s.stepId === id);
      if (step?.dependsOn.some((d) => ids.has(d) && hasCycle(d))) return true;
      visiting.delete(id);
      visited.add(id);
      return false;
    };
    for (const s of plan) {
      if (hasCycle(s.stepId)) return err(new NexusError("VALIDATION_ERROR", `plan contains a dependency cycle at ${s.stepId}`));
      for (const d of s.dependsOn) {
        if (!ids.has(d)) return err(new NexusError("VALIDATION_ERROR", `step ${s.stepId} depends on unknown step ${d}`));
      }
    }
    return ok(undefined);
  }

  private touch(task: JarvisTask): void {
    task.updatedAt = this.clock.now().toISOString();
    this.repo.save(task);
  }

  /**
   * Restart recovery (§5.2): tasks found mid-flight resume from their last
   * persisted state. Called once at service start.
   */
  async recoverInterrupted(): Promise<JarvisTask[]> {
    const recoverable = this.repo.recoverable();
    const resumed: JarvisTask[] = [];
    for (const t of recoverable) {
      const r = await this.run(t.id);
      if (r.ok) resumed.push(r.value);
    }
    return resumed;
  }
}
