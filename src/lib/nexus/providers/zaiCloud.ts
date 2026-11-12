/**
 * JARVIS NEXUS — Z.ai cloud inference provider.
 *
 * Wraps the platform z-ai-web-dev-sdk behind the provider contracts. The SDK
 * is imported dynamically so environments without it degrade to "provider
 * unavailable" instead of crashing the module graph.
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

/** Minimal structural typing for the z-ai SDK surface we use. */
interface ZaiClient {
  chat: {
    completions: {
      create: (args: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }>;
    };
  };
  audio: {
    tts: {
      create: (args: {
        input: string;
        voice: string;
        speed: number;
        response_format: string;
        stream: boolean;
      }) => Promise<Response>;
    };
    asr: {
      create: (args: { file_base64: string }) => Promise<{ text: string }>;
    };
  };
}

export const ZAI_PROVIDER_ID = 'zai_cloud_route';

async function getClient(): Promise<ZaiClient> {
  const mod = (await import('z-ai-web-dev-sdk')) as unknown as {
    default: { create: () => Promise<ZaiClient> };
  };
  return mod.default.create();
}

export const zaiLlm: LlmProvider = {
  id: ZAI_PROVIDER_ID,
  async available(): Promise<boolean> {
    try {
      await getClient();
      return true;
    } catch {
      return false;
    }
  },
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const zai = await getClient();
    const completion = await zai.chat.completions.create({
      messages: req.messages,
      thinking: { type: 'disabled' },
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    });
    return { content: completion.choices[0]?.message?.content || '', providerId: ZAI_PROVIDER_ID };
  },
};

export const zaiTts: TtsProvider = {
  id: ZAI_PROVIDER_ID,
  async available(): Promise<boolean> {
    try {
      await getClient();
      return true;
    } catch {
      return false;
    }
  },
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const zai = await getClient();
    const response = await zai.audio.tts.create({
      input: req.text,
      voice: req.voice,
      speed: req.speed,
      response_format: req.format,
      stream: false,
    });
    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(new Uint8Array(arrayBuffer));
    return {
      audio,
      mime: req.format === 'mp3' ? 'audio/mpeg' : 'audio/wav',
      providerId: ZAI_PROVIDER_ID,
    };
  },
};

export const zaiAsr: AsrProvider = {
  id: ZAI_PROVIDER_ID,
  async available(): Promise<boolean> {
    try {
      await getClient();
      return true;
    } catch {
      return false;
    }
  },
  async transcribe(req: AsrRequest): Promise<AsrResult> {
    const zai = await getClient();
    const response = await zai.audio.asr.create({ file_base64: req.audioBase64 });
    return { text: response.text || '', providerId: ZAI_PROVIDER_ID };
  },
};
