/**
 * Building interiors (PART V §18) — real internal structures as geo nodes:
 * FLOOR/ROOM/OBJECT granularity for a scoped set of buildings.
 *
 * v1 scope (honest — remaining buildings are labelled "shell" in the UI,
 * never presented as enterable):
 *  - JARVIS Sanctum: Atrium, Studio, Observatory
 *  - Civic hall #1 (the institution building): Hall, Office, Archive
 *  - Every food venue: Dining, Kitchen
 *  - Every shop: Floor, Storage
 *
 * Rooms are geo nodes of level "room" placed as fractions of the parent
 * building footprint (meta rx/ry/rw/rd); objects are level "object" placed
 * as fractions of the parent room (meta ox/oy). CityLayout derives world
 * coordinates — the SAME source of truth drives simulation and renderer.
 */
import { unit } from "./hash";
import type { EventStore } from "./store";
import { IdAllocator } from "./store";
import { CityLayout, type GeoNodeRow } from "./layout";
import type { PrismaClient } from "@prisma/client";

const SCHEMA_VERSION = 1;

type RoomSpec = { name: string; kind: string; rx: number; ry: number; rw: number; rd: number };

const ROOM_SETS: Record<string, RoomSpec[]> = {
  sanctum: [
    { name: "Atrium", kind: "atrium", rx: 0, ry: 0, rw: 0.55, rd: 1 },
    { name: "Studio", kind: "studio", rx: 0.55, ry: 0, rw: 0.45, rd: 0.55 },
    { name: "Observatory", kind: "observatory", rx: 0.55, ry: 0.55, rw: 0.45, rd: 0.45 },
  ],
  civic: [
    { name: "Hall", kind: "hall", rx: 0, ry: 0, rw: 0.6, rd: 1 },
    { name: "Office", kind: "office", rx: 0.6, ry: 0, rw: 0.4, rd: 0.55 },
    { name: "Archive", kind: "archive", rx: 0.6, ry: 0.55, rw: 0.4, rd: 0.45 },
  ],
  food: [
    { name: "Dining", kind: "dining", rx: 0, ry: 0, rw: 0.6, rd: 1 },
    { name: "Kitchen", kind: "kitchen", rx: 0.6, ry: 0, rw: 0.4, rd: 1 },
  ],
  shop: [
    { name: "Floor", kind: "floor", rx: 0, ry: 0, rw: 0.65, rd: 1 },
    { name: "Storage", kind: "storage", rx: 0.65, ry: 0, rw: 0.35, rd: 1 },
  ],
};

const OBJECT_SETS: Record<string, string[]> = {
  atrium: ["sofa", "table", "plant"],
  studio: ["desk", "terminal"],
  observatory: ["terminal", "chair"],
  hall: ["bench", "table"],
  office: ["desk", "chair"],
  archive: ["shelf", "shelf"],
  dining: ["table", "chair", "counter"],
  kitchen: ["counter", "shelf"],
  floor: ["shelf", "counter"],
  storage: ["crate", "shelf"],
};

const OBJECT_LABEL: Record<string, string> = {
  sofa: "Sofa", table: "Table", plant: "Plant", desk: "Desk", terminal: "Terminal",
  chair: "Chair", bench: "Bench", shelf: "Shelf", counter: "Counter", crate: "Crate",
};

export interface EnsureInteriorsResult {
  rooms: number;
  objects: number;
  buildings: number;
}

/** Idempotent: creates room/object geo nodes for the v1 interior scope. */
export async function ensureInteriors(
  db: PrismaClient,
  store: EventStore,
  seed: number,
  tick: number
): Promise<EnsureInteriorsResult> {
  const existingRooms = await store.geoNodes("room");
  if (existingRooms.length > 0) {
    const objects = await store.geoNodes("object");
    const withRooms = new Set(existingRooms.map((r) => (r as Record<string, unknown>).parent_id as string));
    return { rooms: existingRooms.length, objects: objects.length, buildings: withRooms.size };
  }

  const nodes = (await store.geoNodes()) as unknown as GeoNodeRow[];
  const layout = new CityLayout(seed, nodes);
  const buildings = layout.buildings();
  const ids = new IdAllocator(db);
  for (const prefix of ["room", "furn"]) {
    const row = await db.idCounter.findUnique({ where: { prefix } });
    if (row) ids.warm(prefix, row.nextVal - 1);
  }

  const events: Array<{ tick: number; type: string; payload: Record<string, unknown> }> = [];
  const pathOf = new Map<string, string>(nodes.map((n) => [n.node_id, n.path]));
  let rooms = 0;
  let objects = 0;
  const buildingsWithRooms = new Set<string>();

  const addRooms = (buildingId: string, setKey: keyof typeof ROOM_SETS) => {
    const building = buildings.find((b) => b.id === buildingId);
    if (!building) return;
    const basePath = pathOf.get(buildingId) ?? building.name;
    for (const spec of ROOM_SETS[setKey]) {
      const roomId = ids.next("room");
      pathOf.set(roomId, `${basePath}/${spec.name}`);
      events.push({
        tick,
        type: "geo.node_created",
        payload: {
          idempotency_key: `room-${roomId}`,
          schema_version: SCHEMA_VERSION,
          node_id: roomId,
          parent_id: buildingId,
          level: "room",
          name: `${building.name} · ${spec.name}`,
          path: pathOf.get(roomId)!,
          meta: { kind: spec.kind, rx: spec.rx, ry: spec.ry, rw: spec.rw, rd: spec.rd },
        },
      });
      rooms += 1;
      buildingsWithRooms.add(buildingId);

      // objects inside this room
      const kinds = OBJECT_SETS[spec.kind] ?? [];
      kinds.forEach((kind, i) => {
        const objId = ids.next("furn");
        const ox = 0.2 + 0.6 * unit(seed, objId, "ox", i);
        const oy = 0.2 + 0.6 * unit(seed, objId, "oy", i);
        events.push({
          tick,
          type: "geo.node_created",
          payload: {
            idempotency_key: `furn-${objId}`,
            schema_version: SCHEMA_VERSION,
            node_id: objId,
            parent_id: roomId,
            level: "object",
            name: `${building.name} · ${spec.name} · ${OBJECT_LABEL[kind] ?? kind}`,
            path: `${pathOf.get(roomId)}/${OBJECT_LABEL[kind] ?? kind}`,
            meta: { kind, ox: Math.round(ox * 1000) / 1000, oy: Math.round(oy * 1000) / 1000 },
          },
        });
        objects += 1;
      });
    }
  };

  const sanctum = buildings.find((b) => b.special === "jarvis_sanctum");
  if (sanctum) addRooms(sanctum.id, "sanctum");
  const civicHall = buildings.find((b) => b.kind === "civic" && !b.special);
  if (civicHall) addRooms(civicHall.id, "civic");
  for (const b of buildings) {
    if (b.kind === "food") addRooms(b.id, "food");
    else if (b.kind === "shop") addRooms(b.id, "shop");
  }

  if (events.length) {
    await store.applyBatch(events);
    await ids.flush();
  }
  return { rooms, objects, buildings: buildingsWithRooms.size };
}
