/**
 * @nexus/naei — NEXUS Autonomous Engineering Intelligence (directive §6).
 *
 * Agent registry with structured contracts, task queue with dependency DAG,
 * specialist assignment, isolated workspaces, checkpointed execution,
 * independent verification (an agent never certifies its own work),
 * escalation and human approval gates.
 *
 * Orchestration patterns adapted from the Pizza Bot assessment (registry
 * TECH-002): durable queues, checkpoint/resume, HITL approval durability.
 */
import {
  nexusId, ID_PREFIXES, ok, err, safeJsonStringify,
  type Result, NexusError, systemClock, type Clock,
} from "@nexus/core";
import type {
  AgentContract, NaeiTask, AgentRole, NaeiTaskStatusValue,
} from "@nexus/contracts";
import type { NexusDb } from "@nexus/db";
import type { ModelFabric } from "@nexus/model-fabric";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Agent registry (directive §6.1, §6.2)
// ---------------------------------------------------------------------------

export const DEFAULT_AGENT_ROSTER: Array<Partial<AgentContract> & { role: AgentRole; name: string }> = [
  { role: "principal_architect", name: "Atlas", division: "SYSTEM_ARCHITECTURE", capabilities: ["architecture", "adr_authoring", "dependency_analysis"], modelAssignment: { taskType: "reasoning" }, permissions: ["read_repo", "write_repo", "request_approval", "read_memory", "write_memory"] },
  { role: "backend_engineer", name: "Forge", division: "SOFTWARE_ENGINEERING", capabilities: ["typescript", "api_design", "service_implementation"], modelAssignment: { taskType: "coding" }, permissions: ["read_repo", "write_repo", "run_tests", "run_builds", "read_memory", "write_memory"] },
  { role: "database_engineer", name: "Ledger", division: "SOFTWARE_ENGINEERING", capabilities: ["schema_design", "migrations", "query_optimisation"], modelAssignment: { taskType: "coding" }, permissions: ["read_repo", "write_repo", "run_tests", "read_memory"] },
  { role: "test_engineer", name: "Probe", division: "QUALITY_RELIABILITY", capabilities: ["test_authoring", "test_execution", "coverage_analysis"], modelAssignment: { taskType: "coding" }, permissions: ["read_repo", "run_tests", "write_repo", "read_memory"] },
  { role: "verification_engineer", name: "Warden", division: "QUALITY_RELIABILITY", capabilities: ["independent_verification", "evidence_inspection", "requirement_tracing"], modelAssignment: { taskType: "reasoning" }, permissions: ["read_repo", "run_tests", "read_memory", "request_approval"] },
  { role: "security_engineer", name: "Bastion", division: "QUALITY_RELIABILITY", capabilities: ["threat_analysis", "secret_scanning", "dependency_audit"], modelAssignment: { taskType: "reasoning" }, permissions: ["read_repo", "read_memory"] },
  { role: "unreal_engineer", name: "Lumen", division: "WORLD_ENGINEERING", capabilities: ["unreal_cplusplus", "gameplay_framework", "world_partition"], modelAssignment: { taskType: "coding" }, permissions: ["read_repo", "write_repo", "invoke_mcp", "read_memory", "write_memory"] },
  { role: "simulation_engineer", name: "Tempo", division: "WORLD_ENGINEERING", capabilities: ["simulation_systems", "scheduling", "state_management"], modelAssignment: { taskType: "coding" }, permissions: ["read_repo", "write_repo", "run_tests", "read_memory"] },
  { role: "blender_engineer", name: "Sculpt", division: "THREE_D_PRODUCTION", capabilities: ["bpy_automation", "procedural_modelling", "asset_validation"], modelAssignment: { taskType: "coding" }, permissions: ["read_repo", "write_repo", "invoke_mcp", "read_memory"] },
  { role: "ai_architect", name: "Cortex", division: "AI_ENGINEERING", capabilities: ["model_routing", "memory_architecture", "evaluation_design"], modelAssignment: { taskType: "reasoning" }, permissions: ["read_repo", "write_repo", "run_tests", "read_memory", "write_memory"] },
];

export class AgentRegistry {
  constructor(private readonly db: NexusDb) {}

  register(input: Partial<AgentContract> & { role: AgentRole; name: string }): AgentContract {
    const agent: AgentContract = {
      agentId: nexusId(ID_PREFIXES.agent),
      name: input.name,
      role: input.role,
      division: input.division ?? "SOFTWARE_ENGINEERING",
      capabilities: input.capabilities ?? [],
      modelAssignment: input.modelAssignment ?? { taskType: "coding" },
      availableTools: input.availableTools ?? [],
      permissions: input.permissions ?? ["read_repo"],
      taskBudget: input.taskBudget ?? { maxTasks: 100, maxTokensPerTask: 20_000, maxWallClockMsPerTask: 120_000 },
      memoryAccess: input.memoryAccess ?? [`naei:${input.role}`],
      failurePolicy: input.failurePolicy ?? "retry_once",
      active: input.active ?? true,
    };
    this.db.run(
      `INSERT INTO naei_agents (id, role, name, active, doc) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET active=excluded.active, doc=excluded.doc`,
      agent.agentId, agent.role, agent.name, agent.active ? 1 : 0, safeJsonStringify(agent),
    );
    return agent;
  }

  seedDefaultRoster(): AgentContract[] {
    return DEFAULT_AGENT_ROSTER.map((r) => this.register(r));
  }

  get(id: string): AgentContract | null {
    const row = this.db.get<{ doc: string }>("SELECT doc FROM naei_agents WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as AgentContract) : null;
  }

  list(filter?: { role?: AgentRole; active?: boolean }): AgentContract[] {
    const rows = this.db.all<{ doc: string; active: number }>(
      "SELECT doc, active FROM naei_agents ORDER BY name",
    );
    return rows
      .map((r) => JSON.parse(r.doc) as AgentContract)
      .filter((a) => (filter?.role ? a.role === filter.role : true))
      .filter((a) => (filter?.active !== undefined ? a.active === filter.active : true));
  }

  findByRole(role: AgentRole): AgentContract | null {
    return this.list({ role, active: true })[0] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Task queue + persistence (directive §6.3)
// ---------------------------------------------------------------------------

export class NaeiTaskRepository {
  constructor(private readonly db: NexusDb) {}

  save(task: NaeiTask): void {
    this.db.run(
      `INSERT INTO naei_tasks (id, status, requirement, assigned_agent_id, depends_on, created_at, updated_at, doc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status, assigned_agent_id=excluded.assigned_agent_id, updated_at=excluded.updated_at, doc=excluded.doc`,
      task.id, task.status, task.requirement, task.assignedAgentId ?? null,
      safeJsonStringify(task.dependsOn), task.createdAt, task.updatedAt, safeJsonStringify(task),
    );
  }

  get(id: string): NaeiTask | null {
    const row = this.db.get<{ doc: string }>("SELECT doc FROM naei_tasks WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as NaeiTask) : null;
  }

  list(filter?: { status?: NaeiTaskStatusValue }): NaeiTask[] {
    const rows = filter?.status
      ? this.db.all<{ doc: string }>("SELECT doc FROM naei_tasks WHERE status = ? ORDER BY created_at", filter.status)
      : this.db.all<{ doc: string }>("SELECT doc FROM naei_tasks ORDER BY created_at DESC LIMIT 200");
    return rows.map((r) => JSON.parse(r.doc) as NaeiTask);
  }

  /** Queued tasks whose dependencies are all satisfied (VERIFIED or COMMITTED). */
  ready(): NaeiTask[] {
    const queued = this.list({ status: "QUEUED" });
    return queued.filter((t) =>
      t.dependsOn.every((d) => {
        const dep = this.get(d);
        return dep && (dep.status === "VERIFIED" || dep.status === "COMMITTED");
      }),
    );
  }

  /** Mid-flight tasks for restart recovery (checkpoint resume, §6.3). */
  recoverable(): NaeiTask[] {
    return this.list({ status: "RUNNING" })
      .concat(this.list({ status: "VERIFYING" }))
      .concat(this.list({ status: "AWAITING_APPROVAL" }));
  }
}

// ---------------------------------------------------------------------------
// Isolated workspaces (directive §6.3)
// ---------------------------------------------------------------------------

export class WorkspaceManager {
  constructor(private readonly root: string) {}

  create(taskId: string): string {
    const dir = join(this.root, taskId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "workspace.json"), safeJsonStringify({ taskId, createdAt: new Date().toISOString() }));
    return dir;
  }

  write(dir: string, file: string, content: string): string {
    const path = join(dir, file);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, content);
    return path;
  }

  read(dir: string, file: string): string | null {
    const path = join(dir, file);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }

  listFiles(dir: string): string[] {
    return existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String) : [];
  }

  dispose(dir: string): void {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// NAEI engine (directive §6.3, §6.4)
// ---------------------------------------------------------------------------

export interface NaeiConfig {
  db: NexusDb;
  fabric: ModelFabric;
  workspaceRoot: string;
  clock?: Clock;
}

export class NaeiEngine {
  readonly agents: AgentRegistry;
  readonly tasks: NaeiTaskRepository;
  readonly workspaces: WorkspaceManager;
  private readonly fabric: ModelFabric;
  private readonly clock: Clock;

  constructor(cfg: NaeiConfig) {
    this.agents = new AgentRegistry(cfg.db);
    this.tasks = new NaeiTaskRepository(cfg.db);
    this.workspaces = new WorkspaceManager(cfg.workspaceRoot);
    this.fabric = cfg.fabric;
    this.clock = cfg.clock ?? systemClock;
  }

  /** Submit an engineering requirement (engineering execution protocol §6.4 step 1). */
  submit(input: {
    requirement: string;
    affectedSubsystems?: string[];
    acceptanceCriteria: string[];
    dependsOn?: string[];
    preferredRole?: AgentRole;
    requiresApproval?: boolean;
  }): NaeiTask {
    const now = this.clock.now().toISOString();
    const task: NaeiTask = {
      id: nexusId(ID_PREFIXES.task),
      requirement: input.requirement,
      affectedSubsystems: input.affectedSubsystems ?? [],
      acceptanceCriteria: input.acceptanceCriteria,
      dependsOn: input.dependsOn ?? [],
      status: "QUEUED",
      attempts: 0,
      requiresApproval: input.requiresApproval ?? false,
      approval: input.requiresApproval ? { requested: false, granted: false } : undefined,
      createdAt: now, updatedAt: now,
    };
    this.tasks.save(task);
    return task;
  }

  /**
   * Execute one ready task end-to-end: assign specialist → analyse →
   * implement (workspace artifacts) → self-check → independent verification.
   * The implementing agent NEVER certifies its own work (§6.4 step 14).
   */
  async executeOne(preferredRole?: AgentRole): Promise<Result<NaeiTask>> {
    const ready = this.tasks.ready();
    if (ready.length === 0) return err(new NexusError("NOT_FOUND", "no ready NAEI tasks"));
    const task = ready[0]!;

    // human approval gate for consequential tasks (§6.3)
    if (task.requiresApproval && task.approval && !task.approval.granted) {
      task.approval.requested = true;
      task.status = "AWAITING_APPROVAL";
      this.touch(task);
      return ok(task);
    }

    // assign specialist
    const role = preferredRole ?? task.affectedSubsystems.includes("unreal") ? "unreal_engineer" : undefined;
    const agent =
      (role ? this.agents.findByRole(role) : null) ??
      this.agents.findByRole("backend_engineer") ??
      this.agents.list({ active: true })[0];
    if (!agent) return err(new NexusError("DEPENDENCY_ERROR", "no active agents registered"));
    task.assignedAgentId = agent.agentId;
    task.status = "ASSIGNED";
    task.attempts += 1;
    this.touch(task);

    // workspace isolation
    const ws = this.workspaces.create(task.id);
    task.workspacePath = ws;

    // ---- phase 1: analysis (parse requirement, identify affected subsystems)
    const analysis = await this.agentReasoning(agent, `
REQUIREMENT: ${task.requirement}
ACCEPTANCE CRITERIA:
${task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}
Identify the affected subsystems, the implementation approach, and the test strategy. Be specific.`);
    this.workspaces.write(ws, "analysis.md", `# Analysis\n\n${analysis}`);
    task.checkpoint = { phase: "analysis", at: this.clock.now().toISOString() };
    task.status = "RUNNING";
    this.touch(task);

    // ---- phase 2: implementation (produce the work product)
    const implementation = await this.agentReasoning(agent, `
REQUIREMENT: ${task.requirement}
ANALYSIS:
${analysis}
Produce the implementation. If code is required, output the complete file contents in fenced blocks with file paths. If configuration, schemas or documentation is required, produce those artifacts.`);
    this.workspaces.write(ws, "implementation.md", `# Implementation\n\n${implementation}`);
    task.checkpoint = { phase: "implementation", at: this.clock.now().toISOString() };
    this.touch(task);

    // ---- phase 3: independent verification (different agent, different division role)
    const verifier = this.agents.findByRole("verification_engineer") ?? this.agents.list({ active: true }).find((a) => a.agentId !== agent.agentId);
    if (!verifier) return err(new NexusError("DEPENDENCY_ERROR", "no independent verifier available"));
    const verification = await this.fabric.complete({
      taskType: "reasoning",
      systemPrompt: `You are NAEI's independent verification engineer (${verifier.name}). You did NOT write this implementation. Inspect the requirement, acceptance criteria, and produced work strictly. Return ONLY JSON:
{"verdict": "PASS" | "FAIL", "findings": ["<specific finding>"], "evidence": ["<evidence reference>"]}
Reject if any acceptance criterion lacks evidence. Reject vague or missing implementations.`,
      messages: [{
        role: "user",
        content: `REQUIREMENT: ${task.requirement}\n\nACCEPTANCE CRITERIA:\n${task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nIMPLEMENTATION TO VERIFY:\n${implementation.slice(0, 6_000)}\n\nANALYSIS CONTEXT:\n${analysis.slice(0, 2_000)}`,
      }],
      jsonSchema: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["PASS", "FAIL"] },
          findings: { type: "array", items: { type: "string" } },
          evidence: { type: "array", items: { type: "string" } },
        },
        required: ["verdict", "findings"],
      },
      maxTokens: 800,
    });

    task.status = "VERIFYING";
    this.touch(task);

    const verdict = verification.ok && verification.value.parsedJson
      ? (verification.value.parsedJson as { verdict?: string; findings?: string[]; evidence?: string[] })
      : { verdict: "FAIL", findings: ["verification model unavailable — refusing to self-certify"], evidence: [] };
    task.verification = {
      verifierAgentId: verifier.agentId,
      verdict: verdict.verdict === "PASS" ? "PASS" : "FAIL",
      findings: verdict.findings ?? [],
      evidence: verdict.evidence ?? [],
    };
    this.workspaces.write(ws, "verification.json", safeJsonStringify(task.verification));

    if (task.verification.verdict === "PASS") {
      task.status = "VERIFIED";
      task.result = {
        agent: agent.name,
        role: agent.role,
        analysis: analysis.slice(0, 2_000),
        implementation: implementation.slice(0, 6_000),
        workspace: ws,
      };
    } else {
      task.status = task.attempts >= 2 ? "ESCALATED" : "FAILED";
    }
    this.touch(task);
    return ok(task);
  }

  /** Owner approves a consequential task (approval gate release). */
  approve(taskId: string, approvedBy: string): Result<NaeiTask> {
    const task = this.tasks.get(taskId);
    if (!task) return err(new NexusError("NOT_FOUND", "task not found"));
    if (!task.requiresApproval) return err(new NexusError("VALIDATION_ERROR", "task does not require approval"));
    task.approval = { requested: true, granted: true, grantedBy: approvedBy };
    task.status = "QUEUED";
    this.touch(task);
    return ok(task);
  }

  /** Mark a VERIFIED task committed (integration point for commit pipeline). */
  commit(taskId: string): Result<NaeiTask> {
    const task = this.tasks.get(taskId);
    if (!task) return err(new NexusError("NOT_FOUND", "task not found"));
    if (task.status !== "VERIFIED") return err(new NexusError("CONFLICT", `cannot commit task in status ${task.status}`));
    task.status = "COMMITTED";
    this.touch(task);
    return ok(task);
  }

  /** Restart recovery: resume mid-flight tasks from checkpoints (§21). */
  async recoverInterrupted(): Promise<NaeiTask[]> {
    const recoverable = this.tasks.recoverable();
    const outcomes: NaeiTask[] = [];
    for (const t of recoverable) {
      if (t.status === "AWAITING_APPROVAL") { outcomes.push(t); continue; }
      // re-queue for re-execution from last checkpoint
      t.status = "QUEUED";
      this.touch(t);
      outcomes.push(t);
    }
    return outcomes;
  }

  private async agentReasoning(agent: AgentContract, prompt: string): Promise<string> {
    const r = await this.fabric.complete({
      taskType: agent.modelAssignment.taskType,
      systemPrompt: `You are ${agent.name}, NAEI ${agent.role.replace(/_/g, " ")} in the ${agent.division} division. Your capabilities: ${agent.capabilities.join(", ")}. Produce precise, implementable engineering output.`,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2_000,
    });
    return r.ok ? r.value.content : `[model unavailable — ${r.error.message}]`;
  }

  private touch(task: NaeiTask): void {
    task.updatedAt = this.clock.now().toISOString();
    this.tasks.save(task);
  }
}
