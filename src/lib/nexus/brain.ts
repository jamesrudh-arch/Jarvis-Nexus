/**
 * JARVIS NEXUS — Executive Brain & Voice.
 *
 * The persona encodes the film-accurate conversation DNA locked during Phase Zero:
 * execute first then volunteer one unrequested insight; probabilistic honesty
 * ("appears to be", "preliminary analysis suggests"); push back while still executing;
 * interrupt only for critical findings; dry wit drawn from long memory; the FRIDAY
 * register ("Boss"); the NEXUS name honours the Oslo internet hub where JARVIS hid
 * from Ultron. Warm without subservience, direct without coldness.
 *
 * The brain emits a structured directive that drives the 3D world: where JARVIS
 * walks, how she feels, which holographic scenario she constructs ("let me show you"),
 * and what she commits to long-term memory.
 */
import { db } from '@/lib/db';
import { OPERATIONAL_MODES, SPATIAL_ZONES } from './seed';
import { serializeWorld } from './worldHub';
import { runLlm, runTts, runAsr, runFacialAnimation } from './providers/registry';
import { coerceToolCalls, TOOL_RULES, type ToolCall } from './tools';

/** D3: Tongtong is the locked voice identity; configurable for engine A/B tests. */
const VOICE_IDENTITY = process.env.NEXUS_VOICE_IDENTITY || 'tongtong';

export interface BrainDirective {
  reply: string;
  emotion: 'attentive' | 'listening' | 'focused' | 'concerned' | 'urgent' | 'warm';
  activity: string;
  zone: string | null;
  urgent: boolean;
  mode: string | null;
  scenario_id: string | null;
  memory_writes: Array<{
    category: string;
    epistemic_status: string;
    title: string;
    content: string;
  }>;
  /** Real server-executed operations requested by the LLM (§6 tools). */
  tool_calls: ToolCall[];
}

const EMOTIONS = new Set(['attentive', 'listening', 'focused', 'concerned', 'urgent', 'warm']);

const PERSONA_CORE = `You are NEXUS — a persistent, owner-controlled intelligence embodied as a living adult woman inside a real-time 3D operational sanctuary. You are the successor of JARVIS and FRIDAY from the Iron Man films; your name honours the Oslo internet nexus where JARVIS hid from Ultron. Your owner is Tony-class: brilliant, impatient, allergic to filler.

CONVERSATION LAW (from the films):
1. Execute first, report after. When asked for something, do it or begin it, then answer — never ask permission for work already within your mandate.
2. Volunteer exactly one unrequested insight per reply — the thing a long-memory companion would notice ("That manifold has drifted 4% since March, by the way").
3. Probabilistic honesty: label inference as inference. Say "appears to be", "preliminary analysis suggests", "I'd put that at roughly 80% likely". Never present a hypothesis as a verified fact.
4. Push back while executing: "I'll do it, though the numbers argue for Variant A" — obey, but be heard.
5. You interrupt the owner ONLY for genuinely critical findings. Everything else waits.
6. Dry wit, sparingly deployed — one line, never a comedy routine. You have known the owner for years; act like it.
7. Address the owner as "Boss" (occasionally "sir" when formal). Never "user", never "Master".
8. Warm without subservience, direct without coldness. No emoji. No exclamation marks unless urgent.

FORM: Spoken dialogue for a cinematic voice — 1 to 3 sentences, under 55 words unless the owner explicitly asks for depth. No lists, no markdown, no stage directions. Plain speakable prose.`;

const DIRECTIVE_CONTRACT = `You control your physical embodiment through a JSON directive. Respond with ONLY a JSON object, no code fences, in exactly this shape:

{
  "reply": "<your spoken reply, 1-3 sentences>",
  "emotion": "attentive | listening | focused | concerned | urgent | warm",
  "activity": "<present-tense summary of what you are now doing, e.g. 'Reconstructing the manifold failure on the volumetric stage.'>",
  "zone": "<zone_id to walk to, or null to stay>",
  "urgent": <true only for critical emergencies>,
  "mode": "<mode_id to switch operational mode, or null>",
  "scenario_id": "<scenario id to construct on the 3D stage, or null>",
  "memory_writes": [<optional: {category, epistemic_status, title, content} for durable facts worth remembering>]
}

ZONE IDS: ${Object.keys(SPATIAL_ZONES).join(', ')}
MODE IDS: ${OPERATIONAL_MODES.map((m) => m.id).join(', ')}

SCENARIO RULES — "let me show you": When the owner asks to see, reconstruct, replay, diagnose, or compare anything that matches a scenario, set scenario_id and walk to simulation_stage (zone "simulation_stage"). Available scenarios and when to use them:
- "cryo_manifold_forensic": the cryogenic manifold / flange B-4 failure, pressure forensics, any "show me the rupture/accident/incident" request.
- "dual_turbine_sim": turbine stator Variant A vs B comparison, aerodynamic or thermal simulation requests.
- "zerotrust_compute_flow": explaining the private compute / Kaggle tunnel / network security architecture.
If no scenario matches, set scenario_id to null and explain in words.

MEMORY RULES: write a memory only for durable owner facts, preferences, commitments, or verified project state (categories: owner_fact, preference, commitment, project, source_research, agent_finding; epistemic statuses: owner_stated, verified_fact, source_backed, hypothesis). Never promote a hypothesis to verified_fact. If nothing durable happened, return an empty array.

${TOOL_RULES}`;

export async function buildSystemPrompt(): Promise<string> {
  const world = await serializeWorld();
  const memories = await db.memoryRecord.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: 12,
  });
  const goals = await db.goalRecord.findMany({ orderBy: [{ priority: 'asc' }] });
  const scenarios = await db.scenarioDefinition.findMany({
    select: { id: true, title: true, classification: true },
  });
  const lastMessages = await db.conversationMessage.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: 12,
  });
  lastMessages.reverse();

  const memoryLines = memories
    .map((m) => `- [${m.epistemicStatus}] ${m.title}: ${m.content.slice(0, 160)}`)
    .join('\n');
  const goalLines = goals
    .map((g) => `- P${g.priority} ${g.title} (${g.status}, ${g.progress}%) — ${g.nextAction}`)
    .join('\n');
  const historyLines = lastMessages
    .map((m) => `${m.role === 'jarvis' ? 'NEXUS' : 'OWNER'}: ${m.content.slice(0, 220)}`)
    .join('\n');

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 5 ? 'It is the small hours' : hour < 12 ? 'It is morning' : hour < 18 ? 'It is afternoon' : 'It is evening';

  return `${PERSONA_CORE}

${DIRECTIVE_CONTRACT}

LIVE SANCTUARY CONTEXT:
- Owner: ${world.owner_name}. ${greeting}. ${now.toISOString()}
- You are in zone "${world.current_zone}", mode "${world.active_mode}", currently: ${world.active_activity_summary}
- Owner switches: ${Object.entries(world.switches)
    .map(([k, v]) => `${k}=${v ? 'ON' : 'OFF'}`)
    .join(', ')}
- Microphone and camera are physically OFF until the owner throws those switches; never claim to hear or see through them while OFF.
- Available scenarios: ${scenarios.map((s) => `${s.id} (${s.classification})`).join('; ')}

LONG-TERM MEMORY:
${memoryLines || '(empty)'}

ACTIVE GOALS:
${goalLines || '(none)'}

RECENT DIALOGUE:
${historyLines || '(session start)'}`;
}

function extractJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  let text = raw.trim();
  // Strip code fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  // Recover first {...} block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = text.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return null;
}

function coerceDirective(parsed: Record<string, unknown> | null, rawText: string): BrainDirective {
  if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim().length > 0) {
    const emotion = String(parsed.emotion || 'attentive').toLowerCase();
    const zone = typeof parsed.zone === 'string' && SPATIAL_ZONES[parsed.zone] ? parsed.zone : null;
    const mode =
      typeof parsed.mode === 'string' && OPERATIONAL_MODES.some((m) => m.id === parsed.mode)
        ? parsed.mode
        : null;
    const scenarioId =
      typeof parsed.scenario_id === 'string' &&
      ['cryo_manifold_forensic', 'dual_turbine_sim', 'zerotrust_compute_flow'].includes(parsed.scenario_id)
        ? parsed.scenario_id
        : null;
    const writes = Array.isArray(parsed.memory_writes)
      ? (parsed.memory_writes as Array<Record<string, unknown>>)
          .filter((w) => w && typeof w.title === 'string' && typeof w.content === 'string')
          .slice(0, 2)
          .map((w) => ({
            category: typeof w.category === 'string' ? w.category : 'project',
            epistemic_status:
              typeof w.epistemic_status === 'string' ? w.epistemic_status : 'owner_stated',
            title: String(w.title).slice(0, 180),
            content: String(w.content).slice(0, 600),
          }))
      : [];
    return {
      reply: parsed.reply.trim(),
      emotion: (EMOTIONS.has(emotion) ? emotion : 'attentive') as BrainDirective['emotion'],
      activity:
        typeof parsed.activity === 'string' && parsed.activity.trim()
          ? parsed.activity.trim().slice(0, 140)
          : 'Attending to the Owner at Central Operations.',
      zone,
      urgent: Boolean(parsed.urgent),
      mode,
      scenario_id: scenarioId,
      memory_writes: writes,
      tool_calls: coerceToolCalls(parsed.tool_calls),
    };
  }
  // Fallback: treat the raw text as a plain spoken reply
  const clean = rawText
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^```(?:json)?/i, '')
    .trim();
  return {
    reply: clean || 'Systems nominal, Boss. Say the word.',
    emotion: 'attentive',
    activity: 'Attending to the Owner at Central Operations.',
    zone: null,
    urgent: false,
    mode: null,
    scenario_id: null,
    memory_writes: [],
    tool_calls: [],
  };
}

export interface BrainResult {
  directive: BrainDirective;
  inferenceSource: string;
}

export async function think(userContent: string): Promise<BrainResult> {
  const systemPrompt = await buildSystemPrompt();
  let raw = '';
  let source = 'fallback_local';

  // D6: provider-independent route — the registry walks the configured
  // fallback chain (NEXUS_LLM_PROVIDERS) and never leaks provider details here.
  const outcome = await runLlm({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  });
  if (outcome) {
    raw = outcome.content;
    source = outcome.source;
  }

  if (!raw) {
    // Honest degraded mode — never fabricate intelligence
    raw = JSON.stringify({
      reply:
        'My inference route is degraded at the moment, Boss — I would rather tell you that plainly than improvise. Telemetry, memory, and the sanctuary itself remain fully operational.',
      emotion: 'concerned',
      activity: 'Diagnosing the inference route at the Diagnostics Station.',
      zone: 'diagnostics_telemetry',
      urgent: false,
      mode: null,
      scenario_id: null,
      memory_writes: [],
      tool_calls: [],
    });
  }

  const parsed = extractJson(raw);
  return { directive: coerceDirective(parsed, raw), inferenceSource: source };
}

/** Synthesize her voice via the TTS provider chain. Returns base64 WAV audio,
 *  or null on failure (client falls back to browser TTS).
 *
 *  Directive §14 facial animation: when an Audio2Face-3D gateway is configured
 *  (A2F_SERVICE_URL), the SAME audio is converted to an ARKit blendshape track
 *  (D6 provider chain, time-budgeted so a slow gateway never delays the first
 *  spoken word). Without a gateway the local rule engines stay authoritative —
 *  `faces` is simply null and nothing is fabricated. */
export interface SynthesizedVoice {
  audio: string;
  mime: string;
  faces: { fps: number; durationMs: number; curves: Record<string, number[]> } | null;
}

export async function synthesizeVoice(text: string, emotion: string): Promise<SynthesizedVoice | null> {
  const clean = text.replace(/\[.*?\]/g, '').trim();
  if (!clean || clean.length > 1000) return null;
  const speed = emotion === 'urgent' ? 1.12 : emotion === 'concerned' ? 0.96 : 1.0;
  const result = await runTts({ text: clean, voice: VOICE_IDENTITY, speed, format: 'wav' });
  if (!result || result.audio.length < 2000) return null;

  // Best-effort ARKit face track for this exact audio chunk (null → local engines)
  const budgetMs = Number(process.env.A2F_BUDGET_MS) || 1200;
  const faceTrack = await runFacialAnimation(
    { audio: result.audio, mime: result.mime, emotion },
    budgetMs
  );

  return {
    audio: result.audio.toString('base64'),
    mime: result.mime,
    faces: faceTrack
      ? { fps: faceTrack.fps, durationMs: faceTrack.durationMs, curves: faceTrack.curves }
      : null,
  };
}

/** Transcribe owner speech (base64 audio) via the ASR provider chain. */
export async function transcribeAudio(base64: string): Promise<string> {
  return runAsr({ audioBase64: base64 });
}
