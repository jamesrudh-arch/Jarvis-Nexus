/**
 * JARVIS NEXUS — Groq cloud inference provider (D6 registry).
 *
 * Why Groq (2026-11-13 provider selection, per the owner's Task-2 directive):
 *  - Genuinely free tier: no credit card, no trial clock, no auto-billing.
 *    Free keys (gsk_…) are gated only by rate limits (~1,000 req/day on
 *    llama-3.3-70b-class models, 14,400/day on llama-3.1-8b-instant;
 *    verified Oct 2026 — see RESEARCH_REGISTER).
 *  - OpenAI-compatible REST surface at https://api.groq.com/openai/v1/chat/completions
 *    — a plain fetch, zero new dependencies.
 *  - Fast LPU inference (hundreds of tokens/s) — the latency profile fits a
 *    spoken conversational assistant.
 *  - GitHub Models was evaluated and REJECTED: the inference API was fully
 *    retired on 2026-07-30 and no longer exists.
 *
 * Configuration: GROQ_API_KEY (Railway env var). Optional GROQ_MODEL selects
 * the model (default: llama-3.1-8b-instant — the highest daily-request free
 * tier; switch to llama-3.3-70b-versatile for reasoning quality).
 *
 * ASR: Groq also hosts whisper-large-v3 / -turbo on the same key
 * (audio/transcriptions endpoint, OpenAI-compatible). Enabled when
 * GROQ_ASR_MODEL is set (default enabled with whisper-large-v3-turbo;
 * ~2,000 free requests/day).
 *
 * TTS: NOT provided by Groq — the TTS chain still routes to zai_cloud_route
 * (or a future provider). This file intentionally registers no TTS provider.
 */
import type {
  LlmProvider,
  AsrProvider,
  ChatCompletionRequest,
  ChatCompletionResult,
  AsrRequest,
  AsrResult,
} from './types';

export const GROQ_PROVIDER_ID = 'groq_cloud';
const GROQ_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_LLM_MODEL = 'llama-3.1-8b-instant';
const DEFAULT_ASR_MODEL = 'whisper-large-v3-turbo';

interface GroqChatChoice {
  message?: { content?: string };
}
interface GroqChatResponse {
  choices?: GroqChatChoice[];
  error?: { message?: string };
}

async function groqFetch(
  path: string,
  init: RequestInit,
  timeoutMs = 30_000
): Promise<{ ok: boolean; status: number; body: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, status: 0, body: 'GROQ_API_KEY not configured' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${GROQ_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export const groqLlm: LlmProvider = {
  id: GROQ_PROVIDER_ID,
  async available(): Promise<boolean> {
    // Available whenever the key exists; a live /models probe would burn
    // nothing, but key-presence is the honest cheap check (the registry
    // catches per-call errors and falls through anyway).
    return Boolean(process.env.GROQ_API_KEY);
  },
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const model = process.env.GROQ_MODEL || DEFAULT_LLM_MODEL;
    const res = await groqFetch('/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: req.messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Groq chat HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    }
    const data = JSON.parse(res.body) as GroqChatResponse;
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) throw new Error('Groq chat returned empty content');
    return { content, providerId: GROQ_PROVIDER_ID };
  },
};

export const groqAsr: AsrProvider = {
  id: GROQ_PROVIDER_ID,
  async available(): Promise<boolean> {
    return Boolean(process.env.GROQ_API_KEY);
  },
  async transcribe(req: AsrRequest): Promise<AsrResult> {
    // OpenAI-compatible multipart audio transcription.
    const model = process.env.GROQ_ASR_MODEL || DEFAULT_ASR_MODEL;
    const form = new FormData();
    const bytes = Uint8Array.from(
      atob(req.audioBase64.split(',').pop() || req.audioBase64),
      (c) => c.charCodeAt(0)
    );
    form.append('file', new Blob([bytes as unknown as BlobPart], { type: 'audio/webm' }), 'audio.webm');
    form.append('model', model);
    form.append('response_format', 'json');

    const res = await groqFetch('/audio/transcriptions', { method: 'POST', body: form }, 60_000);
    if (!res.ok) {
      throw new Error(`Groq ASR HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    }
    const data = JSON.parse(res.body) as { text?: string };
    return { text: data.text || '', providerId: GROQ_PROVIDER_ID };
  },
};
