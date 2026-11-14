/**
 * @nexus/contracts — canonical, versioned schemas for every cross-subsystem
 * boundary. These zod schemas are the single source of truth for entities,
 * API payloads, agent contracts and MCP manifests (directive §7.2, §12.4).
 */
import { z } from "zod";

// ===========================================================================
// Primitives
// ===========================================================================

export const IdSchema = z.string().regex(/^nexus_[a-z0-9]+_[0-9a-f-]{36}$/, "nexus id");
export const IsoTimestamp = z.string().datetime();
export const JsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(z.string(), JsonValue)]),
);

// ===========================================================================
// Requirements traceability (directive §16)
// ===========================================================================

export const RequirementStatus = z.enum([
  "DISCOVERED", "SPECIFIED", "DESIGNED", "IMPLEMENTING", "INTEGRATING",
  "TESTING", "REPAIRING", "VERIFIED", "DEPLOYED", "BLOCKED",
]);
export type RequirementStatus = z.infer<typeof RequirementStatus>;

export const RequirementSchema = z.object({
  id: z.string(),                       // e.g. "JAR-5.4"
  product: z.enum(["JARVIS", "NAEI", "NEXUS_WORLD", "PLATFORM", "INTEGRATION"]),
  directive: z.string(),                // directive section, e.g. "§5.4"
  title: z.string(),
  behaviour: z.string(),
  subsystem: z.string().optional(),
  dependsOn: z.array(z.string()).default([]),
  status: RequirementStatus,
  evidence: z.array(z.object({
    kind: z.enum(["test", "commit", "deployment", "report"]),
    reference: z.string(),
    timestamp: IsoTimestamp.optional(),
  })).default([]),
  blockedBy: z.string().optional(),     // exact limitation when BLOCKED
});

// ===========================================================================
// Engineering ledger (directive §17)
// ===========================================================================

export const LedgerTaskSchema = z.object({
  taskId: z.string(),
  requirementIds: z.array(z.string()),
  scope: z.string(),
  dependencies: z.array(z.string()),
  filesAffected: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "BLOCKED"]),
  tests: z.array(z.string()),
  commit: z.string().optional(),
  notes: z.string().optional(),
});

// ===========================================================================
// Technology acquisition registry (directive §3)
// ===========================================================================

export const TechStatus = z.enum([
  "CANDIDATE", "ASSESSING", "ADOPTED", "ADAPTED", "EXTRACTED", "REJECTED", "PENDING_ENVIRONMENT",
]);
export type TechStatus = z.infer<typeof TechStatus>;

export const TechnologyRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  repository: z.string().url().optional(),
  version: z.string().optional(),
  licence: z.string().optional(),
  provenance: z.string().optional(),
  capabilities: z.array(z.string()),
  category: z.enum([
    "AI_INTELLIGENCE", "AUTONOMOUS_ENGINEERING", "WORLD_PRODUCTION", "CREATIVE_INTELLIGENCE",
    "WORLD_SIMULATION", "MCP", "INFRASTRUCTURE", "TOOLING",
  ]),
  decision: TechStatus,
  decisionRationale: z.string(),
  integrationAdapter: z.string().optional(),
  connectedServices: z.array(z.string()).default([]),
  compatibility: z.array(z.string()).default([]),
  securityAssessment: z.string().optional(),
  testResults: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string().optional() })).default([]),
  operationalStatus: z.enum(["NOT_INSTALLED", "INSTALLED", "INTEGRATED", "LIVE", "UNAVAILABLE"]).default("NOT_INSTALLED"),
  upgradeStrategy: z.string().optional(),
  assessedAt: IsoTimestamp,
});

// ===========================================================================
// Model fabric (directive §5.3)
// ===========================================================================

export const ModelTaskType = z.enum([
  "coding", "reasoning", "research", "vision", "speech", "summarisation",
  "classification", "planning", "creative", "embedding", "extraction",
]);
export type ModelTaskType = z.infer<typeof ModelTaskType>;

export const ProviderId = z.enum(["cloudflare", "openai", "echo"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const CapabilityProfileSchema = z.object({
  taskTypes: z.array(ModelTaskType),
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  supportsJsonOutput: z.boolean(),
  supportsTools: z.boolean(),
  inputModalities: z.array(z.enum(["text", "image", "audio"])),
  latencyClass: z.enum(["fast", "balanced", "deep"]),
  costPer1kInputTokens: z.number().nonnegative(),
  costPer1kOutputTokens: z.number().nonnegative(),
});

export const ModelDescriptorSchema = z.object({
  id: z.string(),                       // "cloudflare:llama-3.1-8b-instruct"
  provider: ProviderId,
  model: z.string(),
  capabilities: CapabilityProfileSchema,
});

export const CompletionRequestSchema = z.object({
  taskType: ModelTaskType,
  systemPrompt: z.string().optional(),
  messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() })),
  maxTokens: z.number().int().positive().max(32_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  jsonSchema: z.record(z.string(), JsonValue).optional(), // structured output request
  preferredModel: z.string().optional(),
  correlationId: z.string().optional(),
});

export const CompletionResponseSchema = z.object({
  modelId: z.string(),
  content: z.string(),
  parsedJson: JsonValue.optional(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  latencyMs: z.number(),
  provider: ProviderId,
});

// ===========================================================================
// Memory architecture (directive §5.4)
// ===========================================================================

export const MemoryKind = z.enum([
  "fact", "assumption", "opinion", "preference", "uncertain", "event_record", "procedure",
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemoryTier = z.enum([
  "working", "episodic", "semantic", "procedural", "personal",
  "project", "event", "relationship", "operational",
]);
export type MemoryTier = z.infer<typeof MemoryTier>;

export const MemoryRecordSchema = z.object({
  id: IdSchema,
  scope: z.string(),                    // "jarvis", "naei:architect", "world:res:<id>"
  tier: MemoryTier,
  kind: MemoryKind,
  title: z.string(),
  content: z.string(),
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  provenance: z.object({
    source: z.enum(["user", "agent", "system", "observation", "inference"]),
    sourceId: z.string().optional(),    // task/agent/event id
    createdAt: IsoTimestamp,
  }),
  tags: z.array(z.string()).default([]),
  accessLevel: z.enum(["private", "scope", "shared"]).default("scope"),
  lastAccessedAt: IsoTimestamp.optional(),
  accessCount: z.number().int().nonnegative().default(0),
  supersededById: IdSchema.optional(),
  expiresAt: IsoTimestamp.optional(),
});

export const MemoryQuerySchema = z.object({
  scope: z.string(),
  tiers: z.array(MemoryTier).optional(),
  tags: z.array(z.string()).optional(),
  textQuery: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(10),
  minImportance: z.number().min(0).max(1).optional(),
});

// ===========================================================================
// JARVIS orchestrator (directive §5.2, §5.6)
// ===========================================================================

export const TaskState = z.enum([
  "RECEIVED", "INTERPRETED", "CONTEXTUALISED", "PLANNED", "VALIDATED",
  "AUTHORISED", "EXECUTING", "EVALUATING", "COMPLETED", "RECOVERY_REQUIRED",
]);
export type TaskStateValue = z.infer<typeof TaskState>;

export const PlanStepSchema = z.object({
  stepId: z.string(),
  description: z.string(),
  tool: z.string().optional(),          // MCP tool / internal capability
  agentRole: z.string().optional(),     // delegated NAEI role
  dependsOn: z.array(z.string()).default([]),
  params: z.record(z.string(), JsonValue).default({}),
  completionCriteria: z.string(),
});

export const ExecutionStepResultSchema = z.object({
  stepId: z.string(),
  status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"]),
  output: JsonValue.optional(),
  error: z.string().optional(),
  startedAt: IsoTimestamp.optional(),
  finishedAt: IsoTimestamp.optional(),
});

export const JarvisTaskSchema = z.object({
  id: IdSchema,
  objective: z.string(),
  origin: z.enum(["user", "agent", "system", "schedule"]),
  state: TaskState,
  interpretation: z.object({
    intent: z.string(),
    constraints: z.array(z.string()).default([]),
    successCriteria: z.array(z.string()),
    ambiguity: z.string().optional(),
  }).optional(),
  contextRefs: z.array(IdSchema).default([]),
  plan: z.array(PlanStepSchema).default([]),
  stepResults: z.array(ExecutionStepResultSchema).default([]),
  evaluation: z.object({
    objectiveMet: z.boolean(),
    summary: z.string(),
    unmetCriteria: z.array(z.string()).default([]),
  }).optional(),
  recoveryAttempts: z.number().int().nonnegative().default(0),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  completedAt: IsoTimestamp.optional(),
});

// ===========================================================================
// NAEI (directive §6)
// ===========================================================================

export const AgentRoleSchema = z.enum([
  "principal_architect", "infrastructure_architect", "backend_engineer", "api_engineer",
  "frontend_engineer", "database_engineer", "automation_engineer",
  "unreal_engineer", "gameplay_engineer", "simulation_engineer", "worldgen_engineer",
  "blender_engineer", "asset_pipeline_engineer",
  "ai_architect", "memory_engineer", "inference_engineer",
  "test_engineer", "security_engineer", "performance_engineer", "verification_engineer",
]);

export const AgentContractSchema = z.object({
  agentId: IdSchema,
  name: z.string(),
  role: AgentRoleSchema,
  division: z.enum(["SYSTEM_ARCHITECTURE", "SOFTWARE_ENGINEERING", "WORLD_ENGINEERING", "THREE_D_PRODUCTION", "AI_ENGINEERING", "QUALITY_RELIABILITY"]),
  capabilities: z.array(z.string()),
  modelAssignment: z.object({ taskType: ModelTaskType, preferredModel: z.string().optional() }),
  availableTools: z.array(z.string()).default([]),
  permissions: z.array(z.enum([
    "read_repo", "write_repo", "run_tests", "run_builds", "invoke_mcp",
    "request_approval", "commit", "deploy", "read_memory", "write_memory",
  ])),
  inputSchema: z.string().optional(),   // zod schema id or inline
  outputSchema: z.string().optional(),
  taskBudget: z.object({
    maxTasks: z.number().int().positive(),
    maxTokensPerTask: z.number().int().positive(),
    maxWallClockMsPerTask: z.number().int().positive(),
  }),
  memoryAccess: z.array(z.string()).default([]),   // memory scopes
  failurePolicy: z.enum(["retry_once", "retry_twice", "escalate", "fail_fast"]),
  active: z.boolean().default(true),
});

export const NaeiTaskStatus = z.enum([
  "QUEUED", "ASSIGNED", "RUNNING", "AWAITING_APPROVAL", "VERIFYING",
  "VERIFIED", "COMMITTED", "FAILED", "ESCALATED",
]);
export type NaeiTaskStatusValue = z.infer<typeof NaeiTaskStatus>;

export const NaeiTaskSchema = z.object({
  id: IdSchema,
  requirement: z.string(),
  affectedSubsystems: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  dependsOn: z.array(IdSchema).default([]),
  assignedAgentId: IdSchema.optional(),
  status: NaeiTaskStatus,
  workspacePath: z.string().optional(),
  checkpoint: z.record(z.string(), JsonValue).optional(),
  attempts: z.number().int().nonnegative().default(0),
  verification: z.object({
    verifierAgentId: IdSchema,
    verdict: z.enum(["PENDING", "PASS", "FAIL"]),
    findings: z.array(z.string()).default([]),
    evidence: z.array(z.string()).default([]),
  }).optional(),
  result: z.record(z.string(), JsonValue).optional(),
  requiresApproval: z.boolean().default(false),
  approval: z.object({ requested: z.boolean(), granted: z.boolean(), grantedBy: z.string().optional() }).optional(),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});

// ===========================================================================
// NEXUS WORLD entities (directive §7.2)
// ===========================================================================

export const Vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const SimulationFidelity = z.enum(["HIGH", "MEDIUM", "ABSTRACT"]);
export type SimulationFidelityValue = z.infer<typeof SimulationFidelity>;

export const WorldSchema = z.object({
  id: IdSchema,
  name: z.string(),
  simulationTime: z.number(),           // sim-milliseconds since epoch start
  timeScale: z.number().positive(),     // sim-ms per real-ms
  environment: z.object({
    season: z.enum(["spring", "summer", "autumn", "winter"]),
    weather: z.enum(["clear", "cloudy", "rain", "storm", "snow", "fog"]),
    timeOfDay: z.number().min(0).max(24), // hours
    dayOfYear: z.number().int().min(1).max(366),
  }),
  regions: z.array(z.object({ regionId: z.string(), name: z.string(), center: Vector3Schema, radius: z.number() })),
  config: z.object({
    tickIntervalMs: z.number().int().positive(),
    highFidelityRadius: z.number().positive(),
    mediumFidelityRadius: z.number().positive(),
    residentTargetPopulation: z.number().int().positive(),
  }),
  createdAt: IsoTimestamp,
});

export const NeedsSchema = z.object({
  energy: z.number().min(0).max(100),
  hunger: z.number().min(0).max(100),
  social: z.number().min(0).max(100),
  comfort: z.number().min(0).max(100),
  fun: z.number().min(0).max(100),
});

export const ResidentActivity = z.enum([
  "sleeping", "idle", "eating", "working", "commuting", "shopping",
  "socialising", "maintaining_home", "leisure", "exercising", "responding_to_event",
]);
export type ResidentActivityValue = z.infer<typeof ResidentActivity>;

export const ResidentSchema = z.object({
  id: IdSchema,
  worldId: IdSchema,
  name: z.object({ first: z.string(), last: z.string() }),
  personality: z.object({
    openness: z.number().min(0).max(1),
    conscientiousness: z.number().min(0).max(1),
    extraversion: z.number().min(0).max(1),
    agreeableness: z.number().min(0).max(1),
    neuroticism: z.number().min(0).max(1),
  }),
  needs: NeedsSchema,
  goals: z.array(z.object({ goalId: z.string(), description: z.string(), priority: z.number().min(0).max(1), progress: z.number().min(0).max(1) })),
  homePropertyId: IdSchema.optional(),
  employment: z.object({ businessId: IdSchema.optional(), role: z.string().optional(), salaryPerHour: z.number().nonnegative(), schedule: z.object({ startHour: z.number(), endHour: z.number(), days: z.array(z.number().int().min(0).max(6)) }) }).optional(),
  financialAccountId: IdSchema.optional(),
  possessionIds: z.array(IdSchema).default([]),
  relationshipIds: z.array(IdSchema).default([]),
  knowledgeRefs: z.array(z.string()).default([]), // causal-memory references the resident KNOWS
  emotionalState: z.object({ mood: z.number().min(-1).max(1), lastMoodUpdateSimTime: z.number() }),
  currentActivity: ResidentActivity,
  currentActivityDetail: z.string().optional(),
  position: Vector3Schema,
  fidelity: SimulationFidelity,
  routineSeed: z.number().int(),        // deterministic decision reproducibility
  alive: z.boolean().default(true),
});

export const VehicleSchema = z.object({
  id: IdSchema,
  worldId: IdSchema,
  model: z.string(),
  category: z.enum(["car", "sports", "supercar", "hypercar", "suv", "truck", "bus", "motorcycle", "scooter", "emergency", "aircraft", "helicopter", "boat", "ship"]),
  ownerId: IdSchema.optional(),         // resident id
  location: Vector3Schema,
  condition: z.number().min(0).max(1),
  fuel: z.number().min(0).max(1),
  modifications: z.array(z.string()).default([]),
  inUse: z.boolean().default(false),
});

export const PropertySchema = z.object({
  id: IdSchema,
  worldId: IdSchema,
  type: z.enum(["house", "apartment", "villa", "mansion", "penthouse", "townhouse", "hotel", "farm", "commercial", "garage"]),
  regionId: z.string(),
  location: Vector3Schema,
  ownerId: IdSchema.optional(),
  valuation: z.number().positive(),
  interiorState: z.record(z.string(), JsonValue).default({}),
  maintenance: z.number().min(0).max(1),
  utilities: z.object({ electricity: z.boolean(), water: z.boolean() }),
});

export const BusinessSchema = z.object({
  id: IdSchema,
  worldId: IdSchema,
  name: z.string(),
  kind: z.enum(["grocery", "restaurant", "retail", "garage_dealer", "fuel_station", "gym", "entertainment", "service", "manufacturer", "farm"]),
  regionId: z.string(),
  accountId: IdSchema,                  // financial account
  inventory: z.array(z.object({ sku: z.string(), name: z.string(), quantity: z.number().int().nonnegative(), unitPrice: z.number().positive() })),
  employeeIds: z.array(IdSchema).default([]),
  openHours: z.object({ open: z.number(), close: z.number() }),
});

export const AccountSchema = z.object({
  id: IdSchema,
  worldId: IdSchema,
  ownerType: z.enum(["resident", "business", "institution"]),
  ownerId: IdSchema.optional(),
  institutionId: IdSchema.optional(),
  currency: z.literal("NEX"),
  balance: z.number(),
});

export const TransactionSchema = z.object({
  id: IdSchema,
  worldId: IdSchema,
  fromAccountId: IdSchema.optional(),
  toAccountId: IdSchema.optional(),
  amount: z.number().positive(),
  reason: z.string(),
  eventRef: IdSchema.optional(),
  simTime: z.number(),
  createdAt: IsoTimestamp,
});

// ---------------------------------------------------------------------------
// Causal memory / event sourcing (directive §7.5)
// ---------------------------------------------------------------------------

export const KnowledgeLevel = z.enum(["world_truth", "direct_observation", "reported", "rumour", "belief", "incorrect"]);
export type KnowledgeLevelValue = z.infer<typeof KnowledgeLevel>;

export const WorldEventSchema = z.object({
  id: IdSchema,
  worldId: IdSchema,
  type: z.string(),                     // "vehicle_collision", "purchase", "employment_payment", ...
  simTime: z.number(),
  location: Vector3Schema.optional(),
  cause: z.string().optional(),
  causeEventId: IdSchema.optional(),
  participants: z.array(z.object({ residentId: IdSchema.optional(), role: z.string() })).default([]),
  witnesses: z.array(IdSchema).default([]),
  evidence: z.array(z.string()).default([]),
  effects: z.array(z.object({ target: z.string(), change: z.string() })).default([]),
  knowledge: z.array(z.object({ residentId: IdSchema, level: KnowledgeLevel, detail: z.string().optional() })).default([]),
  payload: z.record(z.string(), JsonValue).default({}),
});

// ===========================================================================
// MCP gateway (directive §4)
// ===========================================================================

export const McpTransportSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stdio"), command: z.string(), args: z.array(z.string()).default([]), env: z.record(z.string(), z.string()).default({}) }),
  z.object({ type: z.literal("http"), url: z.string().url(), token: z.string().optional() }),
]);

export const McpServerRegistrationSchema = z.object({
  // MCP Registry server.json-compatible identity (ADR-011)
  name: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "reverse-DNS name"),
  title: z.string(),
  description: z.string().max(200),
  version: z.string(),
  transport: McpTransportSchema,
  capabilities: z.array(z.string()).default([]),
  permission: z.enum(["auto", "approval_required", "disabled"]).default("approval_required"),
  toolAllowlist: z.array(z.string()).optional(),  // empty = all tools
  timeoutMs: z.number().int().positive().default(30_000),
  healthCheckIntervalMs: z.number().int().positive().default(60_000),
});

export const McpToolDescriptorSchema = z.object({
  serverName: z.string(),
  toolName: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), JsonValue).optional(),
});

export const McpInvocationSchema = z.object({
  serverName: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), JsonValue).default({}),
  correlationId: z.string().optional(),
  approvedBy: z.string().optional(),
});

export const McpInvocationResultSchema = z.object({
  ok: z.boolean(),
  serverName: z.string(),
  toolName: z.string(),
  result: JsonValue.optional(),
  error: z.string().optional(),
  durationMs: z.number(),
  auditId: IdSchema,
});

export const McpAuditEntrySchema = z.object({
  id: IdSchema,
  serverName: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), JsonValue).default({}),
  outcome: z.enum(["success", "error", "timeout", "rejected"]),
  errorDetail: z.string().optional(),
  durationMs: z.number(),
  invokedBy: z.string(),
  at: IsoTimestamp,
});

// ===========================================================================
// Observability (directive §14)
// ===========================================================================

export const HealthStatusSchema = z.object({
  component: z.string(),
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  detail: z.string().optional(),
  checkedAt: IsoTimestamp,
});

export const MetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  labels: z.record(z.string(), z.string()).default({}),
  at: IsoTimestamp,
});

// ===========================================================================
// API contracts (apps/nexus-api)
// ===========================================================================

export const CreateObjectiveRequest = z.object({
  objective: z.string().min(1).max(8_000),
  origin: z.enum(["user", "agent", "system", "schedule"]).default("user"),
});

export const AdvanceWorldRequest = z.object({
  simDurationMs: z.number().int().positive().max(86_400_000).optional(), // advance sim time by this much
  ticks: z.number().int().positive().max(1000).optional(),
});

export const CreateNaeiTaskRequest = z.object({
  requirement: z.string().min(1),
  affectedSubsystems: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).min(1),
  preferredRole: AgentRoleSchema.optional(),
  requiresApproval: z.boolean().default(false),
});

export const CreateMemoryRequest = MemoryRecordSchema.omit({ id: true, provenance: true }).extend({
  provenance: z.object({ source: z.enum(["user", "agent", "system", "observation", "inference"]), sourceId: z.string().optional(), createdAt: IsoTimestamp.optional() }).default({ source: "user" }),
});

export const EnvelopeSchema = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({ data: inner, meta: z.object({ requestId: z.string().optional(), at: IsoTimestamp.optional() }).optional() });

// ===========================================================================
// Versions — contract compatibility (directive §12.4)
// ===========================================================================

export const CONTRACT_VERSION = "1.0.0" as const;

// ===========================================================================
// Inferred types — the canonical entity/API types (single source of truth)
// ===========================================================================

export type Requirement = z.infer<typeof RequirementSchema>;
export type LedgerTask = z.infer<typeof LedgerTaskSchema>;
export type TechnologyRecord = z.infer<typeof TechnologyRecordSchema>;
export type CapabilityProfile = z.infer<typeof CapabilityProfileSchema>;
export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;
export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;
export type CompletionResponse = z.infer<typeof CompletionResponseSchema>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type MemoryQuery = z.infer<typeof MemoryQuerySchema>;
export type JarvisTask = z.infer<typeof JarvisTaskSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;
export type ExecutionStepResult = z.infer<typeof ExecutionStepResultSchema>;
export type AgentContract = z.infer<typeof AgentContractSchema>;
export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type NaeiTask = z.infer<typeof NaeiTaskSchema>;
export type Vector3 = z.infer<typeof Vector3Schema>;
export type World = z.infer<typeof WorldSchema>;
export type Resident = z.infer<typeof ResidentSchema>;
export type Vehicle = z.infer<typeof VehicleSchema>;
export type Property = z.infer<typeof PropertySchema>;
export type Business = z.infer<typeof BusinessSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type WorldEvent = z.infer<typeof WorldEventSchema>;
export type McpTransport = z.infer<typeof McpTransportSchema>;
export type McpServerRegistration = z.infer<typeof McpServerRegistrationSchema>;
export type McpToolDescriptor = z.infer<typeof McpToolDescriptorSchema>;
export type McpInvocation = z.infer<typeof McpInvocationSchema>;
export type McpInvocationResult = z.infer<typeof McpInvocationResultSchema>;
export type McpAuditEntry = z.infer<typeof McpAuditEntrySchema>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type Metric = z.infer<typeof MetricSchema>;
