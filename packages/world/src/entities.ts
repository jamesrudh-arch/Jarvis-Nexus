/**
 * NEXUS WORLD entities — factories and helpers (directive §7.2).
 * Canonical entity models with stable ids and explicit relationships.
 */
import { nexusId, ID_PREFIXES, seededRandom, type Vector3 } from "@nexus/core";
import type {
  WorldSchema, ResidentSchema, VehicleSchema, PropertySchema,
  BusinessSchema, AccountSchema,
} from "@nexus/contracts";
import type { z } from "zod";

export type World = z.infer<typeof WorldSchema>;
export type Resident = z.infer<typeof ResidentSchema>;
export type Vehicle = z.infer<typeof VehicleSchema>;
export type Property = z.infer<typeof PropertySchema>;
export type Business = z.infer<typeof BusinessSchema>;
export type Account = z.infer<typeof AccountSchema>;

export const FIRST_NAMES = ["Aria", "Kai", "Mira", "Dorian", "Lyra", "Cassius", "Nia", "Orion", "Vega", "Silas", "Iris", "Rune", "Talia", "Ezra", "Nova", "Leo"];
export const LAST_NAMES = ["Voss", "Kane", "Ito", "Marlowe", "Reyes", "Okafor", "Lindqvist", "Bauer", "Nakamura", "Silva", "Petrov", "Achebe", "Fontaine", "Yilmaz"];

export function createWorld(input: {
  name: string;
  residentTargetPopulation?: number;
  timeScale?: number;
  startSimTime?: number;
}): World {
  return {
    id: nexusId(ID_PREFIXES.world),
    name: input.name,
    simulationTime: input.startSimTime ?? 0,
    timeScale: input.timeScale ?? 60, // 1 real minute = 1 sim hour by default
    environment: { season: "summer", weather: "clear", timeOfDay: 8, dayOfYear: 172 },
    regions: [{ regionId: "central", name: "Central District", center: { x: 0, y: 0, z: 0 }, radius: 400 }],
    config: {
      tickIntervalMs: 50,          // sim-ms processed per tick step
      highFidelityRadius: 100,
      mediumFidelityRadius: 300,
      residentTargetPopulation: input.residentTargetPopulation ?? 24,
    },
    createdAt: new Date().toISOString(),
  };
}

export function createResident(input: {
  worldId: string;
  seed: number;
  homePropertyId?: string;
  employment?: Resident["employment"];
  financialAccountId?: string;
  position?: Vector3;
}): Resident {
  const rng = seededRandom(input.seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const trait = () => Math.round(rng() * 100) / 100;
  return {
    id: nexusId(ID_PREFIXES.resident),
    worldId: input.worldId,
    name: { first: pick(FIRST_NAMES), last: pick(LAST_NAMES) },
    personality: {
      openness: trait(), conscientiousness: trait(), extraversion: trait(),
      agreeableness: trait(), neuroticism: trait(),
    },
    needs: { energy: 70 + rng() * 20, hunger: 40 + rng() * 20, social: 50 + rng() * 20, comfort: 60 + rng() * 20, fun: 50 + rng() * 20 },
    goals: [{ goalId: "g_wellbeing", description: "Maintain a comfortable, healthy life", priority: 0.8, progress: 0.5 }],
    homePropertyId: input.homePropertyId,
    employment: input.employment,
    financialAccountId: input.financialAccountId,
    possessionIds: [],
    relationshipIds: [],
    knowledgeRefs: [],
    emotionalState: { mood: 0.1, lastMoodUpdateSimTime: 0 },
    currentActivity: "sleeping",
    position: input.position ?? { x: rng() * 100 - 50, y: 0, z: rng() * 100 - 50 },
    fidelity: "ABSTRACT",
    routineSeed: input.seed,
    alive: true,
  };
}

export function createVehicle(input: { worldId: string; model: string; category: Vehicle["category"]; ownerId?: string; location?: Vector3 }): Vehicle {
  return {
    id: nexusId(ID_PREFIXES.vehicle),
    worldId: input.worldId,
    model: input.model,
    category: input.category,
    ownerId: input.ownerId,
    location: input.location ?? { x: 0, y: 0, z: 0 },
    condition: 1, fuel: 1, modifications: [], inUse: false,
  };
}

export function createProperty(input: { worldId: string; type: Property["type"]; regionId: string; location: Vector3; valuation: number; ownerId?: string }): Property {
  return {
    id: nexusId(ID_PREFIXES.property),
    worldId: input.worldId,
    type: input.type,
    regionId: input.regionId,
    location: input.location,
    ownerId: input.ownerId,
    valuation: input.valuation,
    interiorState: {},
    maintenance: 1,
    utilities: { electricity: true, water: true },
  };
}

export function createBusiness(input: { worldId: string; name: string; kind: Business["kind"]; regionId: string; accountId: string; inventory?: Business["inventory"] }): Business {
  return {
    id: nexusId(ID_PREFIXES.business),
    worldId: input.worldId,
    name: input.name,
    kind: input.kind,
    regionId: input.regionId,
    accountId: input.accountId,
    inventory: input.inventory ?? [],
    employeeIds: [],
    openHours: { open: 8, close: 20 },
  };
}

export function createAccount(input: { worldId: string; ownerType: Account["ownerType"]; ownerId?: string; institutionId?: string; balance?: number }): Account {
  return {
    id: nexusId(ID_PREFIXES.account),
    worldId: input.worldId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    institutionId: input.institutionId,
    currency: "NEX",
    balance: input.balance ?? 0,
  };
}

/** Home→work commute estimate (sim minutes) from positions. */
export function travelMinutes(a: Vector3, b: Vector3): number {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  return Math.max(2, Math.round(dist / 12)); // ~12 m/min walking, min 2 min
}

export function residentFullName(r: Resident): string {
  return `${r.name.first} ${r.name.last}`;
}
