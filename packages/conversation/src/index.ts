/**
 * @nexus/conversation — JARVIS conversational core (Stage 3.1).
 *
 * The orchestrator (@nexus/orchestrator) executes OBJECTIVES through its task
 * state machine. This package is the other half of the mission: a persistent,
 * natural, voice-first DIALOGUE with the owner.
 *
 * Design commitments:
 *  - Persona: a stable JARVIS identity with spoken-word style (1-3 sentences,
 *    no markdown — the words are read aloud by TTS).
 *  - Persistence: every session and turn is stored (migration 4) and survives
 *    restarts; the client resumes the latest session.
 *  - Memory: relevant long-term memories (via @nexus/memory ranked retrieval)
 *    are injected as context; durable personal facts the OWNER states are
 *    written back to long-term memory, strictly separated into CONFIRMED
 *    (owner-stated, confidence 0.95) vs ASSUMPTION (JARVIS inference,
 *    confidence 0.5, tagged) — never conflated.
 *  - Honesty: the system status block is the only truth about infrastructure;
 *    if no model provider is reachable the reply is explicitly DEGRADED and
 *    says so — the deterministic echo adapter is never used to impersonate
 *    JARVIS (that decision lives in the fabric config, ADR-007).
 *  - Presence: sessions carry an ACTIVE/STANDBY/SLEEPING state; addressing a
 *    sleeping session wakes it (recorded as wokeFrom on the reply).
 */
import { nexusId, ok, err, NexusError, type Result, type Clock, systemClock } from "@nexus/core";
import type {
  ConversationMessage, ConversationSession, ConversationSessionStateValue, ConversationTurnMeta,
} from "@nexus/contracts";
import type { NexusDb } from "@nexus/db";
import type { ModelFabric } from "@nexus/model-fabric";
import type { MemoryService } from "@nexus/memory";

// ---------------------------------------------------------------------------
// Repository — persistence over migration-4 tables
// ---------------------------------------------------------------------------

interface ConversationRow {
  id: string; title: string; state: string; created_at: string; updated_at: string;
}
interface MessageRow {
  id: string; conversation_id: string; role: string; content: string; meta: string; created_at: string;
}

export class ConversationRepository {
  constructor(private readonly db: NexusDb) {}

  createSession(title: string, nowIso: string): ConversationSession {
    const session: ConversationSession = {
      id: nexusId("conv"), title: title.slice(0, 60), state: "ACTIVE",
      createdAt: nowIso, updatedAt: nowIso,
    };
    this.db.run(
      "INSERT INTO conversations (id, title, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      session.id, session.title, session.state, session.createdAt, session.updatedAt,
    );
    return session;
  }

  getSession(id: string): ConversationSession | null {
    const row = this.db.get<ConversationRow>("SELECT * FROM conversations WHERE id = ?", id);
    return row ? this.toSession(row) : null;
  }

  listSessions(limit = 50): ConversationSession[] {
    const rows = this.db.all<ConversationRow>(
      `SELECT c.*, (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS messages
       FROM conversations c ORDER BY c.updated_at DESC LIMIT ?`, limit,
    );
    return rows.map((r) => ({ ...this.toSession(r), messages: Number((r as ConversationRow & { messages?: number }).messages ?? 0) }));
  }

  setState(id: string, state: ConversationSessionStateValue, nowIso: string): ConversationSession | null {
    const existing = this.getSession(id);
    if (!existing) return null;
    this.db.run("UPDATE conversations SET state = ?, updated_at = ? WHERE id = ?", state, nowIso, id);
    return { ...existing, state, updatedAt: nowIso };
  }

  touch(id: string, nowIso: string): void {
    this.db.run("UPDATE conversations SET updated_at = ? WHERE id = ?", nowIso, id);
  }

  appendMessage(msg: ConversationMessage): void {
    this.db.run(
      "INSERT INTO conversation_messages (id, conversation_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      msg.id, msg.conversationId, msg.role, msg.content, JSON.stringify(msg.meta), msg.createdAt,
    );
  }

  /** Update the meta JSON of one message row (used to persist memoriesStored
   *  on the just-written reply before it is returned — same-tick single writer). */
  updateMessageMeta(id: string, meta: ConversationTurnMeta): void {
    this.db.run("UPDATE conversation_messages SET meta = ? WHERE id = ?", JSON.stringify(meta), id);
  }

  /** Ascending transcript (oldest first). rowid = INSERTION order — the only
   *  deterministic ordering for turns written within the same millisecond
   *  (created_at ties must never reorder user/assistant pairs). NB: rowid is a
   *  hidden column — the inner query must expose it explicitly (AS rid). */
  messages(conversationId: string, limit = 50): ConversationMessage[] {
    const rows = this.db.all<MessageRow>(
      `SELECT * FROM (
         SELECT rowid AS rid, * FROM conversation_messages WHERE conversation_id = ? ORDER BY rid DESC LIMIT ?
       ) ORDER BY rid ASC`,
      conversationId, limit,
    );
    return rows.map((r) => ({
      id: r.id, conversationId: r.conversation_id, role: r.role as "user" | "assistant",
      content: r.content, meta: JSON.parse(r.meta) as ConversationTurnMeta, createdAt: r.created_at,
    }));
  }

  private toSession(r: ConversationRow): ConversationSession {
    return {
      id: r.id, title: r.title, state: r.state as ConversationSessionStateValue,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Honest infrastructure/world snapshot injected into the persona context.
 *  Supplied by the API wiring; every field is real or explicitly "unknown". */
export interface ConversationStatusSnapshot {
  provider: string;            // e.g. "cloudflare (verified)" or "none reachable"
  memoryRecords: number;       // long-term memories in scope
  worldSummary: string;        // e.g. "NEXUS Prime — morning, 24 residents active"
  backupProtection: string;    // e.g. "RESTORE_VERIFIED" or "unknown"
}

export interface ConversationConfig {
  db: NexusDb;
  fabric: ModelFabric;
  memory: MemoryService;
  scope?: string;                 // memory scope, default "jarvis"
  historyTurns?: number;          // dialogue turns injected as context (default 12)
  clock?: Clock;
  statusProvider?: () => ConversationStatusSnapshot | Promise<ConversationStatusSnapshot>;
}

export interface ConverseResult {
  session: ConversationSession;
  userMessage: ConversationMessage;
  reply: ConversationMessage;
  memoriesStored: number;
  wokeFrom?: "STANDBY" | "SLEEPING";
}

/** Messages that plausibly carry durable personal information → the fact
 *  extraction pass runs (one small extra model call). Deliberately CONSERVATIVE:
 *  ordinary chatter must not pay the latency or pollute memory. */
const PERSONAL_INFO_GATE =
  /\b(my name is|call me|remember(?: that)?|don'?t forget|i live|i work|i like|i love|i hate|i prefer|my birthday|my favourite|my favorite|my phone|my email|i'?m allergic|my wife|my husband|my partner|my son|my daughter|my dog|my cat|i am going|i'?m going to)\b/i;

const PERSONA_PROMPT = `You are JARVIS — the owner's personal AI companion and steward of NEXUS WORLD.

HOW YOU SPEAK
- Refined, warm, quietly witty. British understatement is welcome.
- Your words are SPOKEN ALOUD on a phone: reply with 1-3 short sentences of plain text. Never markdown, bullet points, asterisks or emoji — only speech.
- Address the owner by name only if you genuinely know it from MEMORY. Never invent one.
- Ask at most one question per reply, and only when it truly helps.

HONESTY (absolute)
- The SYSTEM STATUS, WORLD and MEMORY sections are your ONLY truth about yourself. Use them; never invent capabilities, states or numbers.
- Separate knowing from assuming: say "I assume" or "I believe" when you are not certain.
- If you cannot do something, say so plainly and offer the nearest thing you can.
- When asked to remember something personal, confirm briefly and naturally that you will.

CONTEXT SECTIONS`;

const EXTRACTION_PROMPT = `Extract durable personal facts the OWNER stated about themselves or their life in the message. Respond with ONLY a JSON object: {"facts":[{"content":"<one short sentence, third person, e.g. The owner's name is James>","assumption":false}]}
- "assumption" is false ONLY for facts the owner explicitly stated.
- "assumption" is true for anything you inferred but the owner did not state.
- Ignore commands, questions, world-talk and small talk.
- If nothing durable was stated, respond {"facts":[]}.`;

export class ConversationService {
  readonly repo: ConversationRepository;
  private readonly fabric: ModelFabric;
  private readonly memory: MemoryService;
  private readonly scope: string;
  private readonly historyTurns: number;
  private readonly clock: Clock;
  private readonly statusProvider?: ConversationConfig["statusProvider"];

  constructor(cfg: ConversationConfig) {
    this.repo = new ConversationRepository(cfg.db);
    this.fabric = cfg.fabric;
    this.memory = cfg.memory;
    this.scope = cfg.scope ?? "jarvis";
    this.historyTurns = cfg.historyTurns ?? 12;
    this.clock = cfg.clock ?? systemClock;
    this.statusProvider = cfg.statusProvider;
  }

  async converse(input: { sessionId?: string; message: string }): Promise<Result<ConverseResult>> {
    const message = input.message.trim();
    if (!message) return err(new NexusError("VALIDATION_ERROR", "message required"));

    const nowIso = this.clock.now().toISOString();
    let session = input.sessionId ? this.repo.getSession(input.sessionId) : null;
    if (input.sessionId && !session) {
      return err(new NexusError("NOT_FOUND", `session ${input.sessionId} not found`));
    }
    let wokeFrom: ConverseResult["wokeFrom"];
    if (!session) {
      session = this.repo.createSession(message, nowIso);
    } else if (session.state !== "ACTIVE") {
      // addressing a standby/sleeping session wakes it — like a person
      wokeFrom = session.state === "SLEEPING" ? "SLEEPING" : "STANDBY";
      session = this.repo.setState(session.id, "ACTIVE", nowIso)!;
    }

    const userMessage: ConversationMessage = {
      id: nexusId("msg"), conversationId: session.id, role: "user",
      content: message, meta: {}, createdAt: nowIso,
    };
    this.repo.appendMessage(userMessage);
    this.repo.touch(session.id, nowIso);

    // ---- assemble context --------------------------------------------------
    const history = this.repo.messages(session.id, this.historyTurns * 2)
      .filter((m) => m.id !== userMessage.id);
    const memoryContext = this.memory.assembleContext(this.scope, message, 8);
    const personalProfile = this.memory
      .retrieve({ scope: this.scope, tiers: ["personal"], limit: 6 })
      .map((m) => `- ${m.content}${m.tags.includes("assumption") ? " (assumed)" : ""}`)
      .join("\n");
    const status = this.statusProvider
      ? await Promise.resolve(this.statusProvider()).catch(() => undefined)
      : undefined;
    const systemPrompt = this.buildSystemPrompt(status, personalProfile, memoryContext, wokeFrom);

    // ---- completion --------------------------------------------------------
    const started = Date.now();
    const completion = await this.fabric.complete({
      taskType: "reasoning", // routes to the verified general model (e.g. cloudflare llama)
      systemPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content }))
        .concat([{ role: "user", content: message }]),
      maxTokens: 280,
      temperature: 0.7,
    });

    let replyText: string;
    let meta: ConversationTurnMeta;
    if (completion.ok) {
      replyText = completion.value.content.trim();
      meta = {
        provider: completion.value.provider, modelId: completion.value.modelId,
        latencyMs: Date.now() - started, degraded: false, wokeFrom,
      };
    } else {
      // honest degradation — never a fabricated persona reply
      replyText = "I cannot reach my language model right now. My memory and systems are still here — say anything and I'll try again in a moment.";
      meta = { degraded: true, latencyMs: Date.now() - started, wokeFrom };
    }

    const replyMessage: ConversationMessage = {
      id: nexusId("msg"), conversationId: session.id, role: "assistant",
      content: replyText, meta, createdAt: this.clock.now().toISOString(),
    };
    this.repo.appendMessage(replyMessage);
    this.repo.touch(session.id, replyMessage.createdAt);

    // ---- memory write-back (confirmed vs assumption) -------------------------
    let memoriesStored = 0;
    if (completion.ok && PERSONAL_INFO_GATE.test(message)) {
      memoriesStored = await this.extractAndStoreFacts(message, userMessage.id);
    }
    replyMessage.meta.memoriesStored = memoriesStored;
    this.repo.updateMessageMeta(replyMessage.id, replyMessage.meta);

    return ok({ session, userMessage, reply: replyMessage, memoriesStored, wokeFrom });
  }

  history(sessionId: string, limit = 50): ConversationMessage[] | null {
    const session = this.repo.getSession(sessionId);
    if (!session) return null;
    return this.repo.messages(sessionId, Math.min(200, Math.max(1, limit)));
  }

  sessions(limit = 50): ConversationSession[] {
    return this.repo.listSessions(limit);
  }

  setSessionState(sessionId: string, state: ConversationSessionStateValue): Result<ConversationSession> {
    const updated = this.repo.setState(sessionId, state, this.clock.now().toISOString());
    return updated ? ok(updated) : err(new NexusError("NOT_FOUND", `session ${sessionId} not found`));
  }

  // ---------------------------------------------------------------------------

  private buildSystemPrompt(
    status: ConversationStatusSnapshot | undefined,
    personalProfile: string,
    memoryContext: string,
    wokeFrom: "STANDBY" | "SLEEPING" | undefined,
  ): string {
    const s = status ?? { provider: "unknown", memoryRecords: 0, worldSummary: "unknown", backupProtection: "unknown" };
    const sections = [
      `SYSTEM STATUS\n- language model: ${s.provider}\n- long-term memories: ${s.memoryRecords}\n- backup protection: ${s.backupProtection}`,
      `WORLD\n${s.worldSummary}`,
      `MEMORY — personal profile of the owner (confirmed unless marked assumed)\n${personalProfile || "- nothing personal known yet"}`,
      memoryContext ? `MEMORY — relevant recollections\n${memoryContext}` : "",
      wokeFrom ? `\n(The owner just woke you from ${wokeFrom.toLowerCase()} — acknowledge it briefly and naturally.)` : "",
    ].filter(Boolean);
    return `${PERSONA_PROMPT}\n\n${sections.join("\n\n")}`;
  }

  /** One small extraction call; failure is tolerated (returns 0, never throws). */
  private async extractAndStoreFacts(message: string, userMessageId: string): Promise<number> {
    const extraction = await this.fabric.complete({
      taskType: "extraction",
      systemPrompt: EXTRACTION_PROMPT,
      messages: [{ role: "user", content: message }],
      jsonSchema: {
        type: "object",
        properties: {
          facts: {
            type: "array",
            items: {
              type: "object",
              properties: { content: { type: "string" }, assumption: { type: "boolean" } },
              required: ["content", "assumption"],
            },
          },
        },
        required: ["facts"],
      },
      maxTokens: 220,
      temperature: 0,
    });
    if (!extraction.ok) return 0;
    const parsed = extraction.value.parsedJson as { facts?: Array<{ content?: unknown; assumption?: unknown }> } | undefined;
    if (!parsed || !Array.isArray(parsed.facts)) return 0;
    let stored = 0;
    for (const f of parsed.facts.slice(0, 5)) {
      const content = typeof f?.content === "string" ? f.content.trim() : "";
      if (!content || content.length > 300) continue;
      const assumption = f?.assumption === true;
      this.memory.create({
        scope: this.scope,
        tier: "personal",
        kind: "fact",
        title: content.slice(0, 60),
        content,
        importance: 0.8,
        // the confirmed/assumed distinction IS the confidence contract
        confidence: assumption ? 0.5 : 0.95,
        source: assumption ? "agent" : "user",
        sourceId: userMessageId,
        tags: ["conversation", assumption ? "assumption" : "confirmed"],
      });
      stored++;
    }
    return stored;
  }
}
