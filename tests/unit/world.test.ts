import { describe, expect, test, beforeEach } from "bun:test";
import { NexusDb, migrate, EventStoreRepo } from "@nexus/db";
import {
  WorldRuntime, createWorld, createResident, createAccount, createBusiness,
  createProperty, createVehicle, residentFullName,
} from "@nexus/world";

let db: NexusDb;
let runtime: WorldRuntime;

beforeEach(() => {
  db = NexusDb.open(":memory:");
  migrate(db);
  runtime = new WorldRuntime(db);
});

describe("world construction (Scenario H backend)", () => {
  test("constructs a residential neighbourhood with homes, residents, business, roads", () => {
    const world = createWorld({ name: "Nexus Prime" });
    runtime.store.saveWorld(world);
    const r = runtime.creation.construct(world, "Construct a residential neighbourhood with 8 homes");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.spec.kind).toBe("residential_neighbourhood");
    expect(r.value.created.residents).toBeGreaterThanOrEqual(4);
    expect(r.value.created.properties).toBeGreaterThanOrEqual(4);
    expect(r.value.created.businesses).toBe(1);
    expect(r.value.spec.roads.length).toBeGreaterThan(3);
    // world state persisted
    expect(runtime.store.listResidents(world.id).length).toBe(r.value.created.residents);
    expect(runtime.store.listProperties(world.id).length).toBe(r.value.created.properties);
    // construction event recorded
    const events = runtime.store.events(world.id, { type: "world_construction" });
    expect(events.length).toBe(1);
    // region added
    expect(world.regions.length).toBe(2);
  });

  test("racing circuit builds track segments and club vehicles", () => {
    const world = createWorld({ name: "Nexus Prime" });
    runtime.store.saveWorld(world);
    const r = runtime.creation.construct(world, "Build a racing circuit");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.spec.kind).toBe("racing_circuit");
    expect(runtime.store.listVehicles(world.id).length).toBeGreaterThanOrEqual(2);
  });
});

describe("economy (Scenario G)", () => {
  test("purchase: payment + inventory + revenue + causal event, atomically", () => {
    const world = createWorld({ name: "EcoTest" });
    runtime.store.saveWorld(world);
    const buyerAccount = createAccount({ worldId: world.id, ownerType: "resident", balance: 500 });
    const buyer = createResident({ worldId: world.id, seed: 42, financialAccountId: buyerAccount.id });
    const bizAccount = createAccount({ worldId: world.id, ownerType: "business", balance: 0 });
    const biz = createBusiness({
      worldId: world.id, name: "Market", kind: "grocery", regionId: "central", accountId: bizAccount.id,
      inventory: [{ sku: "bread", name: "Bread", quantity: 10, unitPrice: 3.5 }],
    });
    runtime.store.saveAccount(buyerAccount);
    runtime.store.saveAccount(bizAccount);
    runtime.store.saveResident(buyer);
    runtime.store.saveBusiness(biz);

    const before = runtime.economy.moneySupply(world.id);
    const r = runtime.economy.purchase({
      worldId: world.id, buyerResident: buyer, businessId: biz.id, sku: "bread", quantity: 4, simTime: 1000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.itemTotal).toBeCloseTo(14);
    expect(r.value.stockRemaining).toBe(6);
    // balances moved
    expect(runtime.store.getAccount(buyerAccount.id)!.balance).toBeCloseTo(486);
    expect(runtime.store.getAccount(bizAccount.id)!.balance).toBeCloseTo(14);
    // money conserved (business revenue == buyer debit)
    const after = runtime.economy.moneySupply(world.id);
    expect(after.total).toBeCloseTo(before.total);
    // transaction recorded with event ref
    expect(runtime.economy.transactionLog(world.id).length).toBe(1);
    // buyer knows the purchase
    const updatedBuyer = runtime.store.getResident(buyer.id)!;
    expect(updatedBuyer.knowledgeRefs).toContain(r.value.eventId);
    // inventory persisted
    expect(runtime.store.getBusiness(biz.id)!.inventory[0]!.quantity).toBe(6);
  });

  test("purchase fails cleanly on insufficient stock without partial effects", () => {
    const world = createWorld({ name: "EcoFail" });
    runtime.store.saveWorld(world);
    const buyerAccount = createAccount({ worldId: world.id, ownerType: "resident", balance: 10_000 });
    const buyer = createResident({ worldId: world.id, seed: 7, financialAccountId: buyerAccount.id });
    const bizAccount = createAccount({ worldId: world.id, ownerType: "business", balance: 0 });
    const biz = createBusiness({
      worldId: world.id, name: "Market", kind: "grocery", regionId: "central", accountId: bizAccount.id,
      inventory: [{ sku: "bread", name: "Bread", quantity: 2, unitPrice: 3.5 }],
    });
    runtime.store.saveAccount(buyerAccount);
    runtime.store.saveAccount(bizAccount);
    runtime.store.saveResident(buyer);
    runtime.store.saveBusiness(biz);

    const r = runtime.economy.purchase({ worldId: world.id, buyerResident: buyer, businessId: biz.id, sku: "bread", quantity: 5, simTime: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code ?? "CONFLICT").toBeTruthy();
    }
    // nothing changed
    expect(runtime.store.getAccount(buyerAccount.id)!.balance).toBe(10_000);
    expect(runtime.store.getBusiness(biz.id)!.inventory[0]!.quantity).toBe(2);
    expect(runtime.economy.transactionLog(world.id).length).toBe(0);
  });

  test("salary payment is idempotent per pay period", () => {
    const world = createWorld({ name: "Salary" });
    runtime.store.saveWorld(world);
    const empAccount = createAccount({ worldId: world.id, ownerType: "resident", balance: 0 });
    const emp = createResident({
      worldId: world.id, seed: 3, financialAccountId: empAccount.id,
      employment: { businessId: undefined, role: "cashier", salaryPerHour: 20, schedule: { startHour: 9, endHour: 17, days: [1, 2, 3, 4, 5] } },
    });
    const bizAccount = createAccount({ worldId: world.id, ownerType: "business", balance: 100_000 });
    const biz = createBusiness({ worldId: world.id, name: "Shop", kind: "retail", regionId: "central", accountId: bizAccount.id });
    emp.employment!.businessId = biz.id;
    runtime.store.saveAccount(empAccount); runtime.store.saveAccount(bizAccount);
    runtime.store.saveResident(emp); runtime.store.saveBusiness(biz);

    const p1 = runtime.economy.paySalary({ worldId: world.id, employee: emp, hours: 8, simTime: 1000, payPeriodKey: "day-1" });
    expect(p1.ok).toBe(true);
    if (p1.ok && !("skipped" in p1.value)) expect(p1.value.amount).toBe(160);
    const p2 = runtime.economy.paySalary({ worldId: world.id, employee: emp, hours: 8, simTime: 2000, payPeriodKey: "day-1" });
    expect(p2.ok).toBe(true);
    if (p2.ok) expect("skipped" in p2.value).toBe(true);
    expect(runtime.store.getAccount(empAccount.id)!.balance).toBe(160); // paid once
  });
});

describe("life engine (Scenario E)", () => {
  test("residents autonomously perform daily activities", () => {
    const world = createWorld({ name: "Life", startSimTime: 7 * 3_600_000 }); // 07:00
    runtime.store.saveWorld(world);
    const r1 = createResident({ worldId: world.id, seed: 1 });
    const r2 = createResident({ worldId: world.id, seed: 2 });
    runtime.store.saveResident(r1);
    runtime.store.saveResident(r2);

    // sample activities across a full sim-day (144 ticks x 10 min)
    const observed = new Set<string>();
    for (let i = 0; i < 12; i++) {
      runtime.simulation.advance(world, { ticks: 12 });
      for (const r of runtime.store.listResidents(world.id)) observed.add(r.currentActivity);
    }
    expect(observed.size).toBeGreaterThanOrEqual(3); // daily variety: sleep, eat, leisure...
    const report = runtime.simulation.advance(world, { ticks: 1 });
    expect(report.simTimeAfter).toBeGreaterThan(report.simTimeBefore);
    // needs evolve
    const r1After = runtime.store.getResident(r1.id)!;
    expect(r1After.needs.energy).toBeLessThan(100);
  });

  test("social encounter creates relationship + mutual knowledge", () => {
    const world = createWorld({ name: "Social" });
    runtime.store.saveWorld(world);
    const a = createResident({ worldId: world.id, seed: 5, position: { x: 0, y: 0, z: 0 } });
    const b = createResident({ worldId: world.id, seed: 6, position: { x: 3, y: 0, z: 3 } });
    runtime.store.saveResident(a);
    runtime.store.saveResident(b);

    const evtId = runtime.life.socialise(world, a, b);
    const evt = runtime.store.eventById(evtId)!;
    expect(evt.type).toBe("social_encounter");
    const aAfter = runtime.store.getResident(a.id)!;
    const bAfter = runtime.store.getResident(b.id)!;
    expect(aAfter.relationshipIds).toContain(b.id);
    expect(bAfter.relationshipIds).toContain(a.id);
    expect(aAfter.knowledgeRefs).toContain(evtId);
    expect(bAfter.knowledgeRefs).toContain(evtId);
    // both know the event; an unrelated resident does NOT (knowledge isolation)
    const c = createResident({ worldId: world.id, seed: 9, position: { x: 500, y: 0, z: 500 } });
    runtime.store.saveResident(c);
    const knowledge = runtime.life.residentKnowledge(world.id, runtime.store.getResident(c.id)!);
    expect(knowledge.length).toBe(0);
  });
});

describe("fidelity tiers (directive §7.3)", () => {
  test("residents are assigned fidelity by distance and tick at tier cadence", () => {
    const world = createWorld({ name: "Fidelity" });
    runtime.store.saveWorld(world);
    const near = createResident({ worldId: world.id, seed: 1, position: { x: 10, y: 0, z: 10 } });
    const mid = createResident({ worldId: world.id, seed: 2, position: { x: 150, y: 0, z: 0 } });
    const far = createResident({ worldId: world.id, seed: 3, position: { x: 900, y: 0, z: 900 } });
    for (const r of [near, mid, far]) runtime.store.saveResident(r);

    const report = runtime.simulation.advance(world, { ticks: 10 });
    expect(report.residentsHigh).toBe(1);
    expect(report.residentsMedium).toBe(1);
    expect(report.residentsAbstract).toBe(1);
  });
});

describe("persistence & recovery (Scenario D)", () => {
  test("world state + history survive a full restart (db close/reopen)", () => {
    const path = `/tmp/nexus_world_test_${Date.now()}.db`;
    {
      const db2 = NexusDb.open(path);
      migrate(db2);
      const rt2 = new WorldRuntime(db2);
      const world = createWorld({ name: "Persist" });
      rt2.store.saveWorld(world);
      const r = rt2.creation.construct(world, "Construct a residential neighbourhood");
      expect(r.ok).toBe(true);
      rt2.simulation.advance(world, { ticks: 12 });
      rt2.store.snapshot(world.id, "pre-restart");
      db2.close();
    }
    {
      const db2 = NexusDb.open(path);
      migrate(db2);
      const rt2 = new WorldRuntime(db2);
      const worlds = rt2.store.listWorlds();
      expect(worlds.length).toBe(1);
      const world = worlds[0]!;
      const recovery = rt2.store.recover(world.id);
      expect(recovery.recoveredFromSnapshot).toBe(true);
      expect(recovery.world!.name).toBe("Persist");
      // entities survived
      expect(rt2.store.listResidents(world.id).length).toBeGreaterThan(0);
      expect(rt2.store.listProperties(world.id).length).toBeGreaterThan(0);
      // history survived
      const events = rt2.store.events(world.id);
      expect(events.length).toBeGreaterThan(0);
      // idempotent event append after restart
      const evt = events[0]!;
      const result = new EventStoreRepo(db2).appendIdempotent({ id: evt.id, worldId: evt.worldId, type: evt.type, simTime: evt.simTime, doc: evt });
      expect(result.duplicate).toBe(true);
      db2.close();
    }
  });
});
