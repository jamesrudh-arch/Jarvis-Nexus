/**
 * First-boot bootstrap: a fresh deployment (empty database) self-
 * initializes — world genesis, population, JARVIS presence (sanctum +
 * resident), economy (businesses + wallets), interiors (rooms + objects),
 * one simulated day of history, and the engineering ledger. Idempotent:
 * every step is an event with a deterministic idempotency key, so
 * concurrent boots, restarts and upgrades can never double-apply.
 */
import type { PrismaClient } from "@prisma/client";
import { EventStore } from "./store";
import { genesisWorld, DEFAULT_GENESIS, acquireRegions } from "./bootstrap";
import { CityLayout, type GeoNodeRow } from "./layout";
import { ResidentEngine, runTicks } from "./engine";
import { EconomyEngine } from "./economy";
import { seedLedger } from "./ledger-seed";
import { ensureIdentity } from "./identity";
import { ensureJarvis } from "./jarvis";
import { ensureEconomy } from "./economy";
import { ensureInteriors } from "./interiors";

let bootPromise: Promise<void> | null = null;

async function doBootstrap(db: PrismaClient) {
  const store = new EventStore(db);
  if (!(await store.meta("world_id"))) {
    await genesisWorld(db, store, DEFAULT_GENESIS);
    await acquireRegions(db, store, "sim-engine-0");
  }
  const seed = parseInt((await store.meta("seed")) || "20261113", 10);
  const tick = await store.currentTick;

  // population (v1 base, unchanged)
  if ((await db.entity.count({ where: { entityType: "resident" } })) === 0) {
    const nodes = (await store.geoNodes()) as unknown as GeoNodeRow[];
    const layout = new CityLayout(seed, nodes);
    const engine = await new ResidentEngine(store, layout, seed, db).init();
    await engine.createPopulation(24, tick);
  }

  // ---- V2 layer (this session): identity, JARVIS, economy, interiors.
  // All idempotent by deterministic event keys — safe on every boot and on
  // upgrading an existing v1 world.
  await ensureIdentity(store, tick);
  await ensureJarvis(db, store, seed, tick);
  await ensureEconomy(db, store, seed, tick);
  await ensureInteriors(db, store, seed, tick);

  // simulated history to tick 144 (one full day) with economy enabled
  const nowTick = await store.currentTick;
  if (nowTick < 144) {
    const nodes = (await store.geoNodes()) as unknown as GeoNodeRow[];
    const layout = new CityLayout(seed, nodes);
    const economy = await new EconomyEngine(store, seed).init();
    const engine = await new ResidentEngine(store, layout, seed, db, { economy }).init();
    await runTicks(db, store, engine, 144 - nowTick);
  }
  if ((await db.taskLedger.count()) === 0) {
    await seedLedger(db);
  }
}

/** Runs once per process; concurrent callers await the same promise. */
export function ensureBootstrapped(db: PrismaClient): Promise<void> {
  if (!bootPromise) {
    bootPromise = doBootstrap(db).catch((e) => {
      bootPromise = null; // allow retry after a failed boot
      throw e;
    });
  }
  return bootPromise;
}
