/**
 * Deterministic 2D spatial layout (port of geography/spatial.py).
 * Single source of truth for WHERE things are — used by BOTH the
 * resident movement simulation and the 3D world renderer.
 */
import { unit } from "./hash";

export const BLOCK = 34.0; // district block footprint
export const ROAD = 4.0; // inter-block road width
export const LANE = 2.0; // intra-block lane width
export const MARGIN = 12.0; // world edge margin

export const KIND_SIZE: Record<string, [number, number, number]> = {
  // kind: [width, depth, height]
  residential: [6.0, 6.0, 4.5],
  shop: [7.0, 6.0, 4.0],
  workshop: [9.0, 8.0, 6.0],
  civic: [8.0, 7.0, 7.0],
  food: [6.0, 5.0, 3.5],
};
export const KIND_FALLBACK: [number, number, number] = [6.0, 6.0, 4.0];

export const KIND_COLOR: Record<string, [number, number, number]> = {
  residential: [0.83, 0.72, 0.56],
  shop: [0.9, 0.8, 0.38],
  workshop: [0.56, 0.61, 0.71],
  civic: [0.76, 0.57, 0.76],
  food: [0.86, 0.52, 0.4],
};
export const ACTION_COLOR: Record<string, [number, number, number]> = {
  sleeping: [0.3, 0.4, 0.85],
  eating: [0.95, 0.85, 0.25],
  working: [0.95, 0.55, 0.15],
  socializing: [0.92, 0.45, 0.65],
  leisure: [0.25, 0.75, 0.7],
  commuting: [0.92, 0.92, 0.95],
  idle: [0.55, 0.55, 0.58],
};

export interface GeoNodeRow {
  node_id: string;
  parent_id: string | null;
  level: string;
  name: string;
  path: string;
  meta: Record<string, unknown>;
}

export interface Building {
  id: string;
  kind: string;
  name: string;
  district: string;
  neighbourhood: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  center: [number, number];
  color: [number, number, number];
  special?: string; // e.g. "jarvis_sanctum" — carried from geo meta
}

/** A room inside a building (geo level "room", placed as a fraction of the
 *  parent building's footprint — world coordinates derived here). */
export interface Room {
  id: string;
  building_id: string;
  name: string;
  kind: string; // dining | kitchen | floor | storage | hall | office | archive | atrium | studio | observatory
  x: number;
  y: number;
  w: number;
  d: number;
  center: [number, number];
}

/** An object inside a room (geo level "object", placed as a fraction of the
 *  parent room's rect). */
export interface WorldObject {
  id: string;
  room_id: string;
  building_id: string;
  name: string;
  kind: string; // table | chair | counter | shelf | desk | terminal | sofa | plant | bench | crate
  x: number;
  y: number;
}

export interface RoadSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export class CityLayout {
  readonly seed: number;
  private nodes = new Map<string, GeoNodeRow>();
  private children = new Map<string | null, GeoNodeRow[]>();
  private _buildings: Building[] | null = null;
  private _roads: RoadSeg[] | null = null;
  private _bounds: [number, number, number, number] | null = null;
  private _rooms: Room[] | null = null;
  private _roomsByBuilding = new Map<string, Room[]>();
  private _objects: WorldObject[] | null = null;
  private _objectsByRoom = new Map<string, WorldObject[]>();

  constructor(seed: number, nodes: GeoNodeRow[]) {
    this.seed = seed;
    for (const n of nodes) {
      this.nodes.set(n.node_id, n);
      const list = this.children.get(n.parent_id) ?? [];
      list.push(n);
      this.children.set(n.parent_id, list);
    }
  }

  get districts(): GeoNodeRow[] {
    return [...this.nodes.values()]
      .filter((n) => n.level === "district")
      .sort((a, b) => (a.node_id < b.node_id ? -1 : 1));
  }

  buildings(): Building[] {
    this.ensure();
    return this._buildings!;
  }

  roads(): RoadSeg[] {
    this.ensure();
    return this._roads!;
  }

  /** All rooms across the world (empty until interiors are generated). */
  rooms(): Room[] {
    this.ensure();
    return this._rooms!;
  }

  roomsOf(buildingId: string): Room[] {
    this.ensure();
    return this._roomsByBuilding.get(buildingId) ?? [];
  }

  room(id: string): Room | null {
    this.ensure();
    return this._rooms!.find((r) => r.id === id) ?? null;
  }

  objects(): WorldObject[] {
    this.ensure();
    return this._objects!;
  }

  objectsOf(roomId: string): WorldObject[] {
    this.ensure();
    return this._objectsByRoom.get(roomId) ?? [];
  }

  bounds(): [number, number, number, number] {
    this.ensure();
    return this._bounds!;
  }

  building(id: string): Building | null {
    return this.buildings().find((b) => b.id === id) ?? null;
  }

  buildingName(id: string): string {
    const n = this.nodes.get(id);
    return n ? n.name : id;
  }

  districtOf(id: string): string | null {
    return this.nodes.get(id)?.name ?? null;
  }

  private ensure() {
    if (this._buildings) return;
    const buildings: Building[] = [];
    const roads: RoadSeg[] = [];
    const districts = this.districts;
    const n = Math.max(1, districts.length);
    const cols = Math.ceil(Math.sqrt(n));
    const pitch = BLOCK + ROAD;
    const extent = cols * pitch + ROAD;
    for (let i = 0; i <= cols; i++) {
      const x = i * pitch;
      roads.push({ x1: x, y1: -ROAD, x2: x, y2: extent, width: ROAD });
      roads.push({ x1: -ROAD, y1: i * pitch, x2: extent, y2: i * pitch, width: ROAD });
    }
    districts.forEach((district, idx) => {
      const gx = (idx % cols) * pitch + ROAD;
      const gy = Math.floor(idx / cols) * pitch + ROAD;
      roads.push({ x1: gx, y1: gy + BLOCK / 2, x2: gx + BLOCK, y2: gy + BLOCK / 2, width: LANE });
      roads.push({ x1: gx + BLOCK / 2, y1: gy, x2: gx + BLOCK / 2, y2: gy + BLOCK, width: LANE });
      const nbs = [...(this.children.get(district.node_id) ?? [])].sort((a, b) =>
        a.node_id < b.node_id ? -1 : 1
      );
      nbs.forEach((nb, j) => {
        const cx = gx + (j % 2) * (BLOCK / 2) + BLOCK / 8;
        const cy = gy + Math.floor(j / 2) * (BLOCK / 2) + BLOCK / 8;
        const cell = BLOCK / 2 - BLOCK / 8;
        const bs = [...(this.children.get(nb.node_id) ?? [])].sort((a, b) =>
          a.node_id < b.node_id ? -1 : 1
        );
        bs.forEach((bnode) => {
          const kind = (bnode.meta.kind as string) || "residential";
          const [w, d, h] = KIND_SIZE[kind] ?? KIND_FALLBACK;
          const fx = 0.3 + 0.55 * unit(this.seed, bnode.node_id, "x");
          const fy = 0.3 + 0.55 * unit(this.seed, bnode.node_id, "y");
          const fh = 0.85 + 0.5 * unit(this.seed, bnode.node_id, "h");
          const x = cx + fx * (cell - w);
          const y = cy + fy * (cell - d);
          buildings.push({
            id: bnode.node_id,
            kind,
            name: bnode.name,
            district: district.name,
            neighbourhood: nb.name,
            x: Math.round(x * 1000) / 1000,
            y: Math.round(y * 1000) / 1000,
            w,
            d,
            h: Math.round(h * fh * 1000) / 1000,
            center: [
              Math.round((x + w / 2) * 1000) / 1000,
              Math.round((y + d / 2) * 1000) / 1000,
            ],
            color: KIND_COLOR[kind] ?? [0.7, 0.7, 0.7],
            special: (bnode.meta.special as string) || undefined,
          });
        });
      });
    });
    this._buildings = buildings.sort((a, b) => (a.id < b.id ? -1 : 1));
    this._roads = roads;
    this._bounds = [-MARGIN, -MARGIN, extent + MARGIN - ROAD / 2, extent + MARGIN - ROAD / 2];
    this.deriveInteriors();
  }

  /** Rooms + objects from geo nodes (levels "room"/"object"), placed inside
   *  their parent building footprint / room rect. Runs once per instance. */
  private deriveInteriors() {
    const byId = new Map(this._buildings!.map((b) => [b.id, b]));
    const rooms: Room[] = [];
    const roomById = new Map<string, Room>();
    for (const n of this.nodes.values()) {
      if (n.level !== "room") continue;
      const b = byId.get(n.parent_id ?? "");
      if (!b) continue;
      const m = n.meta as Record<string, number>;
      const rx = m.rx ?? 0, ry = m.ry ?? 0, rw = m.rw ?? 1, rd = m.rd ?? 1;
      const x = Math.round((b.x + rx * b.w) * 1000) / 1000;
      const y = Math.round((b.y + ry * b.d) * 1000) / 1000;
      const w = Math.round(rw * b.w * 1000) / 1000;
      const d = Math.round(rd * b.d * 1000) / 1000;
      const room: Room = {
        id: n.node_id,
        building_id: b.id,
        name: n.name,
        kind: (n.meta.kind as string) || "room",
        x, y, w, d,
        center: [
          Math.round((x + w / 2) * 1000) / 1000,
          Math.round((y + d / 2) * 1000) / 1000,
        ],
      };
      rooms.push(room);
      roomById.set(room.id, room);
      const list = this._roomsByBuilding.get(b.id) ?? [];
      list.push(room);
      this._roomsByBuilding.set(b.id, list);
    }
    this._rooms = rooms.sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const b of this._buildings!) {
      this._roomsByBuilding.set(b.id, (this._roomsByBuilding.get(b.id) ?? []).sort((a, x) => (a.id < x.id ? -1 : 1)));
    }
    const objects: WorldObject[] = [];
    for (const n of this.nodes.values()) {
      if (n.level !== "object") continue;
      const room = roomById.get(n.parent_id ?? "");
      if (!room) continue;
      const m = n.meta as Record<string, number>;
      const ox = m.ox ?? 0.5, oy = m.oy ?? 0.5;
      objects.push({
        id: n.node_id,
        room_id: room.id,
        building_id: room.building_id,
        name: n.name,
        kind: (n.meta.kind as string) || "object",
        x: Math.round((room.x + ox * room.w) * 1000) / 1000,
        y: Math.round((room.y + oy * room.d) * 1000) / 1000,
      });
    }
    this._objects = objects.sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const o of this._objects) {
      const list = this._objectsByRoom.get(o.room_id) ?? [];
      list.push(o);
      this._objectsByRoom.set(o.room_id, list);
    }
  }
}
