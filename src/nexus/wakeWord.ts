/**
 * JARVIS NEXUS — Wake-word, intelligent standby & barge-in engine.
 *
 * Behavioural contract (Master Directive §wake-word):
 *  1. App loads → engine enters STANDBY (local VAD listening only, no network).
 *  2. Owner says the wake phrase ("Hey JARVIS") → engine ACTIVATES:
 *     full recognition, each final utterance flows to CORE conversation.
 *  3. Owner can interrupt her mid-speech (barge-in): voice energy while she
 *     speaks instantly cancels speech + in-flight generation, then listens.
 *  4. "Go to sleep" / "Stand by" → back to STANDBY.
 *  5. Configurable inactivity auto-standby (default 180 s).
 *
 * Resource management: in STANDBY the microphone is analysed locally
 * (AnalyserNode RMS) and a recognition burst runs ONLY while speech energy
 * is present — no continuous cloud streaming, no polling, no LLM/TTS calls.
 * Recognition itself uses the browser SpeechRecognition API (on-device on
 * Safari/iOS; browser speech service on Chrome — see docs/INTEGRATIONS.md).
 */

/** Standby listening: pure local analysis; ACTIVE: full recognition. */
export type WakeState = 'unavailable' | 'standby' | 'active';

import type { SpeechRecognition, SpeechRecognitionEvent } from './client';

export interface WakeWordOptions {
  onWake?: () => void;
  onSleep?: () => void;
  /** A complete final user utterance while ACTIVE. */
  onUtterance?: (text: string) => void;
  /** Voice energy detected while she is speaking → caller must cancel speech NOW. */
  onBargeIn?: () => void;
  /** True while the embodiment is speaking (drives barge-in detection). */
  isSpeaking?: () => boolean;
  onStateChange?: (state: WakeState, detail?: string) => void;
  /** Auto-standby after this many ms without an utterance (0 = never). */
  inactivityMs?: number;
}

const WAKE_PHRASES = [
  'hey jarvis', 'hey jervis', 'hay jarvis', 'a jarvis', 'ok jarvis', 'okay jarvis',
  'hey jarvis nexus', 'hi jarvis', '你好贾维斯', '贾维斯',
];
const SLEEP_PHRASES = [
  'go to sleep', 'go to sleep jarvis', 'sleep now', 'stand by', 'standby',
  'stand by jarvis', 'that will be all', 'thank you jarvis that is all', '休眠',
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export class WakeWordEngine {
  private opts: WakeWordOptions;
  private state: WakeState = 'unavailable';
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private vadTimer: number | null = null;
  private recognition: SpeechRecognition | null = null;
  private burstActive = false;
  private speechOnsetWindows = 0;
  private silenceSince = 0;
  private noiseFloor = 0.004;
  private lastUtteranceAt = 0;
  private inactivityTimer: number | null = null;
  private bargeFiredAt = 0;
  private readonly inactivityMs: number;
  private destroyed = false;

  constructor(opts: WakeWordOptions) {
    this.opts = opts;
    this.inactivityMs = opts.inactivityMs ?? 180_000;
  }

  get currentState(): WakeState {
    return this.state;
  }

  /** Request the microphone and enter intelligent standby. */
  async start(): Promise<boolean> {
    if (this.destroyed) return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      this._setState('unavailable', 'getUserMedia unsupported');
      return false;
    }
    const SR = this._srCtor();
    if (!SR) {
      this._setState('unavailable', 'SpeechRecognition unsupported');
      return false;
    }
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this._setState('unavailable', 'microphone permission denied');
      return false;
    }
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    this.audioCtx = new Ctx();
    const src = this.audioCtx.createMediaStreamSource(this.micStream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.5;
    src.connect(this.analyser);
    this._enterStandby();
    this._loop();
    return true;
  }

  /** Owner forced standby / sleep. */
  sleep(reason = 'owner') {
    if (this.state === 'active') {
      this._enterStandby(reason);
    }
  }

  /** Toggle helper for the UI pill. */
  toggle(): void {
    if (this.state === 'standby' || this.state === 'active') this.stop();
    else void this.start();
  }

  stop() {
    this._cancelRecognition();
    if (this.vadTimer !== null) { clearInterval(this.vadTimer); this.vadTimer = null; }
    if (this.inactivityTimer !== null) { clearTimeout(this.inactivityTimer); this.inactivityTimer = null; }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    void this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
    this.analyser = null;
    this._setState('unavailable', 'engine stopped');
  }

  destroy() {
    this.destroyed = true;
    this.stop();
  }

  // ------------------------------------------------------------------

  private _srCtor():
    | (new () => SpeechRecognition)
    | null {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }

  private _setState(s: WakeState, detail?: string) {
    this.state = s;
    this.opts.onStateChange?.(s, detail);
  }

  private _enterStandby(reason = '') {
    this.state = 'standby';
    this.opts.onStateChange?.('standby', reason);
    this.opts.onSleep?.();
    if (this.inactivityTimer !== null) { clearTimeout(this.inactivityTimer); this.inactivityTimer = null; }
  }

  private _enterActive() {
    this.state = 'active';
    this.lastUtteranceAt = Date.now();
    this.opts.onWake?.();
    this.opts.onStateChange?.('active');
    this._armInactivity();
  }

  private _armInactivity() {
    if (this.inactivityTimer !== null) clearTimeout(this.inactivityTimer);
    if (this.inactivityMs > 0) {
      this.inactivityTimer = window.setTimeout(() => {
        if (this.state === 'active') this._enterStandby('inactivity');
      }, this.inactivityMs);
    }
  }

  /** Local voice-activity loop: pure client-side RMS analysis, no network. */
  private _loop() {
    if (this.vadTimer !== null) clearInterval(this.vadTimer);
    this.vadTimer = window.setInterval(() => {
      if (!this.analyser || this.destroyed) return;
      const buf = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
      const rms = Math.sqrt(sumSq / buf.length);

      // Adaptive noise floor while idle
      const speaking = rms > Math.max(0.011, this.noiseFloor * 3.2);
      if (!speaking) {
        this.noiseFloor = this.noiseFloor * 0.98 + Math.min(rms, 0.05) * 0.02;
        this.speechOnsetWindows = Math.max(0, this.speechOnsetWindows - 1);
        this.silenceSince = Date.now();
      } else {
        this.speechOnsetWindows += 1;
      }

      // Barge-in: owner voice while she speaks → cancel speech instantly,
      // then the burst below captures the new instruction.
      if (
        this.state === 'active' && this.opts.isSpeaking?.() && speaking &&
        this.speechOnsetWindows >= 2 && Date.now() - this.bargeFiredAt > 1200
      ) {
        this.bargeFiredAt = Date.now();
        this.opts.onBargeIn?.();
      }

      // Speech onset → open a recognition burst (STANDBY: only to match the
      // wake phrase; ACTIVE: capture the instruction).
      if (this.speechOnsetWindows >= 2 && !this.burstActive && !this.recognition) {
        this._startBurst();
      }

      // Close a hanging burst after 2.5 s of silence
      if (this.burstActive && Date.now() - this.silenceSince > 2500) {
        this._cancelRecognition();
        this.burstActive = false;
      }
    }, 120);
  }

  private _startBurst() {
    const SR = this._srCtor();
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    this.burstActive = true;
    this.recognition = rec;

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const text = ev.results[ev.results.length - 1][0].transcript || '';
      this._handleTranscript(text);
    };
    rec.onerror = () => { /* no-op: VAD loop retries on next onset */ };
    rec.onend = () => {
      this.recognition = null;
      // In ACTIVE mode keep back-to-back recognition while the owner talks
      if (this.state === 'active' && Date.now() - this.silenceSince < 1200) {
        this._startBurst();
      } else {
        this.burstActive = false;
      }
    };
    try { rec.start(); } catch { this.recognition = null; this.burstActive = false; }
  }

  private _handleTranscript(raw: string) {
    const text = raw.trim();
    if (!text) return;
    const norm = normalize(text);

    const isSleep = SLEEP_PHRASES.some((p) => norm === p || norm.startsWith(p));
    if (this.state === 'active') {
      this.lastUtteranceAt = Date.now();
      this._armInactivity();
      if (isSleep) {
        this._enterStandby('owner said sleep');
        return;
      }
      // Strip a leading wake phrase from the instruction
      const wakePrefix = WAKE_PHRASES.find((p) => norm.startsWith(p + ' '));
      const payload = wakePrefix ? text.slice(wakePrefix.length).trim() : text;
      if (payload) this.opts.onUtterance?.(payload);
      return;
    }

    // STANDBY: only the wake phrase activates; everything else is ignored
    if (WAKE_PHRASES.some((p) => norm.includes(p))) {
      this._enterActive();
      const tail = text.slice(text.toLowerCase().indexOf('jarvis') + 6).trim();
      if (tail.length > 2) this.opts.onUtterance?.(tail);
    }
  }

  private _cancelRecognition() {
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* noop */ }
      this.recognition = null;
    }
    this.burstActive = false;
  }
}
