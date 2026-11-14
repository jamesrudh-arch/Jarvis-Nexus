import { describe, expect, test } from "bun:test";
import { NexusDb, migrate } from "@nexus/db";
import { MemoryService } from "@nexus/memory";
import { NaeiEngine } from "@nexus/naei";
import { WorldRuntime, createWorld } from "@nexus/world";
import { EchoAdapter, ModelFabric } from "@nexus/model-fabric";
import { mkdirSync, rmSync } from "node:fs";

/**
 * Persistence layer (directive §11, §21): every subsystem must survive a full
 * process restart (db close → reopen). Scenario D covers world state; this
 * suite covers memory, NAEI registries and the event store's idempotency.
 */
const TMP = `/tmp/nexus_persist_${Date.now()}`;
mkdirSync(TMP, { recursive: true });
const dbPath = `${TMP}/persist.db`;

test("memory, NAEI registry and world survive restart; event replay is idempotent", () => {
  // phase 1: write state
  {
    const db = NexusDb.open(dbPath);
    migrate(db);
    const mem = MemoryService.withDb(db, undefined as never);
    mem.create({ scope: "jarvis", tier: "semantic", kind: "fact", title: "Persisted fact", content: "survives restarts", importance: 0.9, source: "user" });

    const naei = new NaeiEngine({ db, fabric: new ModelFabric({ providers: { echo: new EchoAdapter() } }), workspaceRoot: `${TMP}/ws` });
    naei.agents.seedDefaultRoster();

    const world = createWorld({ name: "Persist World" });
    const rt = new WorldRuntime(db);
    rt.store.saveWorld(world);
    rt.creation.construct(world, "Construct a residential neighbourhood");
    db.close();
  }

  // phase 2: reopen and verify everything
  {
    const db = NexusDb.open(dbPath);
    migrate(db);

    const mem = MemoryService.withDb(db, undefined as never);
    const recalled = mem.retrieve({ scope: "jarvis", textQuery: "persisted fact survives", limit: 1 });
    expect(recalled.length).toBe(1);
    expect(recalled[0]!.title).toBe("Persisted fact");

    const naei = new NaeiEngine({ db, fabric: new ModelFabric({ providers: { echo: new EchoAdapter() } }), workspaceRoot: `${TMP}/ws` });
    expect(naei.agents.list().length).toBe(10); // default roster persisted

    const rt = new WorldRuntime(db);
    const worlds = rt.store.listWorlds();
    expect(worlds.length).toBe(1);
    const world = worlds[0]!;
    expect(rt.store.listResidents(world.id).length).toBeGreaterThan(0);
    expect(rt.store.listProperties(world.id).length).toBeGreaterThan(0);

    // event store: append existing event id again → duplicate detected, no double-write
    const events = rt.store.events(world.id);
    const countBefore = db.count("SELECT COUNT(*) AS n FROM world_events WHERE world_id = ?", world.id);
    const evt = events[0]!;
    const { EventStoreRepo } = require("@nexus/db") as typeof import("@nexus/db");
    const result = new EventStoreRepo(db).appendIdempotent({ id: evt.id, worldId: evt.worldId, type: evt.type, simTime: evt.simTime, doc: evt });
    expect(result.duplicate).toBe(true);
    const countAfter = db.count("SELECT COUNT(*) AS n FROM world_events WHERE world_id = ?", world.id);
    expect(countAfter).toBe(countBefore);

    db.close();
  }

  rmSync(TMP, { recursive: true, force: true });
});
