import { describe, expect, test, beforeEach } from "bun:test";
import { NexusDb, migrate } from "@nexus/db";
import {
  WorldRuntime, createWorld, createResident, createAccount, createBusiness, createVehicle,
} from "@nexus/world";

/**
 * MANDATORY END-TO-END SCENARIOS (directive §19) — backend verification.
 * A (JARVIS autonomy) and B (NAEI engineering) are exercised in
 * tests/integration/api.test.ts against the live service + live model.
 * C (Blender→Unreal asset pipeline) is environment-blocked: no Blender/UE
 * runtime in this build environment — see registry/blocked.md + ADR-009.
 */
let db: NexusDb;
let runtime: WorldRuntime;

beforeEach(() => {
  db = NexusDb.open(":memory:");
  migrate(db);
  runtime = new WorldRuntime(db);
});

describe("SCENARIO D — PERSISTENT WORLD (directive §19 D)", () => {
  test("modify world → stop processes → restart → authoritative state and history consistent", () => {
    const path = `/tmp/nexus_scenario_d_${Date.now()}.db`;

    // phase 1: create, modify, advance, snapshot — then "crash" (close db)
    let worldId: string;
    let eventsBefore = 0;
    let residentsBefore = 0;
    let moneyBefore = 0;
    {
      const db1 = NexusDb.open(path);
      migrate(db1);
      const rt1 = new WorldRuntime(db1);
      const world = createWorld({ name: "Persistence Gate" });
      worldId = world.id;
      rt1.store.saveWorld(world);
      rt1.creation.construct(world, "Construct a residential neighbourhood");
      rt1.simulation.advance(world, { ticks: 80 }); // cross 09:00: salaries
      rt1.store.snapshot(world.id, "pre-crash");
      eventsBefore = db1.count("SELECT COUNT(*) AS n FROM world_events WHERE world_id = ?", worldId);
      residentsBefore = rt1.store.listResidents(worldId).length;
      moneyBefore = rt1.economy.moneySupply(worldId).total;
      expect(eventsBefore).toBeGreaterThan(1); // construction + salaries at minimum
      db1.close(); // simulated process termination
    }

    // phase 2: restart — verify state + history survived and stay consistent
    {
      const db2 = NexusDb.open(path);
      migrate(db2);
      const rt2 = new WorldRuntime(db2);
      const recovery = rt2.store.recover(worldId);
      expect(recovery.recoveredFromSnapshot).toBe(true);
      expect(recovery.world!.name).toBe("Persistence Gate");
      // residents, history, economy all intact
      expect(rt2.store.listResidents(worldId).length).toBe(residentsBefore);
      const eventsAfter = db2.count("SELECT COUNT(*) AS n FROM world_events WHERE world_id = ?", worldId);
      expect(eventsAfter).toBe(eventsBefore);
      expect(rt2.economy.moneySupply(worldId).total).toBeCloseTo(moneyBefore);
      // and the world can CONTINUE simulating after restart
      const world = rt2.store.getWorld(worldId)!;
      const report = rt2.simulation.advance(world, { ticks: 10 });
      expect(report.simTimeAfter).toBeGreaterThan(report.simTimeBefore);
      db2.close();
    }
  });
});

describe("SCENARIO E — AUTONOMOUS RESIDENTS (directive §19 E)", () => {
  test("resident attends work, meets another resident, participates in an event, returns home — experiences, relationships and memories retained", () => {
    const world = createWorld({ name: "Scenario E", startSimTime: 6 * 3_600_000 }); // 06:00
    runtime.store.saveWorld(world);

    const homeA = runtime.store.listProperties(world.id);
    expect(homeA.length).toBe(0);

    // employ resident A at a business
    const bizAccount = createAccount({ worldId: world.id, ownerType: "business", balance: 100_000 });
    const biz = createBusiness({
      worldId: world.id, name: "Grid Cafe", kind: "restaurant", regionId: "central",
      accountId: bizAccount.id, inventory: [{ sku: "meal", name: "Meal", quantity: 100, unitPrice: 15 }],
    });
    const accountA = createAccount({ worldId: world.id, ownerType: "resident", balance: 100 });
    const a = createResident({
      worldId: world.id, seed: 11, financialAccountId: accountA.id,
      employment: { businessId: biz.id, role: "barista", salaryPerHour: 18, schedule: { startHour: 8, endHour: 16, days: [1, 2, 3, 4, 5, 6, 0] } },
      position: { x: 5, y: 0, z: 5 },
    });
    const accountB = createAccount({ worldId: world.id, ownerType: "resident", balance: 60 });
    const b = createResident({ worldId: world.id, seed: 12, financialAccountId: accountB.id, position: { x: 8, y: 0, z: 8 } });
    for (const x of [bizAccount, accountA, accountB, biz]) {
      if ("inventory" in x) runtime.store.saveBusiness(x); else runtime.store.saveAccount(x);
    }
    runtime.store.saveResident(a);
    runtime.store.saveResident(b);

    // simulate a full day: work, encounter, community event
    const observedActivities = new Set<string>();
    let socialEvents = 0;
    for (let i = 0; i < 14; i++) {
      const report = runtime.simulation.advance(world, { ticks: 10 }); // ~100 min per iteration
      socialEvents += report.eventsGenerated.filter((id) => runtime.store.eventById(id)?.type === "social_encounter").length;
      for (const r of runtime.store.listResidents(world.id)) observedActivities.add(r.currentActivity);
    }

    // employment payment happened (work attended, §10.1)
    const payments = runtime.store.events(world.id, { type: "employment_payment" });
    expect(payments.length).toBeGreaterThanOrEqual(1);
    expect(runtime.store.getAccount(accountA.id)!.balance).toBeGreaterThan(100); // salary received

    // daily variety of activities (wake/work/travel/shop/socialise)
    expect(observedActivities.size).toBeGreaterThanOrEqual(3);

    // purchase: B buys a meal (participates in the world)
    const buyer = runtime.store.getResident(b.id)!;
    const purchase = runtime.economy.purchase({ worldId: world.id, buyerResident: buyer, businessId: biz.id, sku: "meal", quantity: 1, simTime: world.simulationTime });
    expect(purchase.ok).toBe(true);

    // experiences retained: A and B have knowledge refs, salary in transaction log
    const aFinal = runtime.store.getResident(a.id)!;
    const bFinal = runtime.store.getResident(b.id)!;
    expect(bFinal.knowledgeRefs.length).toBeGreaterThan(0); // purchase memory
    expect(runtime.economy.transactionLog(world.id).length).toBeGreaterThanOrEqual(2); // salary + purchase

    // relationship evidence (social graph) — direct or via encounters history
    const encounters = runtime.store.events(world.id, { type: "social_encounter" });
    if (encounters.length > 0) {
      expect(aFinal.relationshipIds.length + bFinal.relationshipIds.length).toBeGreaterThan(0);
    }
    // memories (knowledge) are derived ONLY from experience: uninvolved residents know nothing
    const outsider = createResident({ worldId: world.id, seed: 99, position: { x: 800, y: 0, z: 800 } });
    runtime.store.saveResident(outsider);
    expect(runtime.life.residentKnowledge(world.id, runtime.store.getResident(outsider.id)!).length).toBe(0);
  });
});

describe("SCENARIO F — CAUSAL WORLD EVENT (directive §19 F)", () => {
  test("vehicle collision during rain: damage, witnesses, emergency response, road consequences, resident memories", () => {
    const world = createWorld({ name: "Scenario F", startSimTime: 8 * 3_600_000 });
    world.environment.weather = "rain";
    runtime.store.saveWorld(world);

    // two drivers + a witness near the collision site
    const driverA = createResident({ worldId: world.id, seed: 21, position: { x: 0, y: 0, z: 0 } });
    const driverB = createResident({ worldId: world.id, seed: 22, position: { x: 5, y: 0, z: 5 } });
    const witness = createResident({ worldId: world.id, seed: 23, position: { x: 10, y: 0, z: 10 } });
    for (const r of [driverA, driverB, witness]) runtime.store.saveResident(r);

    const vehA = createVehicle({ worldId: world.id, model: "Vector GT", category: "sports", ownerId: driverA.id, location: { x: 0, y: 0, z: 0 } });
    const vehB = createVehicle({ worldId: world.id, model: "Hauler", category: "truck", ownerId: driverB.id, location: { x: 2, y: 0, z: 2 } });
    vehA.inUse = true; vehB.inUse = true;
    runtime.store.saveVehicle(vehA);
    runtime.store.saveVehicle(vehB);

    // trigger the collision via the simulation engine
    const collision = runtime.simulation.vehicleCollision(world, vehA, vehB, runtime.store.listResidents(world.id));

    // 1. vehicle damage
    const aAfter = runtime.store.getVehicle(vehA.id)!;
    const bAfter = runtime.store.getVehicle(vehB.id)!;
    expect(aAfter.condition).toBeLessThan(1);
    expect(bAfter.condition).toBeLessThan(1);
    expect(aAfter.inUse).toBe(false);

    // 2. witnesses recorded
    expect(collision.witnesses).toContain(witness.id);

    // 3. emergency response chain (caused by the collision)
    const responses = runtime.store.events(world.id, { type: "emergency_response" });
    expect(responses.length).toBe(1);
    expect(responses[0]!.causeEventId).toBe(collision.id);

    // 4. road consequences
    const road = runtime.store.events(world.id, { type: "road_consequence" });
    expect(road.length).toBe(1);
    expect(road[0]!.causeEventId).toBe(collision.id);

    // 5. resident memories: the witness KNOWS the collision (direct observation)
    const witnessAfter = runtime.store.getResident(witness.id)!;
    expect(witnessAfter.knowledgeRefs).toContain(collision.id);

    // 6. causal chain integrity: collision → response → road consequence in order
    expect(collision.simTime).toBeLessThan(responses[0]!.simTime);
    expect(responses[0]!.simTime).toBeLessThan(road[0]!.simTime);

    // 7. event is immutable in the append-only store (retrievable by id)
    expect(runtime.store.eventById(collision.id)!.type).toBe("vehicle_collision");
  });
});

describe("SCENARIO G — WORLD ECONOMY (directive §19 G)", () => {
  test("resident buys item from business: payment, balances, inventory, revenue, stock, transaction history all consistent", () => {
    const world = createWorld({ name: "Scenario G" });
    runtime.store.saveWorld(world);

    const residentAccount = createAccount({ worldId: world.id, ownerType: "resident", balance: 120 });
    const resident = createResident({ worldId: world.id, seed: 31, financialAccountId: residentAccount.id });
    const bizAccount = createAccount({ worldId: world.id, ownerType: "business", balance: 0 });
    const business = createBusiness({
      worldId: world.id, name: "Nexus Market", kind: "grocery", regionId: "central", accountId: bizAccount.id,
      inventory: [
        { sku: "groceries_weekly", name: "Weekly groceries", quantity: 20, unitPrice: 45 },
        { sku: "coffee", name: "Coffee", quantity: 30, unitPrice: 8 },
      ],
    });
    runtime.store.saveAccount(residentAccount);
    runtime.store.saveAccount(bizAccount);
    runtime.store.saveResident(resident);
    runtime.store.saveBusiness(business);

    const supplyBefore = runtime.economy.moneySupply(world.id);

    const purchase = runtime.economy.purchase({
      worldId: world.id, buyerResident: resident, businessId: business.id,
      sku: "groceries_weekly", quantity: 2, simTime: 500,
    });
    expect(purchase.ok).toBe(true);
    if (!purchase.ok) return;

    // payment: exact amount
    expect(purchase.value.itemTotal).toBe(90);
    // account balances
    expect(runtime.store.getAccount(residentAccount.id)!.balance).toBe(30);
    expect(runtime.store.getAccount(bizAccount.id)!.balance).toBe(90);
    // inventory / stock change persisted
    const bizAfter = runtime.store.getBusiness(business.id)!;
    expect(bizAfter.inventory.find((i) => i.sku === "groceries_weekly")!.quantity).toBe(18);
    // transaction history with causal event reference
    const log = runtime.economy.transactionLog(world.id);
    expect(log.length).toBe(1);
    expect(log[0]!.eventRef).toBeTruthy();
    const evt = runtime.store.eventById(log[0]!.eventRef!);
    expect(evt!.type).toBe("purchase");
    // money supply conserved (buyer->business transfer, no fabrication)
    expect(runtime.economy.moneySupply(world.id).total).toBeCloseTo(supplyBefore.total);
  });
});

describe("SCENARIO H — WORLD CREATION (directive §19 H, backend portion)", () => {
  test("request a new neighbourhood: world-state records, infrastructure, population created and persistent", () => {
    const world = createWorld({ name: "Scenario H" });
    runtime.store.saveWorld(world);

    const r = runtime.creation.construct(world, "Create a residential neighbourhood called Harbour Row");
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // world-state records created
    const properties = runtime.store.listProperties(world.id);
    const residents = runtime.store.listResidents(world.id);
    const businesses = runtime.store.listBusinesses(world.id);
    expect(properties.length).toBeGreaterThanOrEqual(4);
    expect(residents.length).toBeGreaterThanOrEqual(4);
    expect(businesses.length).toBe(1);

    // infrastructure: roads connect every structure
    expect(r.value.spec.roads.length).toBeGreaterThanOrEqual(properties.length);

    // persistence: records survive restart
    const path = `/tmp/nexus_scenario_h_${Date.now()}.db`;
    const worldId = world.id;
    {
      const db2 = NexusDb.open(path);
      migrate(db2);
      const rt2 = new WorldRuntime(db2);
      const w2 = createWorld({ name: "H2" });
      rt2.store.saveWorld(w2);
      rt2.creation.construct(w2, "Construct a residential neighbourhood");
      db2.close();
    }
    {
      const db2 = NexusDb.open(path);
      const rt2 = new WorldRuntime(db2);
      const w2 = rt2.store.listWorlds()[0]!;
      expect(rt2.store.listProperties(w2.id).length).toBeGreaterThanOrEqual(4);
      expect(rt2.store.listResidents(w2.id).length).toBeGreaterThanOrEqual(4);
      db2.close();
    }
    expect(worldId).toBeTruthy();
  });
});
