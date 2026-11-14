/**
 * NEXUS Creation Engine (directive §7.11) — natural-language world
 * construction. Produces a ConstructionSpecification (machine-readable build
 * plan) AND the world-state records (properties, businesses, residents,
 * infrastructure). Geometry production (Blender/Unreal) consumes the spec
 * downstream; persistence and validation happen here.
 */
import { nexusId, ID_PREFIXES, ok, err, type Result } from "@nexus/core";
import type { WorldEvent } from "@nexus/contracts";
import type { World } from "./entities";
import { createProperty, createBusiness, createAccount, createResident, createVehicle } from "./entities";
import type { WorldStore } from "./persistence";

export interface ConstructionSpec {
  specId: string;
  request: string;
  kind: "residential_neighbourhood" | "commercial_complex" | "city_district" | "apartment_building" | "racing_circuit" | "entertainment_district" | "custom";
  regionId: string;
  structures: Array<{
    structureId: string;
    type: "house" | "apartment" | "commercial" | "road" | "circuit" | "venue" | "garage";
    position: { x: number; y: number; z: number };
    dimensions: { w: number; h: number; d: number };
    floors?: number;
    propertyId?: string;
    businessId?: string;
  }>;
  roads: Array<{ from: { x: number; z: number }; to: { x: number; z: number }; width: number }>;
  populationPlan: { residents: number; homes: number; jobs: number };
  estimatedValue: number;
}

export interface ConstructionResult {
  spec: ConstructionSpec;
  event: WorldEvent;
  created: { properties: number; businesses: number; residents: number; vehicles: number; accounts: number };
}

export class CreationEngine {
  constructor(private readonly store: WorldStore) {}

  /**
   * Interpret a natural-language construction request into a specification,
   * materialise world entities, and record the causal construction event.
   * Layout is deterministic from the request (reproducible builds).
   */
  construct(world: World, request: string, opts?: { centre?: { x: number; z: number }; scale?: number }): Result<ConstructionResult> {
    const lower = request.toLowerCase();
    const centre = opts?.centre ?? this.nextDistrictCentre(world);
    const scale = opts?.scale ?? 1;

    let kind: ConstructionSpec["kind"] = "custom";
    if (/residential|neighbourhood|neighborhood|homes|houses/.test(lower)) kind = "residential_neighbourhood";
    else if (/commercial|shops|offices|mall|complex/.test(lower)) kind = "commercial_complex";
    else if (/district|city|town/.test(lower)) kind = "city_district";
    else if (/apartment/.test(lower)) kind = "apartment_building";
    else if (/rac(ing|etrack|e circuit)|circuit/.test(lower)) kind = "racing_circuit";
    else if (/entertainment|nightlife|clubs|theatre/.test(lower)) kind = "entertainment_district";

    const spec: ConstructionSpec = {
      specId: `nexus_spec_${nexusId(ID_PREFIXES.req)}`,
      request,
      kind,
      regionId: `region_${Math.round(centre.x)}_${Math.round(centre.z)}`,
      structures: [],
      roads: [],
      populationPlan: { residents: 0, homes: 0, jobs: 0 },
      estimatedValue: 0,
    };

    const created = { properties: 0, businesses: 0, residents: 0, vehicles: 0, accounts: 0 };

    try {
      switch (kind) {
        case "residential_neighbourhood": this.buildNeighbourhood(world, spec, centre, scale, created); break;
        case "commercial_complex": this.buildCommercial(world, spec, centre, scale, created); break;
        case "apartment_building": this.buildApartment(world, spec, centre, created); break;
        case "racing_circuit": this.buildCircuit(world, spec, centre, created); break;
        case "entertainment_district": this.buildEntertainment(world, spec, centre, scale, created); break;
        case "city_district": this.buildDistrict(world, spec, centre, scale, created); break;
        default: this.buildNeighbourhood(world, spec, centre, scale, created); break;
      }

      // roads connect the district to the centre of the world
      spec.roads.push({ from: { x: 0, z: 0 }, to: centre, width: 8 });

      spec.populationPlan = { residents: created.residents, homes: created.properties, jobs: created.businesses * 4 };
      spec.estimatedValue = Math.round(spec.structures.reduce((s, st) => s + (st.type === "house" ? 250_000 : st.type === "apartment" ? 180_000 : st.type === "commercial" ? 400_000 : 50_000), 0) * scale);

      const regionName = kind.replace(/_/g, " ");
      world.regions.push({ regionId: spec.regionId, name: `New ${regionName}`, center: { x: centre.x, y: 0, z: centre.z }, radius: 250 * scale });

      const event = this.store.recordEvent({
        worldId: world.id,
        type: "world_construction",
        simTime: world.simulationTime,
        cause: `creation request: "${request}"`,
        effects: [
          { target: `region:${spec.regionId}`, change: `constructed ${spec.structures.length} structures` },
          { target: "population", change: `+${created.residents} residents` },
        ],
        payload: { specId: spec.specId, kind, structures: spec.structures.length, created },
      });

      this.store.saveWorld(world);
      return ok({ spec, event, created });
    } catch (e) {
      return err(new Error(`construction failed: ${String(e)}`));
    }
  }

  // -- builders --------------------------------------------------------------

  private buildNeighbourhood(world: World, spec: ConstructionSpec, centre: { x: number; z: number }, scale: number, created: ConstructionResult["created"]): void {
    const homes = Math.max(4, Math.round(8 * scale));
    for (let i = 0; i < homes; i++) {
      const angle = (i / homes) * Math.PI * 2;
      const pos = { x: centre.x + Math.cos(angle) * 60 * scale, y: 0, z: centre.z + Math.sin(angle) * 60 * scale };
      const prop = createProperty({ worldId: world.id, type: "house", regionId: spec.regionId, location: pos, valuation: 220_000 + i * 15_000 });
      const account = createAccount({ worldId: world.id, ownerType: "resident", balance: 5_000 + i * 500 });
      const resident = createResident({ worldId: world.id, seed: i + 1000, homePropertyId: prop.id, financialAccountId: account.id, position: pos });
      prop.ownerId = resident.id;
      this.store.saveProperty(prop);
      this.store.saveAccount(account);
      this.store.saveResident(resident);
      created.properties++; created.accounts++; created.residents++;
      spec.structures.push({ structureId: `st_${i}`, type: "house", position: pos, dimensions: { w: 12, h: 6, d: 10 }, propertyId: prop.id });
      spec.roads.push({ from: centre, to: { x: pos.x, z: pos.z }, width: 5 });
    }
    const shopAccount = createAccount({ worldId: world.id, ownerType: "business", balance: 20_000 });
    const shop = createBusiness({
      worldId: world.id, name: "Corner Market", kind: "grocery", regionId: spec.regionId, accountId: shopAccount.id,
      inventory: [
        { sku: "groceries_weekly", name: "Weekly groceries", quantity: 50, unitPrice: 45 },
        { sku: "bread", name: "Bread", quantity: 40, unitPrice: 3.5 },
        { sku: "coffee", name: "Coffee", quantity: 60, unitPrice: 8 },
      ],
    });
    this.store.saveAccount(shopAccount);
    this.store.saveBusiness(shop);
    created.businesses++; created.accounts++;
    // the corner market employs the first two residents (real jobs, real salaries)
    const employable = this.store.listResidents(world.id).slice(0, 2);
    for (const [i, r] of employable.entries()) {
      r.employment = {
        businessId: shop.id, role: i === 0 ? "shopkeeper" : "stocker",
        salaryPerHour: 18,
        schedule: { startHour: 8, endHour: 17, days: [1, 2, 3, 4, 5] },
      };
      shop.employeeIds.push(r.id);
      this.store.saveResident(r);
    }
    this.store.saveBusiness(shop);
    spec.structures.push({ structureId: "st_shop", type: "commercial", position: { x: centre.x, y: 0, z: centre.z }, dimensions: { w: 20, h: 5, d: 14 }, businessId: shop.id });
  }

  private buildCommercial(world: World, spec: ConstructionSpec, centre: { x: number; z: number }, scale: number, created: ConstructionResult["created"]): void {
    const units = Math.max(3, Math.round(5 * scale));
    const kinds: Array<["grocery" | "retail" | "restaurant" | "gym" | "entertainment", string]> = [
      ["grocery", "Nexus Market"], ["retail", "District Retail"], ["restaurant", "The Grid Diner"],
      ["gym", "Pulse Gym"], ["entertainment", "Vector Arcade"],
    ];
    for (let i = 0; i < units; i++) {
      const [kind, name] = kinds[i % kinds.length]!;
      const pos = { x: centre.x + (i - units / 2) * 30, y: 0, z: centre.z };
      const account = createAccount({ worldId: world.id, ownerType: "business", balance: 30_000 });
      const biz = createBusiness({
        worldId: world.id, name, kind, regionId: spec.regionId, accountId: account.id,
        inventory: kind === "grocery"
          ? [{ sku: "groceries_weekly", name: "Weekly groceries", quantity: 80, unitPrice: 45 }]
          : kind === "restaurant"
            ? [{ sku: "meal", name: "Meal", quantity: 100, unitPrice: 18 }]
            : [],
      });
      this.store.saveAccount(account);
      this.store.saveBusiness(biz);
      created.businesses++; created.accounts++;
      spec.structures.push({ structureId: `st_biz_${i}`, type: "commercial", position: pos, dimensions: { w: 24, h: 8, d: 18 }, businessId: biz.id });
    }
    spec.structures.push({ structureId: "st_parking", type: "garage", position: { x: centre.x, y: 0, z: centre.z + 40 }, dimensions: { w: 40, h: 10, d: 40 } });
  }

  private buildApartment(world: World, spec: ConstructionSpec, centre: { x: number; z: number }, created: ConstructionResult["created"]): void {
    const floors = 6;
    for (let f = 0; f < floors; f++) {
      for (let u = 0; u < 4; u++) {
        const prop = createProperty({
          worldId: world.id, type: "apartment", regionId: spec.regionId,
          location: { x: centre.x + (u - 1.5) * 12, y: f * 3.5, z: centre.z },
          valuation: 140_000 + f * 5_000,
        });
        this.store.saveProperty(prop);
        created.properties++;
        spec.structures.push({ structureId: `st_apt_${f}_${u}`, type: "apartment", position: prop.location, dimensions: { w: 10, h: 3.5, d: 8 }, floors, propertyId: prop.id });
      }
    }
    spec.structures.push({ structureId: "st_block", type: "apartment", position: { x: centre.x, y: 0, z: centre.z }, dimensions: { w: 55, h: floors * 3.5, d: 18 } });
  }

  private buildCircuit(world: World, spec: ConstructionSpec, centre: { x: number; z: number }, created: ConstructionResult["created"]): void {
    spec.structures.push({ structureId: "st_circuit", type: "circuit", position: { x: centre.x, y: 0, z: centre.z }, dimensions: { w: 800, h: 1, d: 600 } });
    // track outline segments (simplified oval with chicane)
    const r = 300;
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
      spec.roads.push({
        from: { x: centre.x + Math.cos(a0) * r, z: centre.z + Math.sin(a0) * r * 0.75 },
        to: { x: centre.x + Math.cos(a1) * r, z: centre.z + Math.sin(a1) * r * 0.75 },
        width: 14,
      });
    }
    const account = createAccount({ worldId: world.id, ownerType: "business", balance: 50_000 });
    const club = createBusiness({ worldId: world.id, name: " apex Racing Club", kind: "entertainment", regionId: spec.regionId, accountId: account.id, inventory: [] });
    this.store.saveAccount(account);
    this.store.saveBusiness(club);
    created.businesses++; created.accounts++;
    // club vehicles
    for (const [model, category] of [["Vector GT", "sports"], ["Aeon RS", "supercar"]] as const) {
      const v = createVehicle({ worldId: world.id, model, category, location: { x: centre.x, y: 0, z: centre.z + 40 } });
      this.store.saveVehicle(v);
      created.vehicles++;
    }
  }

  private buildEntertainment(world: World, spec: ConstructionSpec, centre: { x: number; z: number }, scale: number, created: ConstructionResult["created"]): void {
    const venues: Array<[string, string]> = [["Club Nova", "entertainment"], ["The Neon Lounge", "entertainment"], ["Pulse Concert Hall", "entertainment"]];
    for (let i = 0; i < Math.max(2, Math.round(3 * scale)); i++) {
      const [name, kind] = venues[i % venues.length]!;
      const pos = { x: centre.x + i * 35, y: 0, z: centre.z };
      const account = createAccount({ worldId: world.id, ownerType: "business", balance: 15_000 });
      const biz = createBusiness({ worldId: world.id, name, kind: kind as never, regionId: spec.regionId, accountId: account.id, inventory: [{ sku: "entry", name: "Entry ticket", quantity: 200, unitPrice: 15 }] });
      this.store.saveAccount(account);
      this.store.saveBusiness(biz);
      created.businesses++; created.accounts++;
      spec.structures.push({ structureId: `st_venue_${i}`, type: "venue", position: pos, dimensions: { w: 30, h: 12, d: 24 }, businessId: biz.id });
    }
  }

  private buildDistrict(world: World, spec: ConstructionSpec, centre: { x: number; z: number }, scale: number, created: ConstructionResult["created"]): void {
    this.buildNeighbourhood(world, spec, { x: centre.x - 80 * scale, z: centre.z }, scale * 0.8, created);
    this.buildCommercial(world, spec, { x: centre.x + 80 * scale, z: centre.z }, scale * 0.8, created);
  }

  private nextDistrictCentre(world: World): { x: number; z: number } {
    const n = world.regions.length;
    const angle = n * 0.7;
    const dist = 350 + n * 120;
    return { x: Math.round(Math.cos(angle) * dist), z: Math.round(Math.sin(angle) * dist) };
  }
}
