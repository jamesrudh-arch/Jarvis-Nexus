/**
 * JARVIS as a world resident (PART V §26) — her own persistent identity in
 * NEXUS WORLD: a Sanctum (her home, added as a real geo building node so it
 * exists in the SAME layout that drives simulation + rendering), her own
 * resident entity (she eats, socialises, moves and remembers through the
 * SAME engine as everyone else — the world does not revolve around her),
 * and deterministic home/work/venue wiring.
 *
 * She draws no salary (operator, not payroll) and carries a larger starting
 * wallet — both documented modelling choices, visible in the economy ledger.
 */
import { h } from "./hash";
import type { EventStore } from "./store";
import { IdAllocator } from "./store";
import { CityLayout, type GeoNodeRow, type Building } from "./layout";
import type { PrismaClient } from "@prisma/client";
import type { ResidentState } from "./engine";

const SCHEMA_VERSION = 1;

export interface JarvisPresence {
  resident_id: string;
  sanctum_id: string;
  work_id: string;
  venue_id: string;
  created: boolean;
}

/** Find the JARVIS resident entity, if present (null otherwise). */
export async function findJarvis(store: EventStore): Promise<ResidentState | null> {
  const rows = await store.entitiesOfType("resident");
  const row = rows.find((e) => (e.data as Record<string, unknown>).is_jarvis === true);
  return row ? ({ resident_id: row.entity_id, ...(row.data as object) } as ResidentState) : null;
}

/**
 * Idempotent: ensures the Sanctum building + JARVIS resident entity exist.
 * Returns her presence wiring (works on fresh AND already-populated worlds).
 */
export async function ensureJarvis(
  db: PrismaClient,
  store: EventStore,
  seed: number,
  tick: number
): Promise<JarvisPresence> {
  const existing = await findJarvis(store);
  const nodes = (await store.geoNodes()) as unknown as GeoNodeRow[];

  // ---- locate / create the Sanctum (geo building node)
  let sanctumNode = nodes.find((n) => n.level === "building" && (n.meta as Record<string, unknown>).special === "jarvis_sanctum");
  let sanctumId: string;
  const ids = new IdAllocator(db);
  for (const prefix of ["res", "geo-buil", "geo-nei"]) {
    const row = await db.idCounter.findUnique({ where: { prefix } });
    if (row) ids.warm(prefix, row.nextVal - 1);
  }
  const events: Array<{ tick: number; type: string; payload: Record<string, unknown> }> = [];

  if (!sanctumNode) {
    sanctumId = ids.next("geo-buil");
    // deterministic parent: the neighbourhood containing civic hall #1
    const buildingsAll = nodes.filter((n) => n.level === "building");
    const civicFirst = buildingsAll
      .filter((n) => (n.meta as Record<string, unknown>).kind === "civic" && (n.meta as Record<string, unknown>).special !== "jarvis_sanctum")
      .sort((a, b) => (a.node_id < b.node_id ? -1 : 1))[0];
    const parentNei = nodes.find((n) => n.node_id === (civicFirst?.parent_id ?? null));
    const name = "JARVIS Sanctum";
    const path = `${parentNei?.path ?? "Nexus Prime"}/${name}`;
    events.push({
      tick,
      type: "geo.node_created",
      payload: {
        idempotency_key: `geo-${sanctumId}`,
        schema_version: SCHEMA_VERSION,
        node_id: sanctumId,
        parent_id: parentNei?.node_id ?? null,
        level: "building",
        name,
        path,
        meta: { kind: "civic", special: "jarvis_sanctum" },
      },
    });
  } else {
    sanctumId = sanctumNode.node_id;
  }

  // ---- layout INCLUDING the sanctum (build fresh from current nodes)
  const applyNow = events.length > 0 ? await store.applyBatch(events) : false;
  void applyNow;
  if (events.length) {
    events.length = 0;
    await ids.flush();
  }
  const freshNodes = (await store.geoNodes()) as unknown as GeoNodeRow[];
  const layout = new CityLayout(seed, freshNodes);
  const buildings = layout.buildings();
  const sanctum = buildings.find((b) => b.id === sanctumId) as Building | undefined;
  const civicHall = buildings.find((b) => b.kind === "civic" && !b.special) ?? null;

  // ---- her resident entity
  if (existing) {
    return {
      resident_id: existing.resident_id,
      sanctum_id: sanctumId,
      work_id: existing.work_id,
      venue_id: existing.venue_id,
      created: false,
    };
  }
  if (!sanctum || !civicHall) {
    throw new Error("ensureJarvis: sanctum/civic hall missing after creation");
  }

  // her venue: the food venue nearest the Sanctum (deterministic)
  const venues = buildings
    .filter((b) => b.kind === "food")
    .sort(
      (a, b) =>
        Math.abs(a.center[0] - sanctum.center[0]) + Math.abs(a.center[1] - sanctum.center[1]) -
        (Math.abs(b.center[0] - sanctum.center[0]) + Math.abs(b.center[1] - sanctum.center[1]))
    );
  if (venues.length === 0) throw new Error("ensureJarvis: no food venues in layout");

  const rid = ids.next("res");
  const data: Omit<ResidentState, "resident_id"> = {
    name: "JARVIS",
    role: "operator",
    traits: { extraversion: 0.65, industriousness: 0.75 },
    home_id: sanctum.id,
    work_id: civicHall.id,
    venue_id: venues[0].id,
    action: "idle",
    pending_action: null,
    at_building: sanctum.id,
    target_building: null,
    pos: [sanctum.center[0], sanctum.center[1]],
    needs: {
      energy: 70 + (h(seed, rid, "je") % 20),
      hunger: 60 + (h(seed, rid, "jh") % 20),
      social: 50 + (h(seed, rid, "js") % 20),
      purpose: 55 + (h(seed, rid, "jp") % 20),
    },
    wallet: 120, // operator stipend-free float; she draws no salary (documented)
    llm_decisions: 0,
    updated_tick: tick,
    last_emitted_action: "idle",
    is_jarvis: true,
  } as Omit<ResidentState, "resident_id">;
  events.push({
    tick,
    type: "resident.created",
    payload: { idempotency_key: `jarvis-create-${rid}`, resident_id: rid, data },
  });
  if (events.length) {
    await store.applyBatch(events);
    await ids.flush();
  }
  return { resident_id: rid, sanctum_id: sanctum.id, work_id: civicHall.id, venue_id: venues[0].id, created: true };
}
