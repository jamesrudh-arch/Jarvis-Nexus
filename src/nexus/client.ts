'use client';
/**
 * JARVIS NEXUS — Client Orchestrator.
 * Ported from the reference repo's main.js: connects the real-time 3D Sanctuary
 * and living character to CORE (/api/v1). Replaces the Vite/WebSocket transport
 * with request/response + telemetry polling, and adds server-side voice (TTS/ASR).
 */
import * as THREE from 'three';
import { NexusSanctuaryScene } from './world/NexusSanctuaryScene.js';
import { SpeechSequencer, splitSentences } from './vendor/speechStream.mjs';
import { WakeWordEngine, type WakeState } from './wakeWord';

export interface WorldSnapshot {
  owner_name: string;
  first_launch_completed: boolean;
  active_mode: string;
  current_zone: string;
  position: { x: number; y: number; z: number; yaw: number };
  locomotion_state: string;
  posture: string;
  emotional_state: string;
  active_activity_summary: string;
  interrupted_task_stack: Array<Record<string, unknown>>;
  active_camera_preset: string;
  reduced_motion: boolean;
  switches: Record<string, boolean>;
  active_scenario: ScenarioRuntime | null;
  active_video: { media_id: string; playing: boolean; current_time: number; extracted_3d_twin: boolean };
  zones: Record<string, { id: string; label: string; look_target?: [number, number, number]; [k: string]: unknown }>;
  modes: Array<{ id: string; index: number; label: string; zone: string; camera: string }>;
}

export interface ScenarioRuntime {
  scenario_id: string;
  title: string;
  classification: string;
  variables: Record<string, number>;
  playing: boolean;
  current_time: number;
  playback_rate: number;
}

export interface ScenarioDef {
  id: string;
  title: string;
  classification: string;
  summary: string;
  duration_sec: number;
  variables: Array<{ key: string; label: string; min: number; max: number; default: number; step: number; unit: string }>;
  branches: Array<{ id: string; condition: string; label: string; outcome: string; severity: string }>;
  timeline: Array<{ t: number; phase: string; camera: string; narration: string }>;
  actors_props: { voxel_structure: string; [k: string]: unknown };
  evidence_notes: Array<{ kind: string; text: string }>;
}

export interface JarvisMessage {
  id: string;
  content: string;
  inference_source: string;
  emotional_tone: string;
  target_zone: string | null;
  created_at: string;
  audio: string | null;
  audio_mime: string | null;
  /** The exact text chunk the preloaded `audio` covers (first sentence). */
  audio_text?: string | null;
  /** ARKit blendshape track for the preloaded audio chunk (Audio2Face-3D, §14). */
  audio_faces?: { fps: number; durationMs: number; curves: Record<string, number[]> } | null;
}

/** Voice chunk payload consumed by the sequencer: audio + optional face track. */
export interface VoiceChunk {
  data: string;
  mime: string;
  faces?: { fps: number; durationMs: number; curves: Record<string, number[]> } | null;
}

export interface Telemetry {
  cpu_percent: number;
  cpu_cores: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  disk_free_gb: number;
  uptime_sec: number;
  database_records: { memories: number; goals: number; scenarios: number; switches: number };
  embodiment_clients: number;
  inference: { active_backend: string; connected_workers: number };
}

export interface NexusSnapshot {
  ready: boolean;
  loadingText: string;
  error: string | null;
  world: WorldSnapshot | null;
  scenarios: ScenarioDef[];
  activeScenarioDef: ScenarioDef | null;
  scenarioPhase: string;
  scenarioTimeReadout: string;
  subtitle: JarvisMessage | null;
  interruptAvailable: boolean;
  micState: 'off' | 'listening' | 'processing';
  camState: 'off' | 'live';
  recording: boolean;
  telemetry: Telemetry | null;
  holoLayout: string;
  speaking: boolean;
  /** Wake-word engine state: standby (local VAD only) | active | unavailable. */
  wakeState: WakeState;
  wakeDetail: string | null;
}

type SnapshotListener = (snap: NexusSnapshot) => void;

// Minimal Web Speech API controller typings (the result types already exist in
// TS's DOM lib, but the SpeechRecognition controller interface does not).
export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
export interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

async function api<T = Record<string, unknown>>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  const res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers as Record<string, string> | undefined) } });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = (err as { detail?: string }).detail || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export class NexusClient {
  sanctuary: NexusSanctuaryScene | null = null;
  private disposed = false;
  private canvas: HTMLCanvasElement;
  private labelsLayer: HTMLElement;
  private opticalCamEl: HTMLVideoElement | null = null;
  private listener: SnapshotListener;

  private world: WorldSnapshot | null = null;
  private scenarios: ScenarioDef[] = [];
  private activeScenarioDef: ScenarioDef | null = null;
  private loadingText = 'Igniting sanctuary emitters…';
  private error: string | null = null;
  private ready = false;
  private subtitle: JarvisMessage | null = null;
  private interruptAvailable = false;
  private micState: 'off' | 'listening' | 'processing' = 'off';
  private camState: 'off' | 'live' = 'off';
  private recording = false;
  private telemetry: Telemetry | null = null;
  private holoLayout = 'peppers_ghost';
  private speaking = false;
  private scenarioPhase = '';
  private scenarioTimeReadout = '';
  private lastTickEmit = 0;
  private lastNarrCueIndex = -1;
  private narratingScenario = false;
  private narrationQueue: string[] = [];

  private micStream: MediaStream | null = null;
  private camStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private animClock = new THREE.Clock();
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  /** Sentence-chunked TTS player: chunk i speaks while i+1 synthesizes. */
  private speechSequencer: SpeechSequencer | null = null;
  private conversationEmotion = 'neutral';
  /** Wake-word engine (§wake-word): intelligent standby + activation + barge-in. */
  private wakeEngine: WakeWordEngine | null = null;
  private wakeState: WakeState = 'unavailable';
  private wakeDetail: string | null = null;
  private wakePermissionDenied = false;

  constructor(
    canvas: HTMLCanvasElement,
    labelsLayer: HTMLElement,
    opticalCamEl: HTMLVideoElement | null,
    listener: SnapshotListener
  ) {
    this.canvas = canvas;
    this.labelsLayer = labelsLayer;
    this.opticalCamEl = opticalCamEl;
    this.listener = listener;
    // The sanctuary is created synchronously so that dispose() can always
    // stop its render loop — critical under React StrictMode double-mount,
    // where a deferred async creation would leave an orphaned render loop
    // fighting over the same canvas (ghosted/duplicated character).
    this.sanctuary = new NexusSanctuaryScene(canvas, labelsLayer);

    // Speech sequencer: plays replies sentence-by-sentence with one-chunk-ahead
    // TTS prefetch, so time-to-first-word is one short synthesis instead of
    // one full-paragraph synthesis. Abortable for instant owner interrupts.
    this.speechSequencer = new SpeechSequencer({
      fetchAudio: async (text: string, signal: AbortSignal): Promise<VoiceChunk | null> => {
        try {
          const voice = await api<{
            audio?: string;
            mime?: string;
            faces?: VoiceChunk['faces'];
          }>('/api/v1/voice/tts', {
            method: 'POST',
            body: JSON.stringify({ text, emotion: this.conversationEmotion }),
            signal,
          });
          return voice?.audio
            ? { data: voice.audio, mime: voice.mime || 'audio/wav', faces: voice.faces ?? null }
            : null;
        } catch {
          return null;
        }
      },
      speakChunk: (text: string, audio: VoiceChunk | null, onEnd: () => void) => {
        const jarvis = this.sanctuary?.jarvis;
        if (!jarvis || !jarvis.loaded) { onEnd(); return; }
        jarvis.speak(text, { audio: audio || undefined, onEnd });
      },
      onStart: () => {
        this.interruptAvailable = true;
        this.speakingState = true;
      },
      onDone: () => {
        this.interruptAvailable = false;
        this.speakingState = false;
        this.narratingScenario = false;
        this._drainNarrationQueue();
        this.emit();
      },
    });

    // Wake-word engine: standby keeps ALL intelligence off — the mic is
    // analysed locally (AnalyserNode RMS) and a recognition burst opens only
    // on speech energy. "Hey JARVIS" activates; voice energy while she is
    // speaking is an instant barge-in (cancel speech, capture instruction).
    this.wakeEngine = new WakeWordEngine({
      isSpeaking: () => this.speaking,
      onWake: () => {
        const jarvis = this.sanctuary?.jarvis;
        if (jarvis) {
          jarvis.postureMode = 'conversational_focus';
          jarvis.focusCamera = true;
          jarvis.emotionalState = 'listening';
        }
      },
      onUtterance: (text) => { void this.sendConversation(text, 'voice'); },
      onBargeIn: () => { void this.interruptSpeech(); },
      onStateChange: (state, detail) => {
        this.wakeState = state;
        this.wakeDetail = detail ?? null;
        this.emit();
      },
    });

    // Native iOS shell bridge (ios/JarvisNexus): utterances + barge-in from
    // the on-device Speech framework arrive as window events — the SAME
    // callbacks the in-page wake engine uses, so both transports share one
    // behaviour contract (wake → active, voice during speech → interrupt).
    if (typeof window !== 'undefined') {
      window.addEventListener('jarvis-utterance', (ev) => {
        const detail = (ev as CustomEvent<string>).detail;
        if (detail && detail.length > 1) void this.sendConversation(detail, 'voice');
      });
      window.addEventListener('jarvis-barge-in', () => { void this.interruptSpeech(); });
    }
  }

  emit() {
    this.listener({
      ready: this.ready,
      loadingText: this.loadingText,
      error: this.error,
      world: this.world,
      scenarios: this.scenarios,
      activeScenarioDef: this.activeScenarioDef,
      scenarioPhase: this.scenarioPhase,
      scenarioTimeReadout: this.scenarioTimeReadout,
      subtitle: this.subtitle,
      interruptAvailable: this.interruptAvailable,
      micState: this.micState,
      camState: this.camState,
      recording: this.recording,
      telemetry: this.telemetry,
      holoLayout: this.holoLayout,
      speaking: this.speaking,
      wakeState: this.wakeState,
      wakeDetail: this.wakeDetail,
    });
  }

  private set speakingState(v: boolean) {
    this.speaking = v;
    this.emit();
  }

  async bootstrap() {
    this.emit();
    // Yield one tick so React StrictMode's double-mount cleanup lands before
    // the heavy 14 MB character download starts (prevents a duplicate load).
    await new Promise((r) => setTimeout(r, 0));
    const sanctuary = this.sanctuary;
    if (!sanctuary || this.disposed) return;

    try {
      await sanctuary.initCharacter((xhr: { loaded: number; total: number } | undefined) => {
        if (this.disposed) return;
        if (xhr && xhr.total) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          this.loadingText = `Loading rigged 3D character & skeletal clips (${pct}%)…`;
          this.emit();
        }
      });
    } catch (err) {
      this.loadingText = `Character asset warning: ${(err as Error).message}`;
      this.emit();
    }
    if (this.disposed) return;

    try {
      const [worldSnap, scenariosRes] = await Promise.all([
        api<WorldSnapshot>('/api/v1/world'),
        api<{ scenarios: ScenarioDef[] }>('/api/v1/scenarios'),
      ]);
      if (this.disposed) return;
      this.scenarios = scenariosRes.scenarios || [];
      this.applyWorldState(worldSnap, true);
    } catch (err) {
      this.error = (err as Error).message;
      this.emit();
      return;
    }

    this.ready = true;
    this.loadingText = 'NEXUS online.';
    this.emit();

    // Animation loop
    sanctuary.renderer.setAnimationLoop(() => {
      const dt = this.animClock.getDelta();
      sanctuary.renderFrame(dt, this.opticalCamEl, Boolean(this.world?.switches.camera));
      this.tickScenarioUI();
    });

    // Telemetry poll
    this.telemetryTimer = setInterval(async () => {
      try {
        this.telemetry = await api<Telemetry>('/api/v1/telemetry');
        sanctuary.updateTelemetryBoard({
          ...this.telemetry,
          inference: this.telemetry.inference,
        } as never);
        this.emit();
      } catch { /* transient */ }
    }, 8000);
    void this.fetchTelemetryOnce();
  }

  private async fetchTelemetryOnce() {
    try {
      this.telemetry = await api<Telemetry>('/api/v1/telemetry');
      this.sanctuary?.updateTelemetryBoard(this.telemetry as never);
      this.emit();
    } catch { /* ignore */ }
  }

  dispose() {
    this.disposed = true;
    this.speechSequencer?.stop(true);
    this.wakeEngine?.destroy();
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    this.sanctuary?.renderer.setAnimationLoop(null);
  }

  // ------------------------------------------------------------------
  // World state application
  // ------------------------------------------------------------------
  applyWorldState(snap: WorldSnapshot, initialSnap = false) {
    if (!snap || !this.sanctuary) return;
    this.world = snap;
    const sanctuary = this.sanctuary;
    sanctuary.reducedMotion = Boolean(snap.reduced_motion);

    const zoneInfo = snap.zones?.[snap.current_zone];
    if (zoneInfo?.look_target) {
      sanctuary.jarvis.lookWorldTarget.set(...(zoneInfo.look_target as [number, number, number]));
    }
    sanctuary.jarvis.focusCamera = ['conversational_focus', 'wake_auth', 'digital_human_embodiment', 'holographic_presence'].includes(snap.active_mode);

    const postureMap: Record<string, string> = {
      simulation_stage: snap.active_scenario ? 'scenario_direct' : 'scenario_construct',
      media_presentation: 'video_present',
      central_operations: snap.active_mode === 'conversational_focus' ? 'conversational_focus' : 'console_interaction',
    };
    const posture = postureMap[snap.current_zone] || 'console_interaction';
    const pos = snap.position;

    // Autonomous behavior permission: only in ambient modes, autonomy switch ON,
    // no active scenario, and no pending conversation. She lives on her own.
    const ambientModes = ['living_presence', 'wake_auth', 'digital_human_embodiment'];
    sanctuary.behaviorDirector?.setServerPermitted(
      Boolean(snap.switches?.autonomy)
      && !snap.active_scenario
      && ambientModes.includes(snap.active_mode)
    );

    if (initialSnap) {
      sanctuary.jarvis.root.position.set(pos.x, 0, pos.z);
      sanctuary.jarvis.root.rotation.y = pos.yaw;
      sanctuary.jarvis.targetYaw = pos.yaw;
      sanctuary.jarvis.postureMode = posture;
      sanctuary.jarvis.emotionalState = snap.emotional_state;
    } else {
      // Presenter's mark: while a scenario plays she stands BESIDE the hologram
      // (never inside the emitter volume), framed with the evidence she directs.
      let navX = pos.x;
      let navZ = pos.z;
      let navYaw = pos.yaw;
      if (snap.active_scenario && snap.current_zone === 'simulation_stage') {
        navX = 1.9;
        navZ = 2.9;
        navYaw = -2.11;
      }
      sanctuary.jarvis.navigateTo(navX, navZ, navYaw, {
        urgent: snap.locomotion_state === 'running' || snap.emotional_state === 'urgent',
        posture,
        emotion: snap.emotional_state || 'focused',
      });
    }

    const isHolo = snap.active_mode === 'holographic_presence';
    sanctuary.setHologramMode(isHolo, this.holoLayout);

    if (snap.active_camera_preset) {
      sanctuary.cameraDirector.setPreset(snap.active_camera_preset, sanctuary.reducedMotion);
    }

    if (snap.active_scenario && !sanctuary.scenarioDirector.activeScenario) {
      const activeScenario = snap.active_scenario;
      const def = this.scenarios.find((s) => s.id === activeScenario.scenario_id);
      if (def) this.activateClientScenario(def, activeScenario);
    } else if (!snap.active_scenario && sanctuary.scenarioDirector.activeScenario) {
      sanctuary.scenarioDirector.clearStage();
      this.activeScenarioDef = null;
    }

    sanctuary.syncPhysicalSwitchLevers(snap.switches || {});
    void this.enforceBrowserSensorGates();
    this.emit();
  }

  // ------------------------------------------------------------------
  // Conversation
  // ------------------------------------------------------------------
  async sendConversation(content: string, modality: 'text' | 'voice' | 'vision' = 'text') {
    // She stops autonomous wandering the moment you address her
    this.sanctuary?.behaviorDirector?.pause(18);
    try {
      const payload = await api<{
        jarvis_message: JarvisMessage;
        world: WorldSnapshot;
        activated_scenario: ScenarioRuntime | null;
      }>('/api/v1/conversations/send', {
        method: 'POST',
        body: JSON.stringify({ content, modality }),
      });

      this.applyWorldState(payload.world, false);
      this.showJarvisResponse(payload.jarvis_message);

      if (payload.activated_scenario) {
        const activated = payload.activated_scenario;
        const def = this.scenarios.find((s) => s.id === activated.scenario_id);
        if (def) this.activateClientScenario(def, activated);
      }
    } catch (err) {
      this.error = (err as Error).message;
      this.emit();
      setTimeout(() => { this.error = null; this.emit(); }, 4200);
    }
  }

  showJarvisResponse(jarvisMsg: JarvisMessage | null) {
    if (!jarvisMsg || !this.sanctuary) return;
    this.subtitle = jarvisMsg;
    this.interruptAvailable = true;
    this.speakingState = true;
    this.emit();

    if (this.world?.switches.embodiment !== false) {
      // Conversational presence: she TURNS TO FACE the owner for her reply —
      // speaking at a console while you address her reads as ignoring you.
      // (Scenarios keep their own directing; this only applies when idle.)
      const jarvis = this.sanctuary.jarvis;
      if (!this.sanctuary.scenarioDirector.activeScenario && jarvis.loaded) {
        jarvis.postureMode = 'conversational_focus';
        jarvis.emotionalState = jarvisMsg.emotional_tone || 'attentive';
        jarvis.focusCamera = true;
      }

      // Streamed speech: sentence chunks with prefetch. The server pre-
      // synthesizes ONLY the first sentence (audio + audio_text) so playback
      // starts immediately; the rest synthesizes as she talks.
      this.conversationEmotion = jarvisMsg.emotional_tone || 'neutral';
      const chunks = splitSentences(jarvisMsg.content);
      const preloaded: VoiceChunk | null =
        jarvisMsg.audio && jarvisMsg.audio_text && chunks[0] === jarvisMsg.audio_text
          ? { data: jarvisMsg.audio, mime: jarvisMsg.audio_mime || 'audio/wav', faces: jarvisMsg.audio_faces ?? null }
          : null;
      if (chunks.length > 0) {
        this.speechSequencer?.play(jarvisMsg.content, preloaded);
      } else {
        this.interruptAvailable = false;
        this.speakingState = false;
        this.emit();
      }
    }
  }

  async interruptSpeech() {
    this.speechSequencer?.stop(true);
    this.sanctuary?.jarvis.interruptSpeech();
    this.interruptAvailable = false;
    this.speakingState = false;
    this.narratingScenario = false;
    this.narrationQueue.length = 0;
    this.emit();
    try {
      const world = await api<WorldSnapshot>('/api/v1/world/interrupt', { method: 'POST' });
      this.applyWorldState(world, false);
    } catch { /* ignore */ }
  }

  async resumeTask() {
    try {
      const world = await api<WorldSnapshot>('/api/v1/world/resume', { method: 'POST' });
      this.applyWorldState(world, false);
    } catch (err) {
      this.error = (err as Error).message;
      this.emit();
    }
  }

  // ------------------------------------------------------------------
  // Owner switches, modes, camera, onboarding
  // ------------------------------------------------------------------
  async toggleSwitch(key: string) {
    if (!this.world) return;
    const nextState = !this.world.switches[key];
    try {
      const res = await api<{ world: WorldSnapshot }>(`/api/v1/switches/${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: nextState }),
      });
      this.applyWorldState(res.world, false);
      await this.enforceBrowserSensorGates();
    } catch (err) {
      this.error = (err as Error).message;
      this.emit();
    }
  }

  async setMode(modeId: string) {
    try {
      const world = await api<WorldSnapshot>('/api/v1/world/mode', {
        method: 'POST',
        body: JSON.stringify({ mode_id: modeId }),
      });
      this.applyWorldState(world, false);
    } catch (err) {
      this.error = (err as Error).message;
      this.emit();
    }
  }

  setCameraPreset(value: string) {
    this.sanctuary?.cameraDirector.setManualSelect(value, this.sanctuary.reducedMotion);
    // Manual framing = you're directing HER: autonomy yields, and conversational
    // framing means EYE CONTACT with the lens.
    this.sanctuary?.behaviorDirector?.pause(30);
    const j = this.sanctuary?.jarvis;
    if (j) {
      if (value === 'conversation') {
        j.focusCamera = true;
        if (!j.isSpeaking) j.postureMode = 'conversational_focus';
      } else if (value === 'living_presence') {
        j.focusCamera = true;
      }
    }
  }

  async completeOnboarding(action: 'dismiss' | 'compute' | 'scenario') {
    try {
      const world = await api<WorldSnapshot>('/api/v1/world/complete-onboarding', { method: 'POST' });
      this.applyWorldState(world, false);
      if (action === 'scenario') {
        await this.activateScenario('cryo_manifold_forensic');
      }
    } catch (err) {
      this.error = (err as Error).message;
      this.emit();
    }
  }

  async setReducedMotion(enabled: boolean) {
    try {
      const world = await api<WorldSnapshot>(`/api/v1/world/reduced-motion?enabled=${enabled}`, { method: 'POST' });
      this.applyWorldState(world, false);
    } catch { /* ignore */ }
  }

  setHoloLayout(layout: string) {
    this.holoLayout = layout;
    this.sanctuary?.setHologramMode(true, layout);
    this.emit();
  }

  // ------------------------------------------------------------------
  // Scenario Director transport
  // ------------------------------------------------------------------
  activateClientScenario(def: ScenarioDef, runtime: ScenarioRuntime) {
    if (!this.sanctuary) return;
    this.activeScenarioDef = def;
    this.sanctuary.behaviorDirector?.pause(20);
    this.sanctuary.scenarioDirector.loadScenario(def, runtime);
    // She directs the documentary: camera returns to auto (cue choreography),
    // posture + aim at the holographic evidence.
    this.sanctuary.cameraDirector.setManualSelect('auto', this.sanctuary.reducedMotion);
    const j = this.sanctuary.jarvis;
    j.gestureWorldTarget = this.sanctuary.scenarioDirector.originPoint.clone();
    j.postureMode = 'scenario_direct';
    j.emotionalState = 'focused';
    this.narratingScenario = true;
    this.emit();
  }

  async activateScenario(id: string) {
    try {
      const res = await api<{ world: WorldSnapshot; runtime: ScenarioRuntime }>(`/api/v1/scenarios/${id}/activate`, {
        method: 'POST',
        body: JSON.stringify({ variables: {}, playing: true }),
      });
      this.applyWorldState(res.world, false);
      const def = this.scenarios.find((s) => s.id === id);
      if (def && res.runtime) this.activateClientScenario(def, res.runtime);
    } catch (err) {
      this.error = (err as Error).message;
      this.emit();
    }
  }

  async restoreScenario() {
    try {
      const world = await api<WorldSnapshot>('/api/v1/scenarios/restore', { method: 'POST' });
      this.sanctuary?.scenarioDirector.clearStage();
      if (this.sanctuary) {
        this.sanctuary.jarvis.gestureWorldTarget = null;
        this.sanctuary.jarvis.interruptSpeech();
      }
      this.narratingScenario = false;
      this.lastNarrCueIndex = -1;
      this.activeScenarioDef = null;
      this.applyWorldState(world, false);
    } catch (err) {
      this.error = (err as Error).message;
      this.emit();
    }
  }

  scenarioPlayPause(): boolean {
    const sd = this.sanctuary?.scenarioDirector;
    if (!sd) return false;
    sd.playing = !sd.playing;
    this.emit();
    return sd.playing;
  }

  scenarioReplay() {
    const sd = this.sanctuary?.scenarioDirector;
    if (!sd) return;
    sd.currentTime = 0;
    sd.playing = true;
    this.emit();
  }

  scenarioSeek(t: number) {
    const sd = this.sanctuary?.scenarioDirector;
    if (!sd) return;
    sd.playing = false;
    sd.currentTime = t;
    this.emit();
  }

  scenarioSetRate(rate: number) {
    const sd = this.sanctuary?.scenarioDirector;
    if (sd) {
      sd.playbackRate = rate;
      this.emit();
    }
  }

  scenarioUpdateVariable(key: string, value: number) {
    this.sanctuary?.scenarioDirector.updateVariables({ [key]: value });
    // Emit so the controlled variable sliders re-render with the new value
    // (updateVariables only mutates the director state; without this the
    // slider thumb snaps back — audit bug B9).
    this.emit();
  }

  toggleScenarioRecording(): boolean {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      this.recording = false;
      this.emit();
      return false;
    }
    if (!this.canvas.captureStream || typeof MediaRecorder === 'undefined') {
      this.error = 'MediaRecorder WebM capture is not supported by this browser.';
      this.emit();
      setTimeout(() => { this.error = null; this.emit(); }, 3600);
      return false;
    }
    const stream = this.canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    this.recordedChunks = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.recordedChunks.push(ev.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'jarvis_nexus_scenario.webm';
      a.click();
    };
    recorder.start();
    this.mediaRecorder = recorder;
    this.recording = true;
    this.emit();
    return true;
  }

  private tickScenarioUI() {
    const sd = this.sanctuary?.scenarioDirector;
    if (!sd || !sd.activeScenario) {
      if (this.scenarioTimeReadout) {
        this.scenarioTimeReadout = '';
        this.scenarioPhase = '';
        this.emit();
      }
      this.lastNarrCueIndex = -1;
      return;
    }

    // Scenario narration: when the timeline crosses into a new cue she SPEAKS
    // the phase narration with her synthesized voice + synced mouth. Cues that
    // fire while she is already speaking are QUEUED (max 2, newest wins) and
    // drained when the current speech ends — never silently dropped (the old
    // `!this.speaking` gate consumed the cue index but skipped the speech,
    // and the post-TTS isSpeaking guard lost the cue permanently).
    const cueIdx = sd.lastCueIndex;
    if (sd.playing && cueIdx !== this.lastNarrCueIndex) {
      this.lastNarrCueIndex = cueIdx;
      const cue = sd.activeScenario.timeline?.[Math.max(0, cueIdx)];
      if (cue?.narration && this.narratingScenario) {
        this.narrationQueue.push(cue.narration);
        if (this.narrationQueue.length > 2) this.narrationQueue.shift();
        this._drainNarrationQueue();
      }
    }

    const now = performance.now();
    if (now - this.lastTickEmit < 200) return;
    this.lastTickEmit = now;

    this.scenarioTimeReadout = `${sd.currentTime.toFixed(1).padStart(4, '0')}s / ${sd.duration.toFixed(1)}s`;
    const tl = sd.activeScenario.timeline || [];
    let activeCue = tl[0];
    for (const cue of tl) {
      if (sd.currentTime >= cue.t) activeCue = cue;
    }
    if (activeCue) this.scenarioPhase = activeCue.phase;
    this.emit();
  }

  /** Speak the next queued narration cue if she is idle. Called whenever a
   *  cue fires and whenever any speech (dialogue or narration) ends. */
  private _drainNarrationQueue() {
    const sanctuary = this.sanctuary;
    if (!sanctuary || this.narrationQueue.length === 0) return;
    if (this.speaking || sanctuary.jarvis.isSpeaking) return; // busy — the next onEnd will retry
    const text = this.narrationQueue.shift();
    if (text) void this.speakScenarioNarration(text);
  }

  /** Narrate one scenario timeline cue with her real voice (server TTS) and
   *  audio-driven viseme lip-sync. Streams through the shared sequencer
   *  (sentence chunks + prefetch), falling back to browser TTS per chunk. */
  private speakScenarioNarration(text: string) {
    const sanctuary = this.sanctuary;
    if (!sanctuary || !sanctuary.jarvis.loaded) return;
    if (sanctuary.jarvis.isSpeaking) {
      // Speech started while this cue fired: re-queue instead of dropping it
      // (it will drain on the next speech end).
      this.narrationQueue.unshift(text);
      return;
    }
    this.conversationEmotion = 'focused';
    this.narratingScenario = true;
    this.speechSequencer?.play(text);
  }

  get scenarioDirector() {
    return this.sanctuary?.scenarioDirector ?? null;
  }

  // ------------------------------------------------------------------
  // Real browser sensor enforcement (no hidden capture)
  // ------------------------------------------------------------------
  async enforceBrowserSensorGates() {
    if (!this.sanctuary || !this.world) return;
    const sw = this.world.switches;

    if (!sw.microphone || !sw.master) {
      if (this.micStream) {
        this.micStream.getTracks().forEach((t) => t.stop());
        this.micStream = null;
      }
      // Wake-word engine obeys the MIC + MASTER switches instantly — no
      // microphone track survives either switch going off.
      if (this.wakeEngine && this.wakeEngine.currentState !== 'unavailable') {
        this.wakeEngine.stop();
      }
    } else if (
      this.wakeEngine && this.wakeState === 'unavailable' && !this.wakePermissionDenied
    ) {
      // First-open permission flow: the MIC switch ON moment is the owner's
      // explicit authorisation — the engine requests microphone access once.
      const ok = await this.wakeEngine.start();
      if (!ok) this.wakePermissionDenied = true;
    }

    if (!sw.camera || !sw.master) {
      if (this.camStream) {
        this.camStream.getTracks().forEach((t) => t.stop());
        this.camStream = null;
        if (this.opticalCamEl) this.opticalCamEl.srcObject = null;
        this.camState = 'off';
      }
      this.sanctuary.updateVisionBoard(false, null);
    } else if (!this.camStream && navigator.mediaDevices?.getUserMedia) {
      try {
        this.camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } });
        if (this.opticalCamEl) {
          this.opticalCamEl.srcObject = this.camStream;
          await this.opticalCamEl.play().catch(() => undefined);
        }
        this.sanctuary.updateVisionBoard(true, this.opticalCamEl);
        this.camState = 'live';
      } catch {
        this.sanctuary.updateVisionBoard(false, null);
        this.camState = 'off';
      }
    }
    this.emit();
  }

  // ------------------------------------------------------------------
  // Voice input: SpeechRecognition preferred, MediaRecorder+ASR fallback
  // ------------------------------------------------------------------
  async startVoiceCapture(): Promise<void> {
    if (!this.world?.switches.microphone) {
      this.error = 'Microphone Switch (#2) is OFF. Enable MIC in the top switch bar to authorise audio capture.';
      this.emit();
      setTimeout(() => { this.error = null; this.emit(); }, 4200);
      return;
    }

    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;

    if (SR) {
      const rec: SpeechRecognition = new SR();
      rec.lang = 'en-US';
      rec.interimResults = false;
      this.micState = 'listening';
      this.emit();
      rec.onresult = async (ev: SpeechRecognitionEvent) => {
        const transcript = ev.results[ev.results.length - 1][0].transcript;
        this.micState = 'processing';
        this.emit();
        await this.sendConversation(transcript, 'voice');
        this.micState = 'off';
        this.emit();
      };
      rec.onerror = () => {
        this.micState = 'off';
        this.emit();
      };
      rec.onend = () => {
        if (this.micState === 'listening') {
          this.micState = 'off';
          this.emit();
        }
      };
      try { rec.start(); } catch { /* already started */ }
      return;
    }

    // Fallback: record webm/opus, transcribe via CORE ASR
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.error = 'Voice capture is unavailable in this browser. Type directly instead.';
      this.emit();
      setTimeout(() => { this.error = null; this.emit(); }, 4200);
      return;
    }
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(this.micStream);
      const chunks: Blob[] = [];
      this.micState = 'listening';
      this.emit();
      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
      recorder.onstop = async () => {
        this.micStream?.getTracks().forEach((t) => t.stop());
        this.micState = 'processing';
        this.emit();
        try {
          const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
          const b64 = await blobToBase64(blob);
          const res = await api<{ text: string }>('/api/v1/asr', {
            method: 'POST',
            body: JSON.stringify({ audio_base64: b64 }),
          });
          if (res.text) {
            await this.sendConversation(res.text, 'voice');
          } else {
            this.error = 'No speech detected.';
            this.emit();
            setTimeout(() => { this.error = null; this.emit(); }, 3000);
          }
        } catch (err) {
          this.error = `Voice transcription failed: ${(err as Error).message}`;
          this.emit();
          setTimeout(() => { this.error = null; this.emit(); }, 4200);
        }
        this.micState = 'off';
        this.emit();
      };
      recorder.start();
      // Auto-stop after 12s safety window
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 12000);
      this._pendingRecorder = recorder;
    } catch {
      this.micState = 'off';
      this.error = 'Microphone permission denied.';
      this.emit();
      setTimeout(() => { this.error = null; this.emit(); }, 3600);
    }
  }

  private _pendingRecorder: MediaRecorder | null = null;

  stopVoiceCapture() {
    if (this._pendingRecorder && this._pendingRecorder.state === 'recording') {
      this._pendingRecorder.stop();
    }
  }

  /** UI pill action: arm/disarm the wake-word standby engine. */
  toggleWakeEngine() {
    if (!this.wakeEngine) return;
    if (this.wakeState === 'unavailable') {
      void this.wakeEngine.start().then((ok) => {
        if (!ok) this.wakePermissionDenied = true;
      });
    } else {
      this.wakeEngine.stop();
    }
  }

  /** Force standby from the UI ("sleep now" button equivalent). */
  wakeStandby() {
    this.wakeEngine?.sleep('owner');
  }

  async visionSnapshot() {
    if (!this.world?.switches.camera) {
      this.error = 'Optical Camera Switch (#3) is OFF. Enable CAM to authorise optical capture.';
      this.emit();
      setTimeout(() => { this.error = null; this.emit(); }, 4200);
      return;
    }
    await this.enforceBrowserSensorGates();
    await this.sendConversation(
      'Inspect current live optical camera frame at Vision Station.',
      'vision'
    );
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
