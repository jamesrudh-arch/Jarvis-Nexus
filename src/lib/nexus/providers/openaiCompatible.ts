/**
 * JARVIS NEXUS — OpenAI-compatible LLM providers (D6 registry, session 7).
 *
 * Two new genuinely-free routes, both speaking the OpenAI Chat Completions
 * wire format (messages / temperature / max_tokens → choices[0].message.content):
 *
 *  1. `cloudflare_workers_ai` — Cloudflare Workers AI (OpenAI-compatible
 *     endpoint /ai/v1/chat/completions). FREE tier: 10,000 Neurons/day on the
 *     Workers FREE plan, no credit card, no subscription; beyond the daily
 *     allocation requests are rejected rather than billed (a card is required
 *     to spend anything), so there is NO automatic billing path. The owner's
 *     account already carries CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN in
 *     the production environment — the deploy alone activates the production
 *     LLM with zero new credentials.
 *     Sources: developers.cloudflare.com/workers-ai/platform/pricing (10k
 *     neurons/day free), /workers-ai/configuration/open-ai-compatibility
 *     (/ai/v1/chat/completions), cloudflare.com ("no credit card required").
 *
 *  2. `openai_compatible` — generic env-configured endpoint for ANY
 *     OpenAI-compatible server: local Ollama (free, own hardware), LM Studio,
 *     vLLM, or a free-tier cloud provider of the owner's choosing. Activates
 *     with LLM_OPENAI_COMPAT_URL + LLM_OPENAI_COMPAT_KEY + LLM_OPENAI_COMPAT_MODEL.
 *
 * Both are strictly server-side (no key is ever composed into client code),
 * abort on a 20 s budget, and throw on transport/HTTP errors so the registry
 * falls through honestly (brain.ts never fabricates intelligence).
 */
import type {
  LlmProvider,
  ChatCompletionRequest,
  ChatCompletionResult,
} from './types';

const REQUEST_TIMEOUT_MS = 20_000;

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string } | string;
}

/** Minimal shared OpenAI Chat Completions client for both providers. */
async function openAiChat(
  url: string,
  apiKey: string,
  model: string,
  req: ChatCompletionRequest
): Promise<ChatCompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as OpenAiChatResponse;
    if (!res.ok) {
      const detail = typeof data.error === 'string'
        ? data.error
        : data.error?.message || `HTTP ${res.status}`;
      throw new Error(`openai-compat ${res.status}: ${detail}`);
    }
    const content = data.choices?.[0]?.message?.content || '';
    if (!content.trim()) {
      throw new Error('openai-compat: empty completion');
    }
    return { content, providerId: '' }; // providerId set by the wrapper
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 1. Cloudflare Workers AI
// ---------------------------------------------------------------------------

export const CF_WORKERS_AI_ID = 'cloudflare_workers_ai';
export const CF_WORKERS_AI_DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

/** Free-tier guardrail: the Workers Free plan includes 10,000 Neurons/day at
 *  no charge. We cap requests per UTC day (in-memory, per process) so a
 *  runaway loop can never push against the allocation. Configurable via
 *  NEXUS_CF_AI_DAILY_REQUESTS (0 = unlimited). Exported for unit tests. */
export class DailyBudget {
  private day = '';
  private count = 0;
  private readonly limit: number;
  constructor(limit: number) {
    this.limit = limit;
  }
  tryConsume(): boolean {
    if (this.limit <= 0) return true;
    const today = new Date().toISOString().slice(0, 10); // UTC day
    if (today !== this.day) {
      this.day = today;
      this.count = 0;
    }
    if (this.count >= this.limit) return false;
    this.count += 1;
    return true;
  }
  status(): { used: number; limit: number; day: string } {
    return { used: this.count, limit: this.limit, day: this.day || new Date().toISOString().slice(0, 10) };
  }
}

export const cfAiBudget = new DailyBudget(
  Number.parseInt(process.env.NEXUS_CF_AI_DAILY_REQUESTS || '300', 10) || 300
);

function cfConfig(): { url: string; key: string; model: string } | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const key = process.env.CF_AI_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !key) return null;
  const model = process.env.NEXUS_CF_AI_MODEL || CF_WORKERS_AI_DEFAULT_MODEL;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
  return { url, key, model };
}

export const cfWorkersAiLlm: LlmProvider = {
  id: CF_WORKERS_AI_ID,
  async available(): Promise<boolean> {
    // Cheap probe only — never consumes the daily budget (chat() does).
    return cfConfig() !== null;
  },
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const cfg = cfConfig();
    if (!cfg) throw new Error('cloudflare_workers_ai: CLOUDFLARE_ACCOUNT_ID + token not configured');
    if (!cfAiBudget.tryConsume()) {
      throw new Error(`cloudflare_workers_ai: daily free-tier request budget exhausted (${cfAiBudget.status().limit}/day) — honest fallback instead of billing risk`);
    }
    const result = await openAiChat(cfg.url, cfg.key, cfg.model, req);
    return { ...result, providerId: CF_WORKERS_AI_ID };
  },
};

// ---------------------------------------------------------------------------
// 2. Generic OpenAI-compatible endpoint (Ollama / LM Studio / vLLM / any cloud)
// ---------------------------------------------------------------------------

export const OPENAI_COMPAT_ID = 'openai_compatible';

function compatConfig(): { url: string; key: string; model: string } | null {
  const base = (process.env.LLM_OPENAI_COMPAT_URL || '').trim();
  const key = (process.env.LLM_OPENAI_COMPAT_KEY || '').trim();
  const model = (process.env.LLM_OPENAI_COMPAT_MODEL || '').trim();
  if (!base || !model) return null;
  let url = base;
  if (!/\/chat\/completions\/?$/.test(url)) {
    url = url.replace(/\/+$/, '');
    if (!/\/v\d+$/.test(url)) url += '/v1';
    url += '/chat/completions';
  }
  return { url, key: key || 'not-needed', model };
}

export const openaiCompatLlm: LlmProvider = {
  id: OPENAI_COMPAT_ID,
  async available(): Promise<boolean> {
    return compatConfig() !== null;
  },
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const cfg = compatConfig();
    if (!cfg) throw new Error('openai_compatible: LLM_OPENAI_COMPAT_URL/MODEL not configured');
    const result = await openAiChat(cfg.url, cfg.key, cfg.model, req);
    return { ...result, providerId: OPENAI_COMPAT_ID };
  },
};
