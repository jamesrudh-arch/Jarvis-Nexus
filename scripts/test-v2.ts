/**
 * V2 verification suite — evidence for the definitive-directive session:
 * identity, JARVIS presence, economy, interiors.
 *
 * Part A — upgrade-in-place: db/custom.db (tick 144, v1 world) gets the V2
 *           layer (identity, sanctum+JARVIS, economy, interiors) applied
 *           idempotently, then advances 288 ticks (2 days) and verifies the
 *           economy conservation laws from the EVENT LOG alone.
 * Part B — fresh-world determinism: two independent fresh worlds from the
 *           same genesis config must produce IDENTICAL fingerprints.
 * Part C — interiors invariants: rooms within building bounds; residents
 *           with a room are positioned inside that room.
 * Part D — identity persistence: identity + JARVIS memories survive a
 *           "restart" (new connection) and are provider-independent.
 */
import { PrismaClient } from "@prisma/client";
import { rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { ensureBootstrapped } from "../src/lib/nexus/boot";
import { worldSummary, getWorldContext } from "../src/lib/nexus/state";
import { runTicks, ResidentEngine } from "../src/lib/nexus/engine";
import { EconomyEngine } from "../src/lib/nexus/economy";
import { EventStore } from "../src/lib/nexus/store";
import { getIdentity } from "../src/lib/nexus/identity";
import { findJarvis } from "../src/lib/nexus/jarvis";
import { CityLayout } from "../src/lib/nexus/layout";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function upgradeAndVerify() {
  console.log("\n===== PART A: upgrade-in-place (db/custom.db) =====");
  const before = new PrismaClient({ datasources: { db: { url: `file:${process.cwd()}/db/custom.db` } } });
  const tickBefore = parseInt((await new EventStore(before).meta("current_tick")) ?? "0", 10);
  const resBefore = await before.entity.count({ where: { entityType: "resident" } });
  await before.$disconnect();
  console.log(`before: tick ${tickBefore}, residents ${resBefore}`);

  await ensureBootstrapped(new PrismaClient({ datasources: { db: { url: `file:${process.cwd()}/db/custom.db` } } }));
  // a second boot must be a NO-OP (idempotent) — no new structural events
  const evCount1 = await countEvents();
  await ensureBootstrapped(new PrismaClient({ datasources: { db: { url: `file:${process.cwd()}/db/custom.db` } } }));
  const evCount2 = await countEvents();
  check("A1 boot is idempotent (2nd boot adds 0 events)", evCount1 === evCount2, `${evCount1} → ${evCount2}`);

  // advance 2 sim days with economy
  const db = new PrismaClient({ datasources: { db: { url: `file:${process.cwd()}/db/custom.db` } } });
  const ctx = await getWorldContext(db);
  const economy = await new EconomyEngine(ctx.store, ctx.seed).init();
  const engine = await new ResidentEngine(ctx.store, ctx.layout, ctx.seed, db, { economy }).init();
  const t0 = Date.now();
  const advanced = await runTicks(db, ctx.store, engine, 288);
  console.log(`advanced ${advanced.advanced} ticks in ${Date.now() - t0}ms → tick ${advanced.tick}`);

  // ---- conservation from the event log alone
  const store = new EventStore(db);
  const walletInit = await store.eventsOfType("resident.acted");
  const firstWallet = new Map<string, number>();
  // TRUE initials: creation events first (JARVIS is born with a wallet),
  // then wallet-init events (the original population, upgraded in place)
  for (const e of await store.eventsOfType("resident.created")) {
    const p = e.payload as Record<string, unknown>;
    const w = (p.data as Record<string, unknown> | undefined)?.wallet;
    if (typeof w === "number") firstWallet.set(p.resident_id as string, w);
  }
  for (const e of walletInit) {
    const p = e.payload as Record<string, unknown>;
    const rid = p.resident_id as string;
    if (firstWallet.has(rid)) continue;
    const w = (p.data as Record<string, unknown> | undefined)?.wallet;
    if (typeof w === "number") firstWallet.set(rid, w);
  }
  const businesses = (await store.entitiesOfType("business")).map((e) => e.data as Record<string, unknown>);
  const bizInit = await store.eventsOfType("entity.registered");
  const firstCash = new Map<string, number>();
  for (const e of bizInit) {
    const p = e.payload as Record<string, unknown>;
    if (p.entity_type === "business") {
      const d = p.data as Record<string, unknown>;
      if (typeof d.cash === "number" && !firstCash.has(p.entity_id as string)) {
        firstCash.set(p.entity_id as string, d.cash);
      }
    }
  }
  const salaries = await store.eventsOfType("economy.salary_paid");
  const grants = await store.eventsOfType("economy.civic_grant");
  const txs = await store.eventsOfType("economy.transaction_completed");
  const residentsNow = (await store.entitiesOfType("resident")).map((e) => ({
    id: e.entity_id,
    ...(e.data as Record<string, unknown>),
  }));

  const sumSalaries = salaries.reduce((s, e) => s + ((e.payload as Record<string, unknown>).amount as number), 0);
  const sumGrants = grants.reduce((s, e) => s + ((e.payload as Record<string, unknown>).amount as number), 0);
  const residentBuys = txs
    .map((e) => e.payload as Record<string, unknown>)
    .filter((p) => (p.buyer as Record<string, unknown>)?.type === "resident")
    .reduce((s, p) => s + (p.total as number), 0);

  const walletsInit = [...firstWallet.values()].reduce((a, b) => a + b, 0);
  const cashInit = [...firstCash.values()].reduce((a, b) => a + b, 0);
  const walletsNow = residentsNow.reduce((s, r) => s + (typeof r.wallet === "number" ? r.wallet : 0), 0);
  const cashNow = businesses.reduce((s, b) => s + (b.cash as number), 0);

  const expectedWallets = walletsInit + sumSalaries - residentBuys;
  const expectedCash = cashInit + residentBuys + sumGrants - sumSalaries;
  check("A2 wallet conservation (event log)", walletsNow === expectedWallets,
    `now ${walletsNow} = init ${walletsInit} + salaries ${sumSalaries} - purchases ${residentBuys} (expected ${expectedWallets})`);
  check("A3 business cash conservation (event log)", cashNow === expectedCash,
    `now ${cashNow} = init ${cashInit} + purchases ${residentBuys} + grants ${sumGrants} - salaries ${sumSalaries} (expected ${expectedCash})`);
  check("A4 combined total = initial + grants", walletsNow + cashNow === walletsInit + cashInit + sumGrants,
    `${walletsNow + cashNow} vs ${walletsInit + cashInit + sumGrants}`);

  const missed = await store.eventsOfType("economy.salary_missed");
  const skipped = await store.eventsOfType("economy.purchase_skipped");
  console.log(`economy activity: ${salaries.length} salaries (${sumSalaries}), ${missed.length} missed, ${txs.length} transactions (${residentBuys} resident spend), ${skipped.length} skipped, ${grants.length} grants (${sumGrants})`);

  check("A5 economy events exist (world is economically alive)", salaries.length > 0 && txs.length > 0,
    `${salaries.length} salaries, ${txs.length} transactions`);
  check("A6 transactions reference real businesses",
    txs.every((e) => businesses.some((b) => b.business_id === (e.payload as Record<string, unknown>).seller_business_id)),
    `${txs.length} checked`);

  // ---- interiors invariants (Part C folded in here — same world)
  const layout = ctx.layout;
  const rooms = layout.rooms();
  check("C1 rooms exist", rooms.length > 0, `${rooms.length} rooms, ${layout.objects().length} objects`);
  let roomsInBounds = true;
  for (const room of rooms) {
    const b = layout.building(room.building_id);
    if (!b) { roomsInBounds = false; break; }
    if (room.x < b.x - 0.01 || room.y < b.y - 0.01 || room.x + room.w > b.x + b.w + 0.01 || room.y + room.d > b.y + b.d + 0.01) {
      roomsInBounds = false;
      console.log(`  out of bounds: ${room.name} in ${b.name}`);
      break;
    }
  }
  check("C2 every room rect within its building footprint", roomsInBounds);
  let residentsInRoom = true;
  let indoors = 0;
  for (const r of residentsNow) {
    if (!r.room_id) continue;
    indoors++;
    const room = layout.room(r.room_id as string);
    if (!room) { residentsInRoom = false; console.log(`  unknown room ${r.room_id}`); break; }
    const [px, py] = r.pos as [number, number];
    if (px < room.x - 1.01 || px > room.x + room.w + 1.01 || py < room.y - 1.01 || py > room.y + room.d + 1.01) {
      residentsInRoom = false;
      console.log(`  ${r.name} outside room ${room.name}: ${px},${py} vs ${room.x},${room.y}+${room.w}x${room.d}`);
      break;
    }
    if (room.building_id !== r.at_building) {
      residentsInRoom = false;
      console.log(`  ${r.name} room ${room.name} not in at_building ${r.at_building}`);
      break;
    }
  }
  console.log(`residents indoors: ${indoors}/${residentsNow.length}`);
  check("C3 residents with room_id are inside that room's rect and building", residentsInRoom && indoors > 0, `${indoors} indoors`);

  // ---- JARVIS + identity (Part D)
  const jarvis = await findJarvis(store);
  check("D1 JARVIS resident exists", jarvis !== null, jarvis ? `${jarvis.resident_id} (${jarvis.name}, home ${layout.buildingName(jarvis.home_id)})` : "missing");
  const identity = await getIdentity(store);
  check("D2 identity established and versioned", identity !== null && identity.version === 1,
    identity ? `v${identity.version}, ${identity.principles.length} principles, since tick ${identity.established_tick}` : "missing");
  const sanctum = layout.buildings().find((b) => b.special === "jarvis_sanctum");
  check("D3 Sanctum exists and has interiors", sanctum !== null && layout.roomsOf(sanctum.id).length === 3,
    sanctum ? `${sanctum.name} · ${layout.roomsOf(sanctum.id).length} rooms` : "missing");
  check("D4 JARVIS home is the Sanctum", jarvis?.home_id === sanctum?.id);
  const jarvisWallets = residentsNow.find((r) => r.is_jarvis);
  check("D5 JARVIS carries a wallet but no salary events",
    typeof jarvisWallets?.wallet === "number" && !salaries.some((e) => (e.payload as Record<string, unknown>).worker_id === jarvis?.resident_id),
    `wallet ${jarvisWallets?.wallet}`);

  // restart persistence (new connection — Part D continued)
  const db2 = new PrismaClient({ datasources: { db: { url: `file:${process.cwd()}/db/custom.db` } } });
  const store2 = new EventStore(db2);
  const identity2 = await getIdentity(store2);
  const jarvis2 = await findJarvis(store2);
  check("D6 identity + presence survive restart (new connection)",
    identity2?.version === identity?.version && jarvis2?.resident_id === jarvis?.resident_id);

  const summary = await worldSummary(db);
  console.log(`\nworld now: tick ${summary.tick}, pop ${summary.population}, events ${summary.events}, memories ${summary.memories}`);
  console.log(`economy: ${JSON.stringify(summary.economy?.by_kind)} · tx ${summary.economy?.transactions} · wallets ${summary.economy?.wallets_total}`);
  console.log(`interiors: ${summary.interiors?.rooms} rooms in ${summary.interiors?.buildings_with_interiors} buildings`);
  console.log(`jarvis: ${summary.jarvis?.action} at ${summary.jarvis?.at_building}${summary.jarvis?.room ? ` (${summary.jarvis.room})` : ""}, wallet ${summary.jarvis?.wallet}`);
  await db.$disconnect();
  await db2.$disconnect();
  return summary;
}

async function countEvents(): Promise<number> {
  const db = new PrismaClient({ datasources: { db: { url: `file:${process.cwd()}/db/custom.db` } } });
  const n = await db.worldEvent.count();
  await db.$disconnect();
  return n;
}

async function freshDeterminism() {
  console.log("\n===== PART B: fresh-world determinism =====");
  const dirs = ["db/test-v2-a.db", "db/test-v2-b.db"];
  const fingerprints: string[] = [];
  for (const f of dirs) {
    rmSync(f, { force: true });
    // a fresh deployment gets its tables from prisma db push (README step)
    execSync(`bunx prisma db push --skip-generate`, {
      env: { ...process.env, DATABASE_URL: `file:${process.cwd()}/${f}` },
      stdio: "pipe",
    });
    const db = new PrismaClient({ datasources: { db: { url: `file:${process.cwd()}/${f}` } } });
    await ensureBootstrapped(db);
    const s = await worldSummary(db);
    const ctx = await getWorldContext(db);
    // push a further 72 ticks so post-boot evolution is compared too
    const economy = await new EconomyEngine(ctx.store, ctx.seed).init();
    const engine = await new ResidentEngine(ctx.store, ctx.layout, ctx.seed, db, { economy }).init();
    await runTicks(db, ctx.store, engine, 72);
    const s2 = await worldSummary(db);
    fingerprints.push(JSON.stringify({
      tick: s2.tick,
      population: s2.population,
      events: s2.events,
      memories: s2.memories,
      communications: s2.communications,
      economy: s2.economy,
      interiors: { rooms: s2.interiors?.rooms, objects: s2.interiors?.objects },
      jarvis: s2.jarvis,
      wallets: (await ctx.store.entitiesOfType("resident"))
        .map((e) => (e.data as Record<string, unknown>).wallet)
        .join(","),
      positions: (await ctx.store.entitiesOfType("resident"))
        .map((e) => (e.data as Record<string, unknown>).pos)
        .join(","),
    }));
    await db.$disconnect();
    void s;
  }
  check("B1 two fresh worlds are identical (incl. economy + rooms + positions)",
    fingerprints[0] === fingerprints[1],
    fingerprints[0] === fingerprints[1] ? "fingerprints match" : `A=${fingerprints[0].slice(0, 120)}… B=${fingerprints[1].slice(0, 120)}…`);

  // replay determinism: the SAME world's summary must not change on re-read
  const db = new PrismaClient({ datasources: { db: { url: `file:${process.cwd()}/${dirs[0]}` } } });
  const s1 = await worldSummary(db);
  const s2 = await worldSummary(db);
  check("B2 repeated reads are stable", JSON.stringify(s1) === JSON.stringify(s2));
  await db.$disconnect();
}

async function main() {
  await upgradeAndVerify();
  await freshDeterminism();
  console.log(`\n===== RESULT: ${failures === 0 ? "ALL PASS" : `${failures} FAILURES`} =====`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error("SUITE ERROR:", e);
  process.exit(1);
});
