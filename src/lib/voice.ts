"use client";

/**
 * Provider-independent voice I/O (Stage 2 Phase 7).
 *
 * Architecture: the CLIENT owns the primary adapters (browser Web Speech API —
 * on-device, zero-network, iOS Safari supported) and the SERVER owns optional
 * higher-fidelity providers (POST /api/voice/* — currently honest-503 until a
 * server provider is configured). Every capability is DETECTED, never assumed;
 * every failure is surfaced honestly to the caller.
 *
 * Web Speech API coverage:
 *  - TTS: speechSynthesis — Safari 14+, Chrome, Edge (on-device voices)
 *  - STT: SpeechRecognition/webkitSpeechRecognition — Safari 14.1+, Chrome
 */

export interface VoiceCapabilities {
  ttsServer: boolean;       // server provider configured (checked lazily per call)
  ttsBrowser: boolean;      // speechSynthesis present
  sttBrowser: boolean;      // SpeechRecognition present
  microphone: boolean;      // getUserMedia present
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

export function voiceCapabilities(): VoiceCapabilities {
  if (typeof window === "undefined") {
    return { ttsServer: false, ttsBrowser: false, sttBrowser: false, microphone: false };
  }
  const w = window as unknown as Record<string, unknown>;
  return {
    ttsServer: true, // attempted per-call; server reports availability honestly
    ttsBrowser: typeof window.speechSynthesis !== "undefined" && typeof window.speechSynthesis.speak === "function",
    sttBrowser: Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition),
    microphone: Boolean(navigator.mediaDevices?.getUserMedia),
  };
}

/**
 * Speak text. Order: server TTS (if configured) → browser speechSynthesis.
 * Interruption-safe: a new speak() cancels the previous utterance.
 * Returns HOW it spoke (or why it could not) — callers show honest state.
 */
export async function speak(text: string, opts: { lang?: string; onEnd?: () => void } = {}): Promise<"server" | "browser" | "unavailable"> {
  // 1) server provider (higher fidelity when configured)
  try {
    const r = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (r.ok) {
      const body = (await r.json()) as { audio_base64?: string; format?: string };
      if (body.audio_base64) {
        await playBase64(body.audio_base64, body.format ?? "mp3");
        opts.onEnd?.();
        return "server";
      }
    }
    // 503 → fall through to browser
  } catch {
    /* network failure → browser fallback */
  }

  // 2) browser on-device TTS
  if (typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined") {
    window.speechSynthesis.cancel(); // interruption: replace any in-flight speech
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang ?? "en-US";
    u.rate = 1.0;
    u.onend = () => opts.onEnd?.();
    u.onerror = () => opts.onEnd?.();
    window.speechSynthesis.speak(u);
    return "browser";
  }
  opts.onEnd?.();
  return "unavailable";
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined") {
    window.speechSynthesis.cancel();
  }
}

function playBase64(b64: string, format: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(`data:audio/${format};base64,${b64}`);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("audio playback failed"));
    audio.play().catch(reject);
  });
}

/**
 * Listen once with the browser SpeechRecognition (on-device). Resolves with the
 * transcript, or rejects with an honest error (permission / unsupported /
 * no-speech). `onInterim` streams partial text for live UI feedback.
 */
export function listenOnce(opts: { lang?: string; onInterim?: (text: string) => void } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined;
    if (!Ctor) {
      reject(new Error("SpeechRecognition not supported in this browser"));
      return;
    }
    const rec = new Ctor();
    rec.lang = opts.lang ?? "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) finalText += r[0]!.transcript;
        else interim += r[0]!.transcript;
      }
      if (interim && opts.onInterim) opts.onInterim(finalText + interim);
    };
    rec.onerror = (e) => reject(new Error(e.error ?? "speech recognition error"));
    rec.onend = () => {
      if (finalText.trim()) resolve(finalText.trim());
      else reject(new Error("no speech detected"));
    };
    rec.start();
  });
}
