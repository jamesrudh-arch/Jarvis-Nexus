/**
 * World genesis (port of geography/hierarchy.py + run_world.py).
 *
 * Determinism note (honest): the Python reference generates geography
 * names/kinds via random.Random(seed) (Mersenne Twister sequence state).
 * This TS port derives every name/kind from SHA-256(seed, level, index)
 * instead — same determinism guarantees (no RNG state, replay-safe),
 * but a fresh world from this engine is NOT byte-identical to a Python
 * world with the same seed. The behaviour model (needs/goals/policy/
 * events/idempotency) is a faithful port.
 */
import { h } from "./hash";
import { EventStore, IdAllocator } from "./store";
import { CityLayout, type GeoNodeRow } from "./layout";
import { ResidentEngine } from "./engine";
import type { PrismaClient } from "@prisma/client";

const SYLL_A = ["Ar", "Bel", "Cor", "Dra", "Eld", "Fen", "Gal", "Hal", "Ith",
  "Jor", "Kel", "Lum", "Mor", "Nor", "Ost", "Pel", "Quen", "Rav",
  "Sil", "Tor", "Ulm", "Ver", "Wyn", "Xan", "Yal", "Zeph"];
const SYLL_B = ["a", "e", "i", "o", "u", "ae", "ia", "ora", "ei"];
const SYLL_C = ["dor", "gard", "holm", "mark", "mund", "nia", "port", "ridge",
  "shire", "stead", "thal", "ton", "vale", "wick"];
const LEVEL_SUFFIX: Record<string, string[]> = {
  continent: ["Continent", "Landmass", "Expanse"],
  country: ["Republic", "Kingdom", "Union", "Federation"],
  state: ["Province", "State", "Territory"],
  city: ["City", "Metro", "Haven"],
  district: ["District", "Quarter", "Ward"],
  neighbourhood: ["Neighbourhood", "Rows", "Heights", "Commons"],
  building: ["House", "Hall", "Works", "Shop", "Depot"],
};
const BUILDING_KINDS = ["residential", "shop", "workshop", "civic", "food"];

export interface GenesisConfig {
  seed: number;
  worldId?: string;
  worldName?: string;
  epochUtc?: string;
  minutesPerTick?: number;
  continents?: number;
  countriesPerContinent?: number;
  statesPerCountry?: number;
  citiesPerState?: number;
  districtsPerCity?: number;
  neighbourhoodsPerDistrict?: number;
  buildingsPerNeighbourhood?: number;
}

export const DEFAULT_GENESIS: GenesisConfig = {
  seed: 20261113,
  worldId: "nexus-prime",
  worldName: "Nexus Prime",
  epochUtc: "2026-01-01T00:00:00",
  minutesPerTick: 10,
  continents: 2,
  countriesPerContinent: 1,
  statesPerCountry: 2,
  citiesPerState: 2,
  districtsPerCity: 2,
  neighbourhoodsPerDistrict: 2,
  buildingsPerNeighbourhood: 2,
};

function name(seed: number, level: string, ...path: number[]): string {
  const base =
    SYLL_A[h(seed, level, ...path, "a") % SYLL_A.length] +
    SYLL_B[h(seed, level, ...path, "b") % SYLL_B.length] +
    SYLL_C[h(seed, level, ...path, "c") % SYLL_C.length];
  const sfx = LEVEL_SUFFIX[level] ?? ["Region"];
  return `${base} ${sfx[h(seed, level, ...path, "s") % sfx.length]}`;
}

/** Create the world + procedural geography as idempotent events. */
export async function genesisWorld(db: PrismaClient, store: EventStore, cfg: GenesisConfig = DEFAULT_GENESIS) {
  if (await store.meta("world_id")) throw new Error("world already exists");
  const events: Array<{ tick: number; type: string; payload: Record<string, unknown> }> = [];
  const ids = new IdAllocator(db);
  // warm counters (fresh world: none exist)
  const emit = (level: string, parentId: string | null, meta: Record<string, unknown>, ...path: number[]) => {
    const nodeId = ids.next(`geo-${level.slice(0, 4)}`);
    const nm = name(cfg.seed, level, ...path);
    const parentPath = parentPaths.get(parentId) ?? "";
    parentPaths.set(nodeId, `${parentPath}/${nm}`.replace(/^\//, ""));
    events.push({
      tick: 0, type: "geo.node_created",
      payload: {
        idempotency_key: `geo-${nodeId}`, node_id: nodeId, parent_id: parentId,
        level, name: nm, path: parentPaths.get(nodeId)!, meta,
      },
    });
    counts[level] = (counts[level] ?? 0) + 1;
    return nodeId;
  };
  const parentPaths = new Map<string | null, string>([[null, ""]]);
  const counts: Record<string, number> = {};

  events.push({
    tick: 0, type: "world.created",
    payload: {
      idempotency_key: `world-${cfg.worldId}`, world_id: cfg.worldId,
      name: cfg.worldName, seed: cfg.seed, epoch_utc: cfg.epochUtc,
      minutes_per_tick: cfg.minutesPerTick,
    },
  });
  const worldNode = emit("world", null, { seed: cfg.seed, fictional: true });
  for (let c = 0; c < (cfg.continents ?? 2); c++) {
    const hemisphere = h(cfg.seed, "hemi", c) % 2 === 0 ? "north" : "south";
    const contId = emit("continent", worldNode, { hemisphere }, c);
    for (let k = 0; k < (cfg.countriesPerContinent ?? 1); k++) {
      const tzOptions = [-4, -2, 0, 1, 3, 5, 8];
      const tz = tzOptions[h(cfg.seed, "tz", c, k) % tzOptions.length];
      const ctryId = emit("country", contId, {
        tz_offset_hours: tz, hemisphere, currency: `NXC${Math.abs(tz)}`,
      }, c, k);
      for (let s = 0; s < (cfg.statesPerCountry ?? 2); s++) {
        const stateId = emit("state", ctryId, {}, c, k, s);
        for (let ci = 0; ci < (cfg.citiesPerState ?? 2); ci++) {
          const cityId = emit("city", stateId, { tz_offset_hours: tz }, c, k, s, ci);
          for (let d = 0; d < (cfg.districtsPerCity ?? 2); d++) {
            const distId = emit("district", cityId, {}, c, k, s, ci, d);
            for (let nb = 0; nb < (cfg.neighbourhoodsPerDistrict ?? 2); nb++) {
              const nbId = emit("neighbourhood", distId, {}, c, k, s, ci, d, nb);
              for (let b = 0; b < (cfg.buildingsPerNeighbourhood ?? 2); b++) {
                const kind = BUILDING_KINDS[h(cfg.seed, "kind", c, k, s, ci, d, nb, b) % BUILDING_KINDS.length];
                emit("building", nbId, { kind }, c, k, s, ci, d, nb, b);
              }
            }
          }
        }
      }
    }
  }
  await store.applyBatch(events);
  await ids.flush();
  return { world_node: worldNode, counts };
}

/** Bootstrap helper: ensure a world exists, return engine handles. */
export async function ensureWorld(db: PrismaClient) {
  const store = new EventStore(db);
  let created = false;
  if (!(await store.meta("world_id"))) {
    await genesisWorld(db, store, DEFAULT_GENESIS);
    created = true;
  }
  const seed = parseInt((await store.meta("seed")) || "20261113", 10);
  const nodes = (await store.geoNodes()) as unknown as GeoNodeRow[];
  const layout = new CityLayout(seed, nodes as import("./layout").GeoNodeRow[]);
  const engine = await new ResidentEngine(store, layout, seed, db).init();
  return { store, layout, engine, created };
}

/** Acquire region leases for all state-level nodes (Tier 0 ownership). */
export async function acquireRegions(db: PrismaClient, store: EventStore, owner: string) {
  const states = await store.geoNodes("state");
  const events = states.map((s) => ({
    tick: 0,
    type: "region.lease_acquired",
    payload: {
      idempotency_key: `lease-${s.node_id}-${owner}`,
      region_id: s.node_id, owner, ttl_ticks: 100000,
    },
  }));
  if (events.length) await store.applyBatch(events);
  return events.length;
}
