/**
 * @nexus/model-fabric — provider-independent model orchestration
 * (directive §5.3). Registry + adapters + capability-based routing +
 * fallback chains + health tracking + cost/usage accounting.
 *
 * Providers:
 *  - cloudflare : Workers AI REST   (VERIFIED LIVE from build sandbox 2026-11-14)
 *  - openai     : Chat Completions  (verified live from Railway US egress;
 *                 sandbox egress region is blocked by OpenAI — see ADR-007)
 *  - echo       : deterministic local provider for tests / offline mode
 */
import {
  NexusError, asNexusError, err, ok, withRetry, systemClock as systemClockRef,
  type Clock, type Result,
} from "@nexus/core";
import type {
  CompletionRequest, CompletionResponse, ModelDescriptor, ModelTaskType, ProviderId,
} from "@nexus/contracts";

// ---------------------------------------------------------------------------
// Provider adapter contract
// ---------------------------------------------------------------------------

export interface ProviderAdapter {
  readonly provider: ProviderId;
  complete(req: CompletionRequest, model: string): Promise<Result<CompletionResponse>>;
  healthCheck(): Promise<Result<boolean>>;
}

// ---------------------------------------------------------------------------
// Cloudflare Workers AI adapter (LIVE)
// ---------------------------------------------------------------------------

export class CloudflareAdapter implements ProviderAdapter {
  readonly provider = "cloudflare" as const;
  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async complete(req: CompletionRequest, model: string): Promise<Result<CompletionResponse>> {
    const started = Date.now();
    const messages = this.buildMessages(req);
    try {
      const res = await this.fetchFn(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages, max_tokens: req.maxTokens ?? 1024, temperature: req.temperature }),
        },
      );
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        return err(new NexusError("PROVIDER_ERROR", `cloudflare ${res.status}: ${body}`, { retryable: res.status >= 500 || res.status === 429 }));
      }
      const data = (await res.json()) as {
        success?: boolean;
        result?:
          | string
          | { response?: string }
          | { choices?: Array<{ message?: { content?: string } }> };
        errors?: unknown[];
      };
      let content: string | undefined;
      if (typeof data.result === "string") {
        content = data.result; // legacy raw shape
      } else if (data.result && typeof data.result === "object") {
        const r = data.result as { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> };
        // NB: `response` may be present as a non-string object — only accept real strings.
        if (typeof r.response === "string") content = r.response;
        else if (typeof r.choices?.[0]?.message?.content === "string") content = r.choices[0].message.content;
      }
      if (data.success === false || typeof content !== "string") {
        return err(new NexusError("PROVIDER_ERROR", `cloudflare unusable response: ${JSON.stringify(data).slice(0, 300)}`));
      }
      const outTokens = Math.ceil(content.length / 4);
      const inTokens = Math.ceil(messages.map((m) => m.content).join(" ").length / 4);
      return ok(this.finalise(req, `cloudflare:${model}`, content, inTokens, outTokens, started));
    } catch (e) {
      return err(asNexusError(e));
    }
  }

  async healthCheck(): Promise<Result<boolean>> {
    try {
      const res = await this.fetchFn(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/models/search?per_page=1`,
        { headers: { Authorization: `Bearer ${this.apiToken}` } },
      );
      return ok(res.ok);
    } catch (e) {
      return err(asNexusError(e));
    }
  }

  private buildMessages(req: CompletionRequest) {
    const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    let system = req.systemPrompt ?? "";
    if (req.jsonSchema) system += `\nRespond with ONLY a JSON value matching this schema (no prose, no code fence): ${JSON.stringify(req.jsonSchema)}`;
    if (system) msgs.push({ role: "system", content: system });
    msgs.push(...req.messages.map((m) => ({ role: m.role, content: m.content })));
    return msgs;
  }

  private finalise(req: CompletionRequest, modelId: string, content: string, inTok: number, outTok: number, started: number): CompletionResponse {
    let parsedJson: unknown;
    if (req.jsonSchema) {
      const attempt = extractJson(content);
      if (attempt) parsedJson = attempt;
    }
    return {
      modelId, content, parsedJson,
      usage: { inputTokens: inTok, outputTokens: outTok },
      latencyMs: Date.now() - started,
      provider: "cloudflare",
    };
  }
}

// ---------------------------------------------------------------------------
// OpenAI adapter (live from Railway US egress)
// ---------------------------------------------------------------------------

export class OpenAIAdapter implements ProviderAdapter {
  readonly provider = "openai" as const;
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async complete(req: CompletionRequest, model: string): Promise<Result<CompletionResponse>> {
    const started = Date.now();
    const messages: Array<{ role: string; content: string }> = [];
    let system = req.systemPrompt ?? "";
    if (system) messages.push({ role: "system", content: system });
    messages.push(...req.messages.map((m) => ({ role: m.role, content: m.content })));

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature,
    };
    if (req.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "nexus_output", schema: req.jsonSchema, strict: false },
      };
    } else if (system && /ONLY a JSON value/.test(system)) {
      body.response_format = { type: "json_object" };
    }

    try {
      const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300);
        const retryable = res.status >= 500 || res.status === 429;
        return err(new NexusError("PROVIDER_ERROR", `openai ${res.status}: ${text}`, { retryable }));
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        return err(new NexusError("PROVIDER_ERROR", "openai returned no content"));
      }
      let parsedJson: unknown;
      if (req.jsonSchema) {
        const attempt = extractJson(content);
        if (attempt) parsedJson = attempt;
      }
      return ok({
        modelId: `openai:${model}`, content, parsedJson,
        usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
        latencyMs: Date.now() - started,
        provider: "openai",
      });
    } catch (e) {
      return err(asNexusError(e));
    }
  }

  async healthCheck(): Promise<Result<boolean>> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return ok(res.ok);
    } catch (e) {
      return err(asNexusError(e));
    }
  }
}

// ---------------------------------------------------------------------------
// Echo adapter — deterministic, zero-network (tests & degraded mode)
// ---------------------------------------------------------------------------

export class EchoAdapter implements ProviderAdapter {
  readonly provider = "echo" as const;
  async complete(req: CompletionRequest, model: string): Promise<Result<CompletionResponse>> {
    const started = Date.now();
    const last = req.messages[req.messages.length - 1];
    const content = `[echo:${model}] ${last?.content ?? ""}`;
    let parsedJson: unknown;
    if (req.jsonSchema) {
      parsedJson = extractJson(content) ?? (req.jsonSchema.type === "array" ? [] : {});
    }
    return ok({
      modelId: `echo:${model}`, content, parsedJson,
      usage: { inputTokens: 1, outputTokens: 1 },
      latencyMs: Date.now() - started,
      provider: "echo",
    });
  }
  async healthCheck(): Promise<Result<boolean>> {
    return ok(true);
  }
}

/** Parse a JSON object/array out of possibly fenced / prefixed model output. */
export function extractJson(text: string): unknown | undefined {
  const direct = tryJson(text);
  if (direct !== undefined) return direct;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    const v = tryJson(fenced[1].trim());
    if (v !== undefined) return v;
  }
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  const start = firstBracket >= 0 && (firstBracket < firstBrace || firstBrace < 0) ? firstBracket : firstBrace;
  if (start >= 0) {
    const v = tryJson(text.slice(start));
    if (v !== undefined) return v;
  }
  return undefined;
}
function tryJson(s: string): unknown | undefined {
  try { return JSON.parse(s); } catch { return undefined; }
}

// ---------------------------------------------------------------------------
// Registry — model catalog with capability profiles
// ---------------------------------------------------------------------------

export function defaultModelCatalog(): ModelDescriptor[] {
  return [
    {
      id: "cloudflare:llama-3.1-8b-instruct", provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct",
      capabilities: {
        taskTypes: ["coding", "reasoning", "summarisation", "classification", "extraction", "planning"],
        contextWindow: 128_000, maxOutputTokens: 4_096,
        supportsJsonOutput: true, supportsTools: false,
        inputModalities: ["text"], latencyClass: "fast",
        costPer1kInputTokens: 0.0002, costPer1kOutputTokens: 0.0002,
      },
    },
    {
      id: "cloudflare:qwen2.5-coder-32b", provider: "cloudflare", model: "@cf/qwen/qwen2.5-coder-32b-instruct",
      capabilities: {
        taskTypes: ["coding", "reasoning"],
        contextWindow: 32_000, maxOutputTokens: 4_096,
        supportsJsonOutput: true, supportsTools: false,
        inputModalities: ["text"], latencyClass: "balanced",
        costPer1kInputTokens: 0.0003, costPer1kOutputTokens: 0.0005,
      },
    },
    {
      id: "openai:gpt-4o-mini", provider: "openai", model: "gpt-4o-mini",
      capabilities: {
        taskTypes: ["coding", "reasoning", "research", "vision", "summarisation", "classification", "planning", "creative", "extraction", "speech"],
        contextWindow: 128_000, maxOutputTokens: 16_384,
        supportsJsonOutput: true, supportsTools: true,
        inputModalities: ["text", "image"], latencyClass: "fast",
        costPer1kInputTokens: 0.00015, costPer1kOutputTokens: 0.0006,
      },
    },
    {
      id: "openai:gpt-4o", provider: "openai", model: "gpt-4o",
      capabilities: {
        taskTypes: ["reasoning", "research", "vision", "planning", "creative"],
        contextWindow: 128_000, maxOutputTokens: 16_384,
        supportsJsonOutput: true, supportsTools: true,
        inputModalities: ["text", "image"], latencyClass: "deep",
        costPer1kInputTokens: 0.0025, costPer1kOutputTokens: 0.01,
      },
    },
    {
      id: "echo:default", provider: "echo", model: "default",
      capabilities: {
        taskTypes: ["coding", "reasoning", "research", "vision", "speech", "summarisation", "classification", "planning", "creative", "embedding", "extraction"],
        contextWindow: 1_000_000, maxOutputTokens: 4_096,
        supportsJsonOutput: true, supportsTools: false,
        inputModalities: ["text"], latencyClass: "fast",
        costPer1kInputTokens: 0, costPer1kOutputTokens: 0,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Fabric — routing, fallback, health, usage accounting
// ---------------------------------------------------------------------------

export interface UsageSink {
  (event: { modelId: string; provider: ProviderId; taskType: ModelTaskType; inputTokens: number; outputTokens: number; costUsd: number; latencyMs: number; success: boolean; correlationId?: string }): void;
}

interface HealthRecord {
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError?: string;
  totalCalls: number;
  totalFailures: number;
  latencyEmaMs: number | null;
}

export interface FabricConfig {
  providers: Partial<Record<ProviderId, ProviderAdapter>>;
  catalog?: ModelDescriptor[];
  usageSink?: UsageSink;
  clock?: Clock;
  maxFallbacks?: number;
  disableEcho?: boolean; // never silently fall back to echo in production paths
}

export class ModelFabric {
  private readonly catalog: ModelDescriptor[];
  private readonly providers: Partial<Record<ProviderId, ProviderAdapter>>;
  private readonly health = new Map<string, HealthRecord>();
  private readonly clock: Clock;
  private readonly usageSink?: UsageSink;
  private readonly maxFallbacks: number;
  private readonly disableEcho: boolean;

  constructor(cfg: FabricConfig) {
    this.catalog = cfg.catalog ?? defaultModelCatalog();
    this.providers = cfg.providers;
    this.usageSink = cfg.usageSink;
    this.clock = cfg.clock ?? systemClockRef;
    this.maxFallbacks = cfg.maxFallbacks ?? 2;
    this.disableEcho = cfg.disableEcho ?? false;
  }

  private now(): number {
    return this.clock.nowMs();
  }

  listModels(): ModelDescriptor[] {
    return [...this.catalog];
  }

  /** Rank candidate models for a task type (capability > health > cost). */
  rankFor(taskType: ModelTaskType, preferredModel?: string): ModelDescriptor[] {
    const capable = this.catalog.filter((m) => m.capabilities.taskTypes.includes(taskType));
    const scored = capable.map((m) => {
      const h = this.health.get(m.id);
      const penalty = h ? Math.min(0.6, h.consecutiveFailures * 0.2) + (h.totalCalls > 0 ? h.totalFailures / h.totalCalls * 0.2 : 0) : 0;
      const costScore = 1 - Math.min(1, (m.capabilities.costPer1kInputTokens + m.capabilities.costPer1kOutputTokens) / 0.0125);
      const latencyScore = m.capabilities.latencyClass === "fast" ? 1 : m.capabilities.latencyClass === "balanced" ? 0.8 : 0.6;
      const providerAvailable = this.hasProvider(m.provider);
      const score =
        (preferredModel === m.id ? 5 : 0) +
        (providerAvailable ? 1 : -10) +
        costScore * 0.3 + latencyScore * 0.2 - penalty +
        (m.provider === "echo" ? -3 : 0); // echo is last resort even when enabled
      return { m, score };
    });
    return scored.sort((a, b) => b.score - a.score).map((s) => s.m);
  }

  private hasProvider(p: ProviderId): boolean {
    return this.providers[p] !== undefined;
  }

  async complete(req: CompletionRequest): Promise<Result<CompletionResponse>> {
    const ranked = this.rankFor(req.taskType, req.preferredModel);
    const candidates = ranked
      .filter((m) => this.hasProvider(m.provider))
      .filter((m) => !(this.disableEcho && m.provider === "echo"))
      .slice(0, this.maxFallbacks + 1);
    if (candidates.length === 0) {
      return err(new NexusError("PROVIDER_ERROR", `no provider available for task type ${req.taskType}`));
    }
    let lastError: NexusError | null = null;
    for (const m of candidates) {
      const adapter = this.providers[m.provider]!;
      const attempt = await withRetry(
        () => adapter.complete({ ...req, maxTokens: req.maxTokens ?? m.capabilities.maxOutputTokens }, m.model),
        { attempts: m.provider === "echo" ? 1 : 2 },
      );
      if (attempt.ok) {
        this.recordSuccess(m.id, attempt.value.latencyMs);
        this.usageSink?.({
          modelId: m.id, provider: m.provider, taskType: req.taskType,
          inputTokens: attempt.value.usage.inputTokens, outputTokens: attempt.value.usage.outputTokens,
          costUsd:
            (attempt.value.usage.inputTokens / 1000) * m.capabilities.costPer1kInputTokens +
            (attempt.value.usage.outputTokens / 1000) * m.capabilities.costPer1kOutputTokens,
          latencyMs: attempt.value.latencyMs, success: true, correlationId: req.correlationId,
        });
        return attempt;
      }
      lastError = attempt.error;
      this.recordFailure(m.id, attempt.error);
    }
    return err(lastError ?? new NexusError("PROVIDER_ERROR", "all candidates failed"));
  }

  providerHealth(): Array<{ modelId: string; consecutiveFailures: number; totalCalls: number; totalFailures: number; latencyEmaMs: number | null; lastError?: string }> {
    return [...this.health.entries()].map(([modelId, h]) => ({
      modelId,
      consecutiveFailures: h.consecutiveFailures,
      totalCalls: h.totalCalls,
      totalFailures: h.totalFailures,
      latencyEmaMs: h.latencyEmaMs,
      lastError: h.lastError,
    }));
  }

  private recordSuccess(modelId: string, latencyMs: number): void {
    const h = this.ensure(modelId);
    h.consecutiveFailures = 0;
    h.lastSuccessAt = this.now();
    h.totalCalls += 1;
    h.latencyEmaMs = h.latencyEmaMs === null ? latencyMs : h.latencyEmaMs * 0.7 + latencyMs * 0.3;
  }

  private recordFailure(modelId: string, e: NexusError): void {
    const h = this.ensure(modelId);
    h.consecutiveFailures += 1;
    h.lastErrorAt = this.now();
    h.lastError = `${e.code}: ${e.message}`.slice(0, 200);
    h.totalCalls += 1;
    h.totalFailures += 1;
  }

  private ensure(modelId: string): HealthRecord {
    let h = this.health.get(modelId);
    if (!h) {
      h = { consecutiveFailures: 0, lastSuccessAt: null, lastErrorAt: null, totalCalls: 0, totalFailures: 0, latencyEmaMs: null };
      this.health.set(modelId, h);
    }
    return h;
  }
}

// ---------------------------------------------------------------------------
// Construction from environment
// ---------------------------------------------------------------------------

export function fabricFromEnv(env: Record<string, string | undefined>, usageSink?: UsageSink): { fabric: ModelFabric; providers: ProviderId[] } {
  const providers: Partial<Record<ProviderId, ProviderAdapter>> = {};
  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
    providers.cloudflare = new CloudflareAdapter(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN);
  }
  if (env.OPENAI_API_KEY) {
    providers.openai = new OpenAIAdapter(env.OPENAI_API_KEY);
  }
  providers.echo = new EchoAdapter();
  // ADR-007: echo is a deterministic TEST STUB. In the API it is OFF by
  // default so a missing-credentials deployment fails loudly instead of
  // silently serving deterministic fallbacks as "intelligence". Opt back in
  // explicitly for local development with NEXUS_ALLOW_ECHO=true.
  const fabric = new ModelFabric({ providers, usageSink, disableEcho: env.NEXUS_ALLOW_ECHO !== "true" });
  return { fabric, providers: Object.keys(providers) as ProviderId[] };
}
