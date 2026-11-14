/**
 * Shared read-model projections for the NEXUS APIs + UI.
 */
import type { PrismaClient } from "@prisma/client";
import { EventStore } from "./store";
import { CityLayout, type GeoNodeRow } from "./layout";
import { WorldClock } from "./clock";
import { ResidentEngine, type ResidentState, type Action } from "./engine";
import { LongTermMemory } from "./memory";
import { activeGoal, goalProgress, mood, type Goal } from "./autonomy";
import { findJarvis } from "./jarvis";
import { getIdentity } from "./identity";
import type { Business } from "./economy";

export async function getWorldContext(db: PrismaClient) {
  const store = new EventStore(db);
  const seed = parseInt((await store.meta("seed")) || "20261113", 10);
  const nodes = (await store.geoNodes()) as unknown as GeoNodeRow[];
  const layout = new CityLayout(seed, nodes);
  const engine = await new ResidentEngine(store, layout, seed, db).init();
  const epoch = (await store.meta("epoch_utc")) || "2026-01-01T00:00:00";
  const mpt = parseInt((await store.meta("minutes_per_tick")) || "10", 10);
  const clock = new WorldClock(epoch, mpt);
  const tick = await store.currentTick;
  let tz = 0;
  const countries = await store.geoNodes("country");
  if (countries.length) {
    const m = (countries[0].meta ?? {}) as Record<string, unknown>;
    tz = typeof m.tz_offset_hours === "number" ? m.tz_offset_hours : 0;
  }
  return { db, store, layout, engine, clock, tick, seed, tz };
}

export async function worldSummary(db: PrismaClient) {
  const { store, layout, clock, tick, tz } = await getWorldContext(db);
  const [weather, worldName, worldId, eventCount, memCount, commCount, geoCounts, regions] =
    await Promise.all([
      store.meta("weather", "clear"),
      store.meta("world_name", "NEXUS Prime"),
      store.meta("world_id", "nexus-prime"),
      store.eventCount(),
      db.memory.count(),
      db.worldEvent.count({ where: { type: "resident.communication" } }),
      store.geoCounts(),
      db.region.count(),
    ]);
  const residents = (await store.entitiesOfType("resident")).map((e) => ({
    resident_id: e.entity_id,
    ...(e.data as object),
  })) as ResidentState[];
  const actionDist: Record<string, number> = {};
  for (const r of residents) actionDist[r.action] = (actionDist[r.action] ?? 0) + 1;
  const recentEvents = (await store.events(Math.max(0, eventCount - 30), 30)).map((e) => ({
    seq: e.seq,
    tick: e.tick,
    type: e.type,
    topic: (e.payload as Record<string, unknown>).topic,
    weather: (e.payload as Record<string, unknown>).weather,
    resident_id: (e.payload as Record<string, unknown>).resident_id,
  }));
  const buildings = layout.buildings();

  // ---- economy section (from business entities + economy events)
  const businesses = (await store.entitiesOfType("business")).map(
    (e) => e.data as unknown as Business
  );
  const txEvents = await store.eventsOfType("economy.transaction_completed");
  const recentTx = txEvents.slice(-8).reverse().map((e) => {
    const p = e.payload as Record<string, unknown>;
    return {
      tick: e.tick,
      purpose: p.purpose,
      buyer: p.buyer,
      product: p.product_name,
      total: p.total,
    };
  });
  const skipped = await store.eventsOfType("economy.purchase_skipped");
  const salaries = await store.eventsOfType("economy.salary_paid");
  const missed = await store.eventsOfType("economy.salary_missed");
  const walletsTotal = residents.reduce((s, r) => s + (r.wallet ?? 0), 0);
  const byKind: Record<string, number> = {};
  for (const b of businesses) byKind[b.kind] = (byKind[b.kind] ?? 0) + 1;

  // ---- interiors section
  const rooms = layout.rooms();
  const objects = layout.objects();
  const interiorsBuildings = new Set(rooms.map((r) => r.building_id));

  // ---- JARVIS presence section
  const jarvis = await findJarvis(store);
  const identity = await getIdentity(store);
  const jarvisSection = jarvis
    ? {
        resident_id: jarvis.resident_id,
        identity_version: identity?.version ?? null,
        action: jarvis.action,
        at_building: layout.buildingName(jarvis.at_building),
        room: jarvis.room_id ? (layout.room(jarvis.room_id)?.name ?? null) : null,
        wallet: jarvis.wallet ?? null,
        home: layout.buildingName(jarvis.home_id),
      }
    : null;

  return {
    world_id: worldId,
    world_name: worldName,
    tick,
    clock: clock.describe(tick, tz),
    weather,
    population: residents.length,
    buildings: buildings.length,
    districts: layout.districts.length,
    roads: layout.roads().length,
    bounds: layout.bounds(),
    events: eventCount,
    memories: memCount,
    communications: commCount,
    geo_counts: geoCounts,
    regions,
    action_distribution: actionDist,
    recent_events: recentEvents.reverse(),
    layout_version: "deterministic-v2",
    economy: {
      businesses: businesses.length,
      by_kind: byKind,
      business_cash_total: businesses.reduce((s, b) => s + b.cash, 0),
      revenue_total: businesses.reduce((s, b) => s + b.revenue, 0),
      expenses_total: businesses.reduce((s, b) => s + b.expenses, 0),
      wallets_total: walletsTotal,
      transactions: txEvents.length,
      salaries_paid: salaries.length,
      salaries_missed: missed.length,
      purchases_skipped: skipped.length,
      recent_transactions: recentTx,
    },
    interiors: {
      rooms: rooms.length,
      objects: objects.length,
      buildings_with_interiors: interiorsBuildings.size,
      coverage_note:
        "enterable in v1: JARVIS Sanctum, civic hall #1, all food venues, all shops; residential/workshop buildings are honest shells",
    },
    jarvis: jarvisSection,
  };
}

export interface ResidentCard {
  resident_id: string;
  name: string;
  role: string;
  action: Action;
  pos: [number, number];
  at_building: string;
  at_building_name: string;
  district: string;
  needs: Record<string, number>;
  traits: { extraversion: number; industriousness: number };
  mood: number;
  goal: Goal;
  home_name: string;
  work_name: string;
  is_jarvis?: boolean;
  wallet?: number;
  room_name?: string | null;
}

export async function residentsList(db: PrismaClient): Promise<ResidentCard[]> {
  const { store, layout, clock, tick, tz } = await getWorldContext(db);
  const ltm = new LongTermMemory(store);
  const entities = await store.entitiesOfType("resident");
  const cards: ResidentCard[] = [];
  for (const e of entities) {
    const r = { resident_id: e.entity_id, ...(e.data as object) } as ResidentState;
    const b = layout.building(r.at_building);
    const mems = await ltm.memories(r.resident_id, tick, 3);
    cards.push({
      resident_id: r.resident_id,
      name: r.name,
      role: r.role,
      action: r.action,
      pos: r.pos,
      at_building: r.at_building,
      at_building_name: b?.name ?? r.at_building,
      district: b?.district ?? "",
      needs: r.needs,
      traits: r.traits,
      mood: mood({ needs: r.needs }, mems),
      goal: activeGoal(await store.meta("seed").then((s) => parseInt(s || "20261113", 10)), r.resident_id, tick),
      home_name: layout.buildingName(r.home_id),
      work_name: layout.buildingName(r.work_id),
      is_jarvis: r.is_jarvis ?? undefined,
      wallet: r.wallet,
      room_name: r.room_id ? (layout.room(r.room_id)?.name ?? null) : null,
    });
  }
  void clock;
  void tz;
  return cards;
}

export async function residentDetail(db: PrismaClient, rid: string) {
  const { store, layout, seed, tick } = await getWorldContext(db);
  const e = await store.entity(rid);
  if (!e || e.entity_type !== "resident") return null;
  const r = { resident_id: e.entity_id, ...(e.data as object) } as ResidentState;
  const ltm = new LongTermMemory(store);
  const [mems, rels] = await Promise.all([
    ltm.memories(rid, tick, 8),
    ltm.relationships(tick),
  ]);
  const relations = rels;
  const goal = activeGoal(seed, rid, tick);
  const progress = await goalProgress(goal, rid, store, ltm);
  const comms = await db.worldEvent.findMany({
    where: { type: "resident.communication", OR: [{ payload: { contains: `"from_id":"${rid}"` } }, { payload: { contains: `"to_id":"${rid}"` } }] },
    orderBy: { seq: "desc" },
    take: 8,
  });
  return {
    ...r,
    at_building_name: layout.buildingName(r.at_building),
    home_name: layout.buildingName(r.home_id),
    work_name: layout.buildingName(r.work_id),
    venue_name: layout.buildingName(r.venue_id),
    room_name: r.room_id ? (layout.room(r.room_id)?.name ?? null) : null,
    identity_version: r.is_jarvis ? ((await getIdentity(store))?.version ?? null) : undefined,
    district: layout.building(r.at_building)?.district ?? "",
    mood: mood({ needs: r.needs }, mems),
    goal,
    goal_progress: progress,
    memories: mems,
    relationships: (relations[rid] ?? []).slice(0, 10),
    recent_communications: comms.map((c) => {
      const p = JSON.parse(c.payload);
      return { tick: c.tick, from_id: p.from_id, to_id: p.to_id, topic: p.topic };
    }),
    autobiography: await ltm.autobiography(rid, r as unknown as Record<string, unknown>, tick),
  };
}

export async function layoutPayload(db: PrismaClient) {
  const { layout } = await getWorldContext(db);
  const rooms = layout.rooms();
  const roomsByBuilding = new Map<string, typeof rooms>();
  for (const room of rooms) {
    const list = roomsByBuilding.get(room.building_id) ?? [];
    list.push(room);
    roomsByBuilding.set(room.building_id, list);
  }
  const objects = layout.objects().map((o) => ({
    id: o.id, room_id: o.room_id, building_id: o.building_id,
    name: o.name, kind: o.kind, x: o.x, y: o.y,
  }));
  return {
    bounds: layout.bounds(),
    roads: layout.roads(),
    buildings: layout.buildings().map((b) => ({
      id: b.id, kind: b.kind, name: b.name, district: b.district,
      neighbourhood: b.neighbourhood, x: b.x, y: b.y, w: b.w, d: b.d, h: b.h,
      center: b.center, color: b.color,
      special: b.special ?? null,
      rooms: (roomsByBuilding.get(b.id) ?? []).map((r) => ({
        id: r.id, name: r.name, kind: r.kind, x: r.x, y: r.y, w: r.w, d: r.d, center: r.center,
      })),
    })),
    rooms: rooms.map((r) => ({
      id: r.id, building_id: r.building_id, name: r.name, kind: r.kind,
      x: r.x, y: r.y, w: r.w, d: r.d, center: r.center,
    })),
    objects,
  };
}
