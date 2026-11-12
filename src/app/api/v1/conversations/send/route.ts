import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { synthesizeVoice, think } from '@/lib/nexus/brain';
import { splitSentences } from '@/nexus/vendor/speechStream.mjs';
import {
  commandMoveToZone,
  ensureSeed,
  getPrimaryConversation,
  interruptForOwner,
  resumeInterruptedWork,
  serializeWorld,
  setScenarioRuntime,
} from '@/lib/nexus/worldHub';

/**
 * POST /api/v1/conversations/send
 * The owner speaks (text or voice). The brain replies as a structured directive,
 * which is applied to the authoritative world: JARVIS moves, modes switch, scenarios
 * construct, memories persist. Her voice is synthesized server-side and returned
 * alongside the reply for synchronized viseme lip-sync playback.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSeed();
    const body = await req.json();
    const content = String(body.content || '').trim();
    const modality = String(body.modality || 'text');

    if (!content) {
      return NextResponse.json({ detail: 'Empty message.' }, { status: 400 });
    }

    const switches = await db.ownerSwitch.findMany();
    const switchMap = Object.fromEntries(switches.map((s) => [s.switchKey, s.enabled]));
    if (modality === 'voice' && !switchMap.microphone) {
      return NextResponse.json(
        { detail: 'Microphone switch is OFF. Enable MIC capture to send voice input.' },
        { status: 403 }
      );
    }
    if (modality === 'vision' && !switchMap.camera) {
      return NextResponse.json(
        { detail: 'Camera switch is OFF. Enable optical capture to send live vision input.' },
        { status: 403 }
      );
    }

    const conv = await getPrimaryConversation();

    // Push any ongoing activity onto the resumable stack; turn toward owner
    await interruptForOwner('Conversational turn');

    const userMsg = await db.conversationMessage.create({
      data: {
        conversationId: conv.id,
        role: 'user',
        modality,
        content,
        inferenceSource: 'owner',
        emotionalTone: 'neutral',
      },
    });

    const { directive, inferenceSource } = await think(content);

    // Persist durable memory writes from the directive
    for (const w of directive.memory_writes) {
      await db.memoryRecord.create({
        data: {
          category: ['owner_fact', 'preference', 'commitment', 'project', 'source_research', 'agent_finding', 'conversation_context'].includes(w.category) ? w.category : 'project',
          epistemicStatus: ['owner_stated', 'verified_fact', 'source_backed', 'hypothesis'].includes(w.epistemic_status) ? w.epistemic_status : 'owner_stated',
          title: w.title,
          content: w.content,
          confidence: w.epistemic_status === 'hypothesis' ? 0.7 : 1.0,
          sourceRef: 'Conversation with Owner',
        },
      });
    }

    // Apply directive to the authoritative world
    let world: Awaited<ReturnType<typeof serializeWorld>>;
    if (directive.urgent) {
      world = await commandMoveToZone({
        zone_id: directive.zone || 'defensive_security',
        activity: directive.activity,
        emotional_state: 'urgent',
        urgent: true,
        mode_override: directive.mode || 'defensive_security',
      });
    } else if (directive.scenario_id) {
      const sc = await db.scenarioDefinition.findUnique({ where: { id: directive.scenario_id } });
      if (sc) {
        const defaultVars: Record<string, number> = {};
        for (const v of JSON.parse(sc.variablesJson || '[]')) defaultVars[v.key] = v.default;
        setScenarioRuntime({
          scenario_id: sc.id,
          title: sc.title,
          classification: sc.classification,
          variables: defaultVars,
          playing: true,
          current_time: 0.0,
          playback_rate: 1.0,
        });
      }
      world = await commandMoveToZone({
        zone_id: directive.zone || 'simulation_stage',
        activity: directive.activity,
        emotional_state: directive.emotion,
        mode_override: directive.mode || 'simulation_comparison',
      });
    } else if (directive.zone) {
      world = await commandMoveToZone({
        zone_id: directive.zone,
        activity: directive.activity,
        emotional_state: directive.emotion,
        mode_override: directive.mode,
      });
    } else {
      // She stays where she is, but her emotional state and activity still update
      await db.nexusWorldState.update({
        where: { id: 1 },
        data: {
          emotionalState: directive.emotion,
          activeActivitySummary: directive.activity,
          ...(directive.mode ? { activeMode: directive.mode } : {}),
        },
      });
      world = await serializeWorld();
    }

    const jarvisMsg = await db.conversationMessage.create({
      data: {
        conversationId: conv.id,
        role: 'jarvis',
        modality: 'speech_and_text',
        content: directive.reply,
        inferenceSource,
        emotionalTone: directive.emotion,
        targetZone: directive.zone,
      },
    });

    // Server-side voice synthesis — FIRST SENTENCE ONLY (D-workflow latency
    // kill): the client starts speaking this chunk immediately while fetching
    // the remaining sentences from /voice/tts as she talks. audio_text tells
    // the client exactly which chunk the audio covers.
    const firstChunk = splitSentences(directive.reply)[0] || directive.reply;
    const voice = await synthesizeVoice(firstChunk, directive.emotion);

    return NextResponse.json({
      user_message: { id: userMsg.id, content: userMsg.content, modality: userMsg.modality },
      jarvis_message: {
        id: jarvisMsg.id,
        content: directive.reply,
        inference_source: inferenceSource,
        emotional_tone: directive.emotion,
        target_zone: directive.zone,
        created_at: jarvisMsg.createdAt.toISOString(),
        audio: voice ? voice.audio : null,
        audio_mime: voice ? voice.mime : null,
        audio_text: voice ? firstChunk : null,
        // ARKit blendshape track for the first audio chunk (Audio2Face-3D chain,
        // §14). null when no gateway is configured — client uses local engines.
        audio_faces: voice?.faces ?? null,
      },
      world,
      activated_scenario: world.active_scenario,
    });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
