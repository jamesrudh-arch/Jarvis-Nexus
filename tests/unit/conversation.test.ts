import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { NexusDb, migrate } from "@nexus/db";
import { ConversationService } from "@nexus/conversation";
import { MemoryService } from "@nexus/memory";
import { ModelFabric, extractJson } from "@nexus/model-fabric";
import type { CompletionRequest, CompletionResponse } from "@nexus/contracts";
import type { ProviderAdapter } from "@nexus/model-fabric";
import type { Result } from "@nexus/core";
import { ok } from "@nexus/core";

/**
 * Unit tests: JARVIS conversational core (Stage 3.1).
 *
 * A SCRIPTED provider adapter makes every behaviour deterministic: persona
 * replies for chat turns, a fixed JSON payload for fact extraction. No
 * network, no echo-impersonation.
 */

const PERSONA_REPLY = "Good evening, sir. All systems are yours.";
const EXTRACTION_JSON = JSON.stringify({
  facts: [
    { content: "The owner's name is James", assumption: false },
    { content: "The owner enjoys hiking", assumption: false },
    { content: "The owner seems to prefer evenings", assumption: true },
  ],
});

class ScriptedAdapter implements ProviderAdapter {
  readonly provider = "cloudflare" as const;
  async complete(req: CompletionRequest, _model: string): Promise<Result<CompletionResponse>> {
    const content = req.jsonSchema ? EXTRACTION_JSON : PERSONA_REPLY;
    return ok({
      modelId: "scripted:test",
      content,
      parsedJson: req.jsonSchema ? extractJson(content) : undefined,
      usage: { inputTokens: 1, outputTokens: 1 },
      latencyMs: 1,
      provider: "cloudflare",
    });
  }
  async healthCheck(): Promise<Result<boolean>> { return ok(true); }
}

let TMP: string;
let db: NexusDb;

afterEach(() => {
  try { db.close(); } catch { /* best effort */ }
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ }
});

beforeEach(() => {
  TMP = `/tmp/nexus_conv_unit_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  mkdirSync(TMP, { recursive: true });
  db = NexusDb.open(`${TMP}/nexus.db`);
  migrate(db);
});

describe("ConversationService", () => {
  test("creates a session, persists both turns, and answers with the model reply", async () => {
    const fabric = new ModelFabric({ providers: { cloudflare: new ScriptedAdapter() } });
    const memory = MemoryService.withDb(db, undefined as never);
    const svc = new ConversationService({ db, fabric, memory });

    const r = await svc.converse({ message: "Hello JARVIS, how are you?" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.session.state).toBe("ACTIVE");
    expect(r.value.session.title).toContain("Hello JARVIS");
    expect(r.value.userMessage.role).toBe("user");
    expect(r.value.reply.content).toBe(PERSONA_REPLY);
    expect(r.value.reply.meta.degraded).toBe(false);
    expect(r.value.reply.meta.provider).toBe("cloudflare");
    expect(r.value.memoriesStored).toBe(0); // small talk — no extraction ran

    const history = svc.history(r.value.session.id);
    expect(history?.length).toBe(2);
    expect(history?.[0]?.role).toBe("user");
    expect(history?.[1]?.role).toBe("assistant");
  });

  test("second turn continues the same session with dialogue context", async () => {
    const fabric = new ModelFabric({ providers: { cloudflare: new ScriptedAdapter() } });
    const memory = MemoryService.withDb(db, undefined as never);
    const svc = new ConversationService({ db, fabric, memory });

    const first = await svc.converse({ message: "Hello JARVIS" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await svc.converse({ sessionId: first.value.session.id, message: "What did I just say?" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.session.id).toBe(first.value.session.id);
    expect(svc.history(first.value.session.id)?.length).toBe(4);
  });

  test("personal facts are stored CONFIRMED vs ASSUMED with distinct confidence and tags", async () => {
    const fabric = new ModelFabric({ providers: { cloudflare: new ScriptedAdapter() } });
    const memory = MemoryService.withDb(db, undefined as never);
    const svc = new ConversationService({ db, fabric, memory });

    const r = await svc.converse({ message: "My name is James and remember that I love hiking" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.memoriesStored).toBe(3);

    const personal = memory.retrieve({ scope: "jarvis", tiers: ["personal"], limit: 10 });
    expect(personal.length).toBe(3);
    const confirmed = personal.filter((m) => m.tags.includes("confirmed"));
    const assumptions = personal.filter((m) => m.tags.includes("assumption"));
    expect(confirmed.length).toBe(2);
    expect(assumptions.length).toBe(1);
    // the confirmed/assumed distinction IS the confidence contract
    for (const m of confirmed) expect(m.confidence).toBe(0.95);
    for (const m of assumptions) expect(m.confidence).toBe(0.5);
    for (const m of confirmed) expect(m.provenance.source).toBe("user");
    for (const m of assumptions) expect(m.provenance.source).toBe("agent");
    // memoriesStored is persisted on the reply row
    const reply = svc.history(r.value.session.id)?.find((m) => m.role === "assistant");
    expect(reply?.meta.memoriesStored).toBe(3);
  });

  test("ordinary chatter never triggers the extraction call", async () => {
    let extractionCalls = 0;
    class CountingAdapter extends ScriptedAdapter {
      override async complete(req: CompletionRequest, model: string) {
        if (req.jsonSchema) extractionCalls++;
        return super.complete(req, model);
      }
    }
    const fabric = new ModelFabric({ providers: { cloudflare: new CountingAdapter() } });
    const memory = MemoryService.withDb(db, undefined as never);
    const svc = new ConversationService({ db, fabric, memory });

    await svc.converse({ message: "What is the weather in NEXUS WORLD today?" });
    expect(extractionCalls).toBe(0);
  });

  test("no reachable provider → honest DEGRADED reply, never a fabricated persona", async () => {
    const fabric = new ModelFabric({ providers: {} }); // nothing reachable
    const memory = MemoryService.withDb(db, undefined as never);
    const svc = new ConversationService({ db, fabric, memory });

    const r = await svc.converse({ message: "Hello?" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.reply.meta.degraded).toBe(true);
    expect(r.value.reply.content).toContain("cannot reach");
    expect(r.value.reply.content).not.toContain("[echo");
  });

  test("STANDBY/SLEEPING sessions wake on address, with wokeFrom recorded", async () => {
    const fabric = new ModelFabric({ providers: { cloudflare: new ScriptedAdapter() } });
    const memory = MemoryService.withDb(db, undefined as never);
    const svc = new ConversationService({ db, fabric, memory });

    const first = await svc.converse({ message: "Hello" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const sid = first.value.session.id;

    const sleep = svc.setSessionState(sid, "SLEEPING");
    expect(sleep.ok && sleep.value.state).toBe("SLEEPING");

    const wake = await svc.converse({ sessionId: sid, message: "Wake up, JARVIS" });
    expect(wake.ok).toBe(true);
    if (!wake.ok) return;
    expect(wake.value.wokeFrom).toBe("SLEEPING");
    expect(wake.value.reply.meta.wokeFrom).toBe("SLEEPING");
    expect(wake.value.session.state).toBe("ACTIVE");
  });

  test("unknown session id is NOT_FOUND, empty message is VALIDATION_ERROR", async () => {
    const fabric = new ModelFabric({ providers: {} });
    const memory = MemoryService.withDb(db, undefined as never);
    const svc = new ConversationService({ db, fabric, memory });

    const bad = await svc.converse({ sessionId: "nexus_conv_missing", message: "hi" });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("NOT_FOUND");

    const empty = await svc.converse({ message: "   " });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.error.code).toBe("VALIDATION_ERROR");
  });

  test("dialogue persists across service restarts (cross-session memory of the conversation itself)", async () => {
    const dbPath = `${TMP}/nexus.db`;
    const fabric = new ModelFabric({ providers: { cloudflare: new ScriptedAdapter() } });
    {
      const memory = MemoryService.withDb(db, undefined as never);
      const svc = new ConversationService({ db, fabric, memory });
      const r = await svc.converse({ message: "Remember this conversation" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // keep the session id for the "next app run"
      const id = r.value.session.id;
      (globalThis as Record<string, unknown>).__convSessionId = id;
      db.close();
    }
    {
      // fresh process simulation: new connection, new service instances
      const db2 = NexusDb.open(dbPath);
      migrate(db2); // idempotent — no double-apply
      const memory2 = MemoryService.withDb(db2, undefined as never);
      const svc2 = new ConversationService({ db: db2, fabric, memory: memory2 });
      const id = (globalThis as Record<string, unknown>).__convSessionId as string;
      const history = svc2.history(id);
      expect(history?.length).toBe(2);
      expect(history?.[0]?.content).toContain("Remember this conversation");
      const sessions = svc2.sessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0]?.messages).toBe(2);
      db2.close();
    }
  });

  test("status snapshot is injected into the system prompt", async () => {
    let seenSystem = "";
    class SpyAdapter extends ScriptedAdapter {
      override async complete(req: CompletionRequest, model: string) {
        if (!req.jsonSchema) seenSystem = req.systemPrompt ?? "";
        return super.complete(req, model);
      }
    }
    const fabric = new ModelFabric({ providers: { cloudflare: new SpyAdapter() } });
    const memory = MemoryService.withDb(db, undefined as never);
    const svc = new ConversationService({
      db, fabric, memory,
      statusProvider: () => ({
        provider: "cloudflare (verified)",
        memoryRecords: 42,
        worldSummary: "NEXUS Prime — morning, clear; 24 residents active",
        backupProtection: "RESTORE_VERIFIED",
      }),
    });
    await svc.converse({ message: "Status report" });
    expect(seenSystem).toContain("You are JARVIS");
    expect(seenSystem).toContain("cloudflare (verified)");
    expect(seenSystem).toContain("RESTORE_VERIFIED");
    expect(seenSystem).toContain("NEXUS Prime");
    // spoken-word contract
    expect(seenSystem).toContain("SPOKEN ALOUD");
  });
});
