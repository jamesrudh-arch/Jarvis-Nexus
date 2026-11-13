import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { synthesizeVoice, think } from '@/lib/nexus/brain';
import { executeTool, detectImplicitStorageTool, composeToolReply, type ToolResult } from '@/lib/nexus/tools';
import { runLlm } from '@/lib/nexus/providers/registry';
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
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

/**
 * POST /api/v1/conversations/send
 * The owner speaks (text or voice). The brain replies as a structured directive,
 * which is applied to the authoritative world: JARVIS moves, modes switch, scenarios
 * construct, memories persist. Her voice is synthesized server-side and returned
 * alongside the reply for synchronized viseme lip-sync playback.
 */
export async function POST(req: NextRequest) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
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

    // §6 tool execution: REAL operations against live services, then the
    // ACTUAL results are spoken back (follow-up turn — never fabricated).
    // Honesty guard: if the LLM failed to emit a tool call for an unambiguous
    // explicit storage request (observed 2026-11-13: claimed deletion without
    // executing), the server force-executes it so the spoken reply matches
    // reality.
    // Phase 1 (Part 13): the Computer Control switch gates ALL tool execution.
    // OFF → tool calls are dropped and the reply states the switch is off
    // (never silently, never pretending execution happened).
    let toolExecutionBlocked = false;
    if (!switchMap.computer_control) {
      if (directive.tool_calls.length > 0) toolExecutionBlocked = true;
      directive.tool_calls = [];
    }
    if (directive.tool_calls.length === 0 && !toolExecutionBlocked) {
      const implicit = detectImplicitStorageTool(content);
      if (implicit) directive.tool_calls = [implicit];
      if (directive.tool_calls.length > 0 && !switchMap.computer_control) {
        toolExecutionBlocked = true;
        directive.tool_calls = [];
      }
    }
    let toolResults: ToolResult[] = [];
    if (directive.tool_calls.length > 0) {
      for (const call of directive.tool_calls) {
        toolResults.push(await executeTool(call));
      }
      // Speak the ACTUAL results: LLM turn first; deterministic template
      // from the real results when the LLM is unavailable (production may
      // run without an LLM provider credential — tools still execute and
      // the reply must never claim something that did not happen).
      let spoken = '';
      try {
        const speak = await runLlm({
          messages: [
            {
              role: 'assistant',
              content:
                'You are NEXUS (persona: FRIDAY register, address the owner as "Boss", '
                + '1-2 sentences, plain speakable prose, no markdown, no emoji). '
                + 'You just executed tool operations for the owner. Speak ONLY what the '
                + 'ACTUAL results below say — never invent success or details. If a '
                + 'result failed, say it failed plainly.',
            },
            {
              role: 'user',
              content: `Owner asked: "${content}"
Tool results: ${JSON.stringify(toolResults)}`,
            },
          ],
        });
        spoken = speak?.content?.trim() ?? '';
      } catch {
        // fall through to deterministic reply
      }
      const deterministic = composeToolReply(toolResults);
      if (spoken && inferenceSource !== 'fallback_local') {
        directive.reply = spoken.slice(0, 600);
      } else if (deterministic) {
        directive.reply = deterministic.slice(0, 600);
      }
    } else if (toolExecutionBlocked) {
      // Honest block notice: the tool never ran; the owner must hear why.
      directive.reply =
        'Computer Control switch is OFF, Boss — I have not executed any tools. '
        + 'Enable Computer Control to allow tool operations.';
    }

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
      // §6 tools: actual execution results (ok/detail/data only — no secrets)
      tool_results: toolResults,
      world,
      activated_scenario: world.active_scenario,
    });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
