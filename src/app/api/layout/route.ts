import { NextResponse } from "next/server";
import { backend, BackendError, type Envelope } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Stage 2 Phase 5 V2/V3 — deterministic 3D layout derived from AUTHORITATIVE
 * backend entities (GET /world/layout). The backend owns positions, types and
 * regions; this adapter derives presentation geometry deterministically
 * (dimensions per type, business placement per region, room sets per venue
 * kind). Derived fields are marked; nothing here writes world state.
 */

interface BackendLayout {
  worldId: string;
  regions: Array<{ regionId: string; name: string; center: { x: number; y: number; z: number }; radius: number }>;
  properties: Array<{ id: string; type: string; regionId: string; location: { x: number; y: number; z: number }; valuation: number; ownerId: string | null }>;
  businesses: Array<{ id: string; name: string; kind: string; regionId: string; openHours: { open: number; close: number } }>;
  roads: Array<unknown>;
  note?: string;
}

// Deterministic dimensions per property type (mirrors the backend creation
// engine's structure dimensions — creation.ts uses these same shapes).
const DIMS: Record<string, { w: number; h: number; d: number }> = {
  house: { w: 12, h: 6, d: 10 },
  apartment: { w: 10, h: 3.5, d: 8 },
  villa: { w: 16, h: 7, d: 13 },
  mansion: { w: 20, h: 9, d: 16 },
  penthouse: { w: 14, h: 4, d: 12 },
  townhouse: { w: 9, h: 7, d: 11 },
  hotel: { w: 26, h: 18, d: 20 },
  farm: { w: 30, h: 7, d: 24 },
  commercial: { w: 24, h: 8, d: 18 },
  garage: { w: 18, h: 5, d: 16 },
};
const BIZ_DIMS: Record<string, { w: number; h: number; d: number }> = {
  grocery: { w: 24, h: 8, d: 18 }, restaurant: { w: 18, h: 6, d: 14 },
  retail: { w: 20, h: 7, d: 16 }, gym: { w: 22, h: 9, d: 18 },
  entertainment: { w: 26, h: 10, d: 20 }, garage_dealer: { w: 24, h: 7, d: 20 },
  fuel_station: { w: 16, h: 5, d: 14 }, service: { w: 14, h: 5, d: 12 },
  manufacturer: { w: 34, h: 10, d: 26 }, farm: { w: 30, h: 7, d: 24 },
};

// Presentation room sets (deterministic, derived — not persisted world state).
// Mirrors the legacy interior design: venues are enterable; housing renders
// as "shell" until the backend interiorState model is wired (Phase 5 V3).
type RoomSpec = { name: string; kind: string; rx: number; ry: number; rw: number; rd: number };
const ROOM_SETS: Record<string, RoomSpec[]> = {
  food: [
    { name: "Dining", kind: "dining", rx: 0, ry: 0, rw: 0.6, rd: 1 },
    { name: "Kitchen", kind: "kitchen", rx: 0.6, ry: 0, rw: 0.4, rd: 1 },
  ],
  shop: [
    { name: "Floor", kind: "floor", rx: 0, ry: 0, rw: 0.65, rd: 1 },
    { name: "Storage", kind: "storage", rx: 0.65, ry: 0, rw: 0.35, rd: 1 },
  ],
  civic: [
    { name: "Hall", kind: "hall", rx: 0, ry: 0, rw: 0.6, rd: 1 },
    { name: "Office", kind: "office", rx: 0.6, ry: 0, rw: 0.4, rd: 0.55 },
    { name: "Archive", kind: "archive", rx: 0.6, ry: 0.55, rw: 0.4, rd: 0.45 },
  ],
};
function roomsFor(kind: string): RoomSpec[] {
  if (kind === "restaurant") return ROOM_SETS.food!;
  if (["grocery", "retail", "garage_dealer"].includes(kind)) return ROOM_SETS.shop!;
  if (["service", "gym", "entertainment"].includes(kind)) return ROOM_SETS.civic!;
  return [];
}

// deterministic muted palette by kind (r, g, b in 0..1)
const PALETTE: Record<string, [number, number, number]> = {
  house: [0.55, 0.58, 0.62], apartment: [0.47, 0.5, 0.56], villa: [0.6, 0.55, 0.48],
  mansion: [0.64, 0.58, 0.5], penthouse: [0.5, 0.55, 0.6], townhouse: [0.52, 0.5, 0.55],
  hotel: [0.58, 0.52, 0.6], farm: [0.5, 0.58, 0.45], commercial: [0.45, 0.52, 0.6],
  garage: [0.42, 0.45, 0.5],
};

export async function GET() {
  try {
    const layout = await backend.get<Envelope<BackendLayout>>("/world/layout");
    const d = layout.data;
    const buildings: Array<{
      id: string; kind: string; name: string; district: string;
      x: number; y: number; w: number; d: number; h: number;
      center: [number, number]; color: [number, number, number];
      special?: string | null;
      rooms: Array<{ id: string; name: string; kind: string; x: number; y: number; w: number; d: number; center: [number, number] }>;
    }> = [];

    // -- properties: group apartments into blocks (per x/z cluster, height from floors)
    const apartmentClusters = new Map<string, { x: number; z: number; floors: Set<number>; ids: string[]; regionId: string }>();
    for (const p of d.properties) {
      if (p.type === "apartment") {
        const key = `${Math.round(p.location.x)}_${Math.round(p.location.z)}`;
        const c = apartmentClusters.get(key) ?? { x: p.location.x, z: p.location.z, floors: new Set<number>(), ids: [], regionId: p.regionId };
        c.floors.add(Math.round(p.location.y / 3.5));
        c.ids.push(p.id);
        apartmentClusters.set(key, c);
        continue;
      }
      const dims = DIMS[p.type] ?? DIMS.house!;
      buildings.push({
        id: p.id, kind: p.type, name: `${p.type} ${p.id.slice(-4)}`, district: p.regionId,
        x: p.location.x - dims.w / 2, y: p.location.z - dims.d / 2, w: dims.w, d: dims.d, h: dims.h,
        center: [p.location.x, p.location.z],
        color: PALETTE[p.type] ?? PALETTE.house!,
        rooms: [], // housing renders as shell — honest, not fabricated interiors
      });
    }
    for (const [key, c] of apartmentClusters) {
      const floors = Math.max(1, c.floors.size);
      const dims = DIMS.apartment!;
      buildings.push({
        id: `block_${key}`, kind: "apartment", name: `Apartment Block (${floors} floors, ${c.ids.length} units)`,
        district: c.regionId,
        x: c.x - dims.w / 2 - 8, y: c.z - dims.d / 2, w: dims.w * c.ids.length / Math.max(1, c.floors.size) + 16,
        d: dims.d, h: floors * 3.5,
        center: [c.x, c.z], color: PALETTE.apartment!, rooms: [],
      });
    }

    // -- businesses: deterministic placement around their region centre (index-spread)
    const byRegion = new Map<string, { name: string; kind: string; id: string; i: number }[]>();
    for (const b of d.businesses) {
      const list = byRegion.get(b.regionId) ?? [];
      list.push({ name: b.name, kind: b.kind, id: b.id, i: list.length });
      byRegion.set(b.regionId, list);
    }
    for (const region of d.regions) {
      const biz = byRegion.get(region.regionId) ?? [];
      for (const b of biz) {
        const dims = BIZ_DIMS[b.kind] ?? BIZ_DIMS.commercial!;
        const angle = (b.i / Math.max(1, biz.length)) * Math.PI * 2;
        const px = region.center.x + Math.cos(angle) * (region.radius * 0.55);
        const pz = region.center.z + Math.sin(angle) * (region.radius * 0.55);
        const rooms = roomsFor(b.kind).map((r, ri) => ({
          id: `${b.id}_room_${ri}`, name: r.name, kind: r.kind,
          x: px - dims.w / 2 + r.rx * dims.w, y: pz - dims.d / 2 + r.ry * dims.d,
          w: r.rw * dims.w, d: r.rd * dims.d,
          center: [px - dims.w / 2 + (r.rx + r.rw / 2) * dims.w, pz - dims.d / 2 + (r.ry + r.rd / 2) * dims.d] as [number, number],
        }));
        buildings.push({
          id: b.id, kind: "commercial", name: b.name, district: region.regionId,
          x: px - dims.w / 2, y: pz - dims.d / 2, w: dims.w, d: dims.d, h: dims.h,
          center: [px, pz], color: PALETTE.commercial!,
          special: b.kind === "entertainment" ? "venue" : null,
          rooms,
        });
      }
    }

    // -- bounds with padding
    const xs = buildings.flatMap((b) => [b.x, b.x + b.w]);
    const ys = buildings.flatMap((b) => [b.y, b.y + b.d]);
    const pad = 60;
    const bounds: [number, number, number, number] = xs.length
      ? [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad]
      : [-200, -200, 200, 200];

    return NextResponse.json({
      source: "nexus-api (derived presentation geometry)",
      derived_fields: ["dimensions", "business placement offsets", "room sets", "bounds"],
      backend_note: d.note,
      bounds,
      roads: d.roads.flatMap((r) => (r as { from?: { x: number; z: number }; to?: { x: number; z: number }; width?: number }).from
        ? [{ x1: (r as any).from.x, y1: (r as any).from.z, x2: (r as any).to.x, y2: (r as any).to.z, width: (r as any).width ?? 8 }]
        : []),
      buildings,
      objects: [],
      objects_note: "interior objects arrive with the backend interiorState model (Phase 5 V3 follow-up)",
    });
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
