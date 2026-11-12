/**
 * JARVIS NEXUS — Inference provider contracts (D6: local-first, cloud-optional).
 *
 * The orchestration layer (brain.ts, API routes) talks ONLY to these
 * interfaces via the registry. Concrete providers (z-ai cloud today; local
 * Ollama/vLLM or other engines later) implement them. No provider is ever
 * imported directly by application code.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  providerId: string;
}

export interface TtsRequest {
  text: string;
  voice: string;
  speed: number;
  format: 'wav' | 'mp3';
}

export interface TtsResult {
  audio: Buffer;
  mime: string;
  providerId: string;
}

export interface AsrRequest {
  audioBase64: string;
}

export interface AsrResult {
  text: string;
  providerId: string;
}

export interface LlmProvider {
  readonly id: string;
  /** Cheap readiness probe; the registry also treats thrown errors as unavailable. */
  available(): Promise<boolean>;
  chat(req: ChatCompletionRequest): Promise<ChatCompletionResult>;
}

export interface TtsProvider {
  readonly id: string;
  available(): Promise<boolean>;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

export interface AsrProvider {
  readonly id: string;
  available(): Promise<boolean>;
  transcribe(req: AsrRequest): Promise<AsrResult>;
}
