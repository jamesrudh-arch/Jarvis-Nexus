/**
 * NEXUS WORLD seed — creates the world, population and initial history.
 * Run: bunx tsx scripts/seed-world.ts [--ticks N]
 */
import { PrismaClient } from "@prisma/client";
import { join } from "path";

const db = new PrismaClient({
  datasources: { db: { url: `file:${join(process.cwd(), "db", "custom.db")}` } },
});

async function main() {
  const args = process.argv.slice(2);
  const ticksIdx = args.indexOf("--ticks");
  const ticks = ticksIdx >= 0 ? parseInt(args[ticksIdx + 1], 10) : 432; // 3 sim days
  const forceIdx = args.indexOf("--fresh");

  if (forceIdx >= 0) {
    await db.worldEvent.deleteMany();
    await db.worldMeta.deleteMany();
    await db.geoNode.deleteMany();
    await db.entity.deleteMany();
    await db.memory.deleteMany();
    await db.region.deleteMany();
    await db.idCounter.deleteMany();
  }

  const { ensureWorld, genesisWorld, DEFAULT_GENESIS, acquireRegions } = await import(
    "../src/lib/nexus/bootstrap"
  );
  const { runTicks, ResidentEngine } = await import("../src/lib/nexus/engine");

  const t0 = Date.now();
  const fresh = !(await db.worldMeta.findUnique({ where: { key: "world_id" } }));
  if (fresh) {
    const { store } = await (async () => {
      const { EventStore } = await import("../src/lib/nexus/store");
      return { store: new EventStore(db) };
    })();
    const geo = await genesisWorld(db, store, DEFAULT_GENESIS);
    console.log(`world created: ${JSON.stringify(geo.counts)}`);
    await acquireRegions(db, store, "sim-engine-0");
  }

  const { store, layout, engine } = await ensureWorld(db);
  const popExists = (await db.entity.count({ where: { entityType: "resident" } })) > 0;
  if (!popExists) {
    const pop = await engine.createPopulation(24, await store.currentTick);
    console.log(`population created: ${pop.created} residents`);
  }

  const result = await runTicks(db, store, engine, ticks);
  const events = await store.eventCount();
  const residents = await engine.residents();
  const mems = await db.memory.count();
  const comms = await db.worldEvent.count({ where: { type: "resident.communication" } });
  console.log(`advanced to tick ${result.tick} (${result.advanced} newly applied)`);
  console.log(`sim time: ${result.sim_time_utc}`);
  console.log(`events: ${events}  memories: ${mems}  communications: ${comms}`);
  console.log(`residents: ${residents.length}  sample: ${residents
    .slice(0, 3)
    .map((r) => `${r.name}[${r.action}]`)
    .join(" ")}`);
  const audit = engine.autonomyLedger.summary();
  console.log(`autonomy: ${JSON.stringify(audit.sources ?? {})} divergence=${JSON.stringify(audit.divergence_from_script ?? {})}`);
  console.log(`seed wall-time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
