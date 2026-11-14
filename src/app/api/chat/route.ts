import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { worldSummary } from "@/lib/nexus/state";
import { ensureBootstrapped } from "@/lib/nexus/boot";
import { EventStore } from "@/lib/nexus/store";
import { ensureIdentity, identitySystemPrompt } from "@/lib/nexus/identity";
import { findJarvis } from "@/lib/nexus/jarvis";
import { LongTermMemory } from "@/lib/nexus/memory";
import { route, recordRouting } from "@/lib/nexus/router";

export const dynamic = "force-dynamic";

/**
 * POST { message: string }
 * JARVIS conversation backed by GLM (z-ai-web-dev-sdk, server-side only),
 * grounded in LIVE world state + her PERSISTENT IDENTITY (versioned, in the
 * event log — provider-independent) + her own world memories. The model
 * sees actual simulation state, never fabricated status.
 */
export async function POST(req: Request) {
  const started = Date.now();
  let routing: Awaited<ReturnType<typeof route>>["chosen"] = "none";
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body.message ?? "").slice(0, 4000);
    if (!message.trim()) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    await ensureBootstrapped(db);

    // ---- provider routing (explicit, auditable, honest)
    const decision = route("reasoning");
    routing = decision.chosen;
    if (decision.chosen === "none") {
      return NextResponse.json(
        { error: "no selectable reasoning provider (see /api/providers)", grounded: false },
        { status: 503 }
      );
    }
    await recordRouting(db, "reasoning", decision.chosen, "selected", `${decision.skipped.length} skipped`);

    // ---- live world context (honest grounding)
    const world = await worldSummary(db);
    const grounding = [
      `World: ${world.world_name} (id ${world.world_id}).`,
      `Sim time: ${world.clock.sim_time_utc} (local ${world.clock.local_time}, ${world.clock.season}, ${world.clock.is_daytime ? "daytime" : "night"}).`,
      `Tick ${world.tick}. Weather: ${world.weather}.`,
      `Population: ${world.population} residents, ${world.buildings} buildings, ${world.districts} districts.`,
      `Economy: ${world.economy?.businesses ?? 0} businesses, ${world.economy?.transactions ?? 0} recorded transactions, ${world.economy?.salaries_paid ?? 0} salaries paid (${world.economy?.salaries_missed ?? 0} missed).`,
      `Cumulative: ${world.events} events, ${world.memories} memories, ${world.communications} conversations.`,
      `Current actions: ${Object.entries(world.action_distribution)
        .map(([a, n]) => `${a}×${n}`)
        .join(", ")}.`,
      `Recent events: ${world.recent_events
        .slice(0, 8)
        .map((e) => `tick ${e.tick} ${e.type}${e.topic ? ` (${e.topic})` : ""}`)
        .join("; ")}.`,
    ].join("\n");

    // ---- JARVIS persistent identity + her presence + her memories
    const store = new EventStore(db);
    const tick = await store.currentTick;
    const identity = await ensureIdentity(store, tick);
    const jarvis = await findJarvis(store);
    const ltm = new LongTermMemory(store);
    let presenceBlock = "";
    let retrievedMemories: string[] = [];
    if (jarvis) {
      const mems = await ltm.memories(jarvis.resident_id, tick, 5);
      retrievedMemories = mems.map((m) => m.text);
      presenceBlock = [
        "",
        "YOUR PRESENCE IN THE WORLD (live — you are a resident, not an outside observer):",
        `Right now you are: ${jarvis.action}${jarvis.room_id ? " (indoors)" : ""} at ${world.jarvis?.at_building ?? "your Sanctum"}${world.jarvis?.room ? `, in the ${world.jarvis.room}` : ""}.`,
        `Wallet: ${jarvis.wallet ?? "?"} (you draw no salary — you are the operator, not payroll).`,
        retrievedMemories.length
          ? `Your own recent memories (salience-ranked, real — from the event log):\n${retrievedMemories.map((t) => `- ${t}`).join("\n")}`
          : "You have no world memories yet.",
      ].join("\n");
    }

    const history = await db.chatMessage.findMany({
      orderBy: { createdAt: "asc" },
      take: 12,
    });
    const priorMessages = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              identitySystemPrompt(identity) +
              "\n\nYou are the operator intelligence of NEXUS WORLD — a persistent simulated civilisation with a real economy. " +
              "You are grounded in the LIVE world state below; never invent facts about the world. " +
              "If asked about things you cannot observe, say so. You care about the residents and can explain the simulation architecture " +
              "(event-sourced store, deterministic engine, autonomy policy, provider failover) when asked.\n\nLIVE WORLD STATE:\n" +
              grounding +
              presenceBlock,
          },
          ...priorMessages,
          { role: "user", content: message },
        ],
        thinking: { type: "disabled" },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("provider timeout")), 45000)),
    ])) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
      model?: string;
    };

    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("empty completion");
    await recordRouting(db, "reasoning", decision.chosen, "ok", `${Date.now() - started}ms`);

    await db.chatMessage.createMany({
      data: [
        { role: "user", content: message, provider: decision.chosen },
        {
          role: "assistant",
          content: reply,
          provider: decision.chosen,
          model: completion.model ?? "glm",
          latencyMs: Date.now() - started,
          tokens: completion.usage?.total_tokens ?? null,
        },
      ],
    });

    // ---- episodic memory of this exchange (event-sourced, replay-safe)
    if (jarvis) {
      const memoId = `mem-j-${crypto.randomUUID().slice(0, 12)}`;
      const summary = `Talked with the user: "${message.slice(0, 70)}${message.length > 70 ? "…" : ""}" — answered about ${reply.slice(0, 60).replace(/\n/g, " ")}${reply.length > 60 ? "…" : ""}`;
      await store.append(tick, "resident.memory_recorded", {
        idempotency_key: memoId,
        memory_id: memoId,
        resident_id: jarvis.resident_id,
        tick,
        kind: "conversation",
        text: summary,
        importance: 3,
      });
    }

    return NextResponse.json({
      reply,
      provider: decision.chosen,
      model: completion.model ?? "glm",
      latency_ms: Date.now() - started,
      tokens: completion.usage?.total_tokens ?? null,
      grounded: true,
      identity_version: identity.version,
      memories_used: retrievedMemories.length,
    });
  } catch (e) {
    const err = (e as Error).message;
    const rateLimited = /429|rate/i.test(err);
    await recordRouting(db, "reasoning", routing, "failed", rateLimited ? "rate window" : err.slice(0, 200)).catch(() => {});
    return NextResponse.json(
      {
        error: rateLimited
          ? "GLM provider is rate-limited right now (live window). Retry shortly — no fabricated replies."
          : `provider unavailable: ${err}`,
        provider: routing,
        grounded: false,
      },
      { status: 503 }
    );
  }
}

export async function GET() {
  const messages = await db.chatMessage.findMany({ orderBy: { createdAt: "asc" }, take: 100 });
  return NextResponse.json({ messages });
}

export async function DELETE() {
  await db.chatMessage.deleteMany();
  return NextResponse.json({ cleared: true });
}
