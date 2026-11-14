import { describe, expect, test, beforeEach } from "bun:test";
import { NexusDb, migrate } from "@nexus/db";
import {
  WorldRuntime, createWorld, createResident, createAccount, createBusiness, createProperty, createVehicle,
} from "@nexus/world";

/**
 * Economy conservation regressions (2026-11-14 audit):
 *  - transfers are strictly two-sided (no minting, no burning)
 *  - buyProperty/buyVehicle conserve money (buyer -> world treasury) and
 *    record possessions in parity
 *  - paySalary is atomic AND idempotent: the kv marker commits with the money;
 *    a marker present (without the event) still blocks re-payment
 *  - paySalary without an employee account errors instead of destroying money
 */
let db: NexusDb;
let rt: WorldRuntime;
beforeEach(() => {
  db = NexusDb.open(":memory:");
  migrate(db);
  rt = new WorldRuntime(db);
});

describe("economy conservation (directive §7.8)", () => {
  test("transfer rejects one-sided requests (minting and burning are not permitted)", () => {
    const world = createWorld({ name: "T" });
    rt.store.saveWorld(world);
    const a = createAccount({ worldId: world.id, ownerType: "resident", balance: 1_000 });
    rt.store.saveAccount(a);

    const burn = rt.economy.transfer({ worldId: world.id, fromAccountId: a.id, toAccountId: undefined, amount: 100, reason: "burn attempt", simTime: 0 });
    expect(burn.ok).toBe(false);
    expect(String((burn as { error?: { message?: string } }).error?.message)).toContain("minting/burning");

    const mint = rt.economy.transfer({ worldId: world.id, fromAccountId: undefined, toAccountId: a.id, amount: 100, reason: "mint attempt", simTime: 0 });
    expect(mint.ok).toBe(false);
    expect(String((mint as { error?: { message?: string } }).error?.message)).toContain("minting/burning");

    expect(rt.store.getAccount(a.id)?.balance).toBe(1_000); // nothing moved
  });

  test("buyProperty conserves money (buyer -> treasury) and records the possession", () => {
    const world = createWorld({ name: "T" });
    rt.store.saveWorld(world);
    const acct = createAccount({ worldId: world.id, ownerType: "resident", balance: 500_000 });
    rt.store.saveAccount(acct);
    const buyer = createResident({ worldId: world.id, seed: 7, financialAccountId: acct.id });
    rt.store.saveResident(buyer);
    const prop = createProperty({ worldId: world.id, type: "house", regionId: "r", location: { x: 0, y: 0, z: 0 }, valuation: 220_000 });
    rt.store.saveProperty(prop);

    const before = rt.economy.moneySupply(world.id).total;
    const r = rt.economy.buyProperty({ worldId: world.id, buyer, propertyId: prop.id, simTime: 1_000 });
    expect(r.ok).toBe(true);

    // conservation: the money MOVED (buyer -> treasury), supply unchanged
    expect(rt.economy.moneySupply(world.id).total).toBe(before);
    const treasury = rt.store.listAccounts(world.id).find((a) => a.ownerType === "institution");
    expect(treasury?.balance).toBe(220_000);
    expect(rt.store.getAccount(acct.id)?.balance).toBe(280_000);

    // ownership + possession records
    expect(rt.store.getProperty(prop.id)?.ownerId).toBe(buyer.id);
    const savedBuyer = rt.store.getResident(buyer.id)!;
    expect(savedBuyer.possessionIds.includes(prop.id)).toBe(true);
  });

  test("buyVehicle conserves money (buyer -> treasury) and records the possession", () => {
    const world = createWorld({ name: "T" });
    rt.store.saveWorld(world);
    const acct = createAccount({ worldId: world.id, ownerType: "resident", balance: 100_000 });
    rt.store.saveAccount(acct);
    const buyer = createResident({ worldId: world.id, seed: 8, financialAccountId: acct.id });
    rt.store.saveResident(buyer);
    const vehicle = createVehicle({ worldId: world.id, model: "Vector GT", category: "sports", location: { x: 0, y: 0, z: 0 } });
    rt.store.saveVehicle(vehicle);

    const before = rt.economy.moneySupply(world.id).total;
    const r = rt.economy.buyVehicle({ worldId: world.id, buyer, vehicleId: vehicle.id, price: 20_000, simTime: 1_000 });
    expect(r.ok).toBe(true);

    expect(rt.economy.moneySupply(world.id).total).toBe(before); // conserved
    const treasury = rt.store.listAccounts(world.id).find((a) => a.ownerType === "institution");
    expect(treasury?.balance).toBe(20_000);
    const savedBuyer = rt.store.getResident(buyer.id)!;
    expect(savedBuyer.possessionIds.includes(vehicle.id)).toBe(true);
  });

  test("paySalary is idempotent per pay period and the marker is atomic with the payment", () => {
    const world = createWorld({ name: "T" });
    rt.store.saveWorld(world);
    const bizAcct = createAccount({ worldId: world.id, ownerType: "business", balance: 100_000 });
    rt.store.saveAccount(bizAcct);
    const shop = createBusiness({ worldId: world.id, name: "Corner Market", kind: "grocery", regionId: "r", accountId: bizAcct.id, inventory: [] });
    rt.store.saveBusiness(shop);
    const empAcct = createAccount({ worldId: world.id, ownerType: "resident", balance: 0 });
    rt.store.saveAccount(empAcct);
    const employee = createResident({
      worldId: world.id, seed: 9, financialAccountId: empAcct.id,
      employment: { businessId: shop.id, role: "shopkeeper", salaryPerHour: 20, schedule: { startHour: 8, endHour: 17, days: [1, 2, 3, 4, 5] } },
    });
    rt.store.saveResident(employee);

    const before = rt.economy.moneySupply(world.id).total;
    const first = rt.economy.paySalary({ worldId: world.id, employee, hours: 8, simTime: 1_000, payPeriodKey: "day-1" });
    if (!first.ok) throw new Error(String(first.error.message));
    expect((first.value as { amount: number }).amount).toBe(160);
    expect(rt.store.getAccount(empAcct.id)?.balance).toBe(160);

    // retry for the same period: skipped, nothing moves (the crash-window
    // double-pay defect is gone — the marker committed WITH the payment)
    const second = rt.economy.paySalary({ worldId: world.id, employee, hours: 8, simTime: 2_000, payPeriodKey: "day-1" });
    if (!second.ok) throw new Error(String(second.error.message));
    expect((second.value as { skipped?: boolean }).skipped).toBe(true);
    expect(rt.store.getAccount(empAcct.id)?.balance).toBe(160);
    expect(rt.store.getAccount(bizAcct.id)?.balance).toBe(100_000 - 160);
    expect(rt.economy.moneySupply(world.id).total).toBe(before); // conserved end-to-end

    // a different period pays normally
    const third = rt.economy.paySalary({ worldId: world.id, employee, hours: 8, simTime: 86_400_000, payPeriodKey: "day-2" });
    if (!third.ok) throw new Error(String(third.error.message));
    expect((third.value as { amount: number }).amount).toBe(160);
    expect(rt.store.getAccount(empAcct.id)?.balance).toBe(320);
  });

  test("a pre-existing dedup marker (without the event) still blocks re-payment", () => {
    const world = createWorld({ name: "T" });
    rt.store.saveWorld(world);
    const bizAcct = createAccount({ worldId: world.id, ownerType: "business", balance: 100_000 });
    rt.store.saveAccount(bizAcct);
    const shop = createBusiness({ worldId: world.id, name: "Corner Market", kind: "grocery", regionId: "r", accountId: bizAcct.id, inventory: [] });
    rt.store.saveBusiness(shop);
    const empAcct = createAccount({ worldId: world.id, ownerType: "resident", balance: 0 });
    rt.store.saveAccount(empAcct);
    const employee = createResident({
      worldId: world.id, seed: 10, financialAccountId: empAcct.id,
      employment: { businessId: shop.id, role: "shopkeeper", salaryPerHour: 20, schedule: { startHour: 8, endHour: 17, days: [1, 2, 3, 4, 5] } },
    });
    rt.store.saveResident(employee);

    // simulate the marker surviving without the event (partial state):
    db.run(
      "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      `salary_dedup:${world.id}:salary:${employee.id}:day-1`, "{}",
    );
    const r = rt.economy.paySalary({ worldId: world.id, employee, hours: 8, simTime: 1_000, payPeriodKey: "day-1" });
    if (!r.ok) throw new Error(String(r.error.message));
    expect((r.value as { skipped?: boolean }).skipped).toBe(true);
    expect(rt.store.getAccount(empAcct.id)?.balance).toBe(0); // nothing re-paid
  });

  test("paySalary without an employee account errors instead of destroying money", () => {
    const world = createWorld({ name: "T" });
    rt.store.saveWorld(world);
    const bizAcct = createAccount({ worldId: world.id, ownerType: "business", balance: 100_000 });
    rt.store.saveAccount(bizAcct);
    const shop = createBusiness({ worldId: world.id, name: "Corner Market", kind: "grocery", regionId: "r", accountId: bizAcct.id, inventory: [] });
    rt.store.saveBusiness(shop);
    const employee = createResident({
      worldId: world.id, seed: 11,
      employment: { businessId: shop.id, role: "shopkeeper", salaryPerHour: 20, schedule: { startHour: 8, endHour: 17, days: [1, 2, 3, 4, 5] } },
    });
    rt.store.saveResident(employee);

    const before = rt.economy.moneySupply(world.id).total;
    const r = rt.economy.paySalary({ worldId: world.id, employee, hours: 8, simTime: 1_000, payPeriodKey: "day-1" });
    expect(r.ok).toBe(false);
    expect(String((r as { error?: { message?: string } }).error?.message)).toContain("employee has no financial account");
    expect(rt.economy.moneySupply(world.id).total).toBe(before); // nothing destroyed
    expect(rt.store.getAccount(bizAcct.id)?.balance).toBe(100_000);
  });
});
