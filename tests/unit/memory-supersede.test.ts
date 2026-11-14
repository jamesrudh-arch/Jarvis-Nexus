import { describe, expect, test, beforeEach } from "bun:test";
import { NexusDb, migrate, createRepos } from "@nexus/db";
import { MemoryService } from "@nexus/memory";

/**
 * Memory supersession regression (2026-11-14 audit): supersede(id) without a
 * replacement previously returned true while binding NULL — a false-success
 * no-op that left the record retrievable.
 */
let db: NexusDb;
beforeEach(() => {
  db = NexusDb.open(":memory:");
  migrate(db);
});

describe("memory supersession (directive §5.4)", () => {
  test("supersede without replacement tombstones the record (no-op bug regression)", () => {
    const mem = MemoryService.withDb(db, createRepos(db));
    const rec = mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "Stale claim", content: "The moon is made of cheese", importance: 0.5 });

    const result = mem.supersede(rec.id);
    expect(result).toBe(true); // and this time it is TRUE because it actually tombstoned

    // hidden from retrieval
    const results = mem.retrieve({ scope: "jarvis", textQuery: "moon", limit: 10 });
    expect(results.some((m) => m.id === rec.id)).toBe(false);

    // still inspectable via backendGet, marked with the self-tombstone
    const stored = mem.backendGet(rec.id);
    expect(stored?.supersededById).toBe(rec.id);
  });

  test("supersede with a nonexistent replacement is rejected", () => {
    const mem = MemoryService.withDb(db, createRepos(db));
    const rec = mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "Keep", content: "still current", importance: 0.5 });

    const result = mem.supersede(rec.id, "nexus_mem_00000000-0000-0000-0000-000000000000");
    expect(result).toBe(false);

    // unchanged: still retrievable, no tombstone
    const results = mem.retrieve({ scope: "jarvis", textQuery: "current", limit: 10 });
    expect(results.some((m) => m.id === rec.id)).toBe(true);
    expect(mem.backendGet(rec.id)?.supersededById).toBeUndefined();
  });
});
