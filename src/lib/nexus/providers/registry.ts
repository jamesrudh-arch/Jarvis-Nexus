/**
 * JARVIS NEXUS — Inference provider registry (D6) — MERGED session 8.
 *
 * Ordered fallback chains per capability, configurable via environment:
 *   NEXUS_LLM_PROVIDERS="cloudflare_workers_ai,groq_cloud,openai,zai_cloud_route"
 *   (comma-separated, first wins)
 *   NEXUS_TTS_PROVIDERS="zai_cloud_route"
 *   NEXUS_ASR_PROVIDERS="zai_cloud_route,groq_cloud"
 *
 * Default LLM chain (free-tier-first, all genuinely free):
 *   cloudflare_workers_ai -> groq_cloud -> zai_cloud_route
 * - cloudflare_workers_ai: Workers AI free 10,000 Neurons/day (no card, no
 *   subscription, requests beyond the allocation are REJECTED not billed) —
 *   the owner's CLOUDFLARE_ACCOUNT_ID + token already live in production,
 *   so the deploy alone activates the production LLM with zero new env vars.
 * - groq_cloud: free gsk_ keys, rate-limited, no card, no billing (the
 *   parallel-line genuinely-free production route; activates when
 *   GROQ_API_KEY is set).
 * - zai_cloud_route: sandbox-ambient only — internal-api.z.ai resolves to a
 *   PRIVATE address (172.25.x.x, verified 2026-11-13) so it can never serve
 *   the Railway deployment; it remains the dev-sandbox fallback.
 * The opt-in `openai` provider (owner-supplied Phase-2 key, session 8) joins
 * the chain ONLY via an explicit NEXUS_LLM_PROVIDERS override so no paid API
 * is ever reached by accident; production carries
 * NEXUS_LLM_PROVIDERS=cloudflare_workers_ai,openai,groq_cloud,zai_cloud_route.
 *
 * Adding a provider: implement the interfaces in ./types, register the id in
 * the resolvers below, add it to a chain via env. Nothing else changes —
 * brain.ts and the API routes never import providers directly.
 *
 * Failure semantics: each provider error is caught + logged and the chain
 * falls through; a fully-exhausted chain returns null and the caller applies
 * its own honest degraded mode (brain.ts does this — never fabricated AI).
 */
import type {
  LlmProvider,
  TtsProvider,
  AsrProvider,
  FacialAnimationProvider,
  ChatCompletionRequest,
  ChatCompletionResult,
  TtsRequest,
  TtsResult,
  AsrRequest,
  AsrResult,
  FacialAnimationRequest,
  FacialAnimationResult,
} from './types';

export interface InferenceConfig {
  llm: string[];
  tts: string[];
  asr: string[];
  face: string[];
}

/** Parse a comma-separated provider chain env var; empty -> fallback chain. */
export function parseProviderChain(raw: string | undefined, fallback: string[]): string[] {
  const ids = (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return ids.length > 0 ? ids : [...fallback];
}

export function getInferenceConfig(): InferenceConfig {
  return {
    llm: parseProviderChain(process.env.NEXUS_LLM_PROVIDERS, DEFAULT_CHAIN),
    tts: parseProviderChain(process.env.NEXUS_TTS_PROVIDERS, ['zai_cloud_route']),
    asr: parseProviderChain(process.env.NEXUS_ASR_PROVIDERS, ['zai_cloud_route', 'groq_cloud']),
    face: parseProviderChain(process.env.NEXUS_FACE_PROVIDERS, ['audio2face_local']),
  };
}

/** Human-readable route description for the telemetry board. */
export function describeInferenceRoute(): string {
  const cfg = getInferenceConfig();
  return `${cfg.llm.join(' -> ')} (fallback chain)`;
}

const DEFAULT_CHAIN = ['cloudflare_workers_ai', 'groq_cloud', 'zai_cloud_route'];

async function resolveLlm(id: string): Promise<LlmProvider | null> {
  if (id === 'zai_cloud_route') {
    return (await import('./zaiCloud')).zaiLlm;
  }
  if (id === 'cloudflare_workers_ai') {
    return (await import('./openaiCompatible')).cfWorkersAiLlm;
  }
  if (id === 'openai_compatible') {
    return (await import('./openaiCompatible')).openaiCompatLlm;
  }
  if (id === 'openai') {
    return (await import('./openaiCompatible')).openaiLlm;
  }
  if (id === 'groq_cloud') {
    return (await import('./groqCloud')).groqLlm;
  }
  return null;
}

async function resolveTts(id: string): Promise<TtsProvider | null> {
  if (id === 'zai_cloud_route') {
    return (await import('./zaiCloud')).zaiTts;
  }
  return null;
}

async function resolveAsr(id: string): Promise<AsrProvider | null> {
  if (id === 'zai_cloud_route') {
    return (await import('./zaiCloud')).zaiAsr;
  }
  if (id === 'groq_cloud') {
    return (await import('./groqCloud')).groqAsr;
  }
  return null;
}

async function resolveFace(id: string): Promise<FacialAnimationProvider | null> {
  if (id === 'audio2face_local') {
    return (await import('./audio2face')).a2fFace;
  }
  return null;
}

export interface LlmOutcome {
  content: string;
  source: string;
}

/** Run the LLM chain; first provider that returns non-empty content wins. */
export async function runLlm(req: ChatCompletionRequest): Promise<LlmOutcome | null> {
  const chain = getInferenceConfig().llm;
  for (const id of chain) {
    try {
      const provider = await resolveLlm(id);
      if (!provider || !(await provider.available())) continue;
      const result = await provider.chat(req);
      if (result && result.content.trim().length > 0) {
        return { content: result.content, source: id };
      }
    } catch (err) {
      console.warn(`[inference:llm] provider '${id}' failed: ${(err as Error).message}`);
    }
  }
  return null;
}

/** Run the TTS chain; null when every provider fails (caller degrades gracefully). */
export async function runTts(req: TtsRequest): Promise<TtsResult | null> {
  const chain = getInferenceConfig().tts;
  for (const id of chain) {
    try {
      const provider = await resolveTts(id);
      if (!provider || !(await provider.available())) continue;
      const result = await provider.synthesize(req);
      if (result && result.audio.length > 0) return result;
    } catch (err) {
      console.warn(`[inference:tts] provider '${id}' failed: ${(err as Error).message}`);
    }
  }
  return null;
}

/** Run the ASR chain; empty string when every provider fails. */
export async function runAsr(req: AsrRequest): Promise<string> {
  const chain = getInferenceConfig().asr;
  for (const id of chain) {
    try {
      const provider = await resolveAsr(id);
      if (!provider || !(await provider.available())) continue;
      const result = await provider.transcribe(req);
      if (result && result.text) return result.text;
    } catch (err) {
      console.warn(`[inference:asr] provider '${id}' failed: ${(err as Error).message}`);
    }
  }
  return '';
}

/** Run the facial-animation chain; null when every provider fails or is
 *  unconfigured (caller keeps the local rule-based lip-sync engines). */
export async function runFacialAnimation(
  req: FacialAnimationRequest,
  budgetMs?: number
): Promise<FacialAnimationResult | null> {
  const chain = getInferenceConfig().face;
  for (const id of chain) {
    try {
      const provider = await resolveFace(id);
      if (!provider || !(await provider.available())) continue;
      const attempt = provider.animate(req);
      const result = budgetMs
        ? await Promise.race([
            attempt,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), budgetMs)),
          ])
        : await attempt;
      if (result && Object.keys(result.curves).length > 0) return result;
    } catch (err) {
      console.warn(`[inference:face] provider '${id}' failed: ${(err as Error).message}`);
    }
  }
  return null;
}

export { DEFAULT_CHAIN };
