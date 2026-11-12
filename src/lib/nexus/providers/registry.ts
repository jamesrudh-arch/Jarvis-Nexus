/**
 * JARVIS NEXUS — Inference provider registry (D6).
 *
 * Ordered fallback chains per capability, configurable via environment:
 *   NEXUS_LLM_PROVIDERS="zai_cloud_route"        (comma-separated, first wins)
 *   NEXUS_TTS_PROVIDERS="zai_cloud_route"
 *   NEXUS_ASR_PROVIDERS="zai_cloud_route"
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
  ChatCompletionRequest,
  ChatCompletionResult,
  TtsRequest,
  TtsResult,
  AsrRequest,
  AsrResult,
} from './types';

export interface InferenceConfig {
  llm: string[];
  tts: string[];
  asr: string[];
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
    llm: parseProviderChain(process.env.NEXUS_LLM_PROVIDERS, ['zai_cloud_route']),
    tts: parseProviderChain(process.env.NEXUS_TTS_PROVIDERS, ['zai_cloud_route']),
    asr: parseProviderChain(process.env.NEXUS_ASR_PROVIDERS, ['zai_cloud_route']),
  };
}

/** Human-readable route description for the telemetry board. */
export function describeInferenceRoute(): string {
  const cfg = getInferenceConfig();
  return `${cfg.llm.join(' -> ')} (fallback chain)`;
}

const DEFAULT_CHAIN = ['zai_cloud_route'];

async function resolveLlm(id: string): Promise<LlmProvider | null> {
  if (id === 'zai_cloud_route') {
    return (await import('./zaiCloud')).zaiLlm;
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

export { DEFAULT_CHAIN };
