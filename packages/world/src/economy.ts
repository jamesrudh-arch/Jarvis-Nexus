/**
 * NEXUS Economic Intelligence (directive §7.8).
 * Transactional financial operations: accounts, transfers, salaries,
 * purchases with inventory, ownership records. Transfers are strictly
 * two-sided (no minting, no burning); salary payments are atomic and
 * idempotent per (employee, pay period) — the dedup marker commits in the
 * same transaction as the money movement, so a crash can never leave a
 * paid salary without its marker.
 */
import { nexusId, ID_PREFIXES, NexusError, err, ok, safeJsonStringify, type Result } from "@nexus/core";
import type { WorldEvent } from "@nexus/contracts";
import type { NexusDb } from "@nexus/db";
import type { WorldStore } from "./persistence";
import { createAccount } from "./entities";
import type { Account, Business, Resident } from "./entities";

export interface PaymentResult {
  transactionId: string;
  eventId: string;
  fromBalance: number | null;
  toBalance: number | null;
}

export class EconomyEngine {
  constructor(private readonly db: NexusDb, private readonly store: WorldStore) {}

  /**
   * Atomic two-sided transfer. All invariants enforced inside ONE sqlite
   * transaction: sufficient funds, positive amount, existing accounts,
   * idempotent event. One-sided transfers (minting/burning) are rejected —
   * money supply can only move between accounts, never appear or disappear.
   */
  transfer(input: {
    worldId: string;
    fromAccountId?: string;
    toAccountId?: string;
    amount: number;
    reason: string;
    simTime: number;
    causeEventId?: string;
    participants?: WorldEvent["participants"];
  }): Result<PaymentResult> {
    if (!(input.amount > 0)) return err(new NexusError("VALIDATION_ERROR", "amount must be positive"));
    if (!input.fromAccountId || !input.toAccountId) {
      return err(new NexusError("VALIDATION_ERROR", "transfer requires both from and to accounts (minting/burning is not permitted)"));
    }

    try {
      return this.db.transaction(() => {
        const from = input.fromAccountId ? this.store.getAccount(input.fromAccountId) : null;
        const to = input.toAccountId ? this.store.getAccount(input.toAccountId) : null;
        if (input.fromAccountId && !from) throw new NexusError("NOT_FOUND", `account ${input.fromAccountId} not found`);
        if (input.toAccountId && !to) throw new NexusError("NOT_FOUND", `account ${input.toAccountId} not found`);
        if (from && from.balance < input.amount) {
          throw new NexusError("CONFLICT", `insufficient funds: balance ${from.balance} < ${input.amount}`);
        }
        if (from) {
          from.balance -= input.amount;
          this.store.saveAccount(from);
        }
        if (to) {
          to.balance += input.amount;
          this.store.saveAccount(to);
        }
        const txnId = nexusId(ID_PREFIXES.txn);
        this.db.run(
          "INSERT INTO transactions (id, world_id, from_account_id, to_account_id, amount, reason, event_ref, sim_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          txnId, input.worldId, input.fromAccountId ?? null, input.toAccountId ?? null,
          input.amount, input.reason, null, input.simTime,
        );
        const evt = this.store.recordEvent({
          worldId: input.worldId,
          type: "transaction",
          simTime: input.simTime,
          cause: input.reason,
          causeEventId: input.causeEventId,
          participants: input.participants ?? [],
          effects: [
            ...(from ? [{ target: `account:${from.id}`, change: `-${input.amount}` }] : []),
            ...(to ? [{ target: `account:${to.id}`, change: `+${input.amount}` }] : []),
          ],
          payload: { transactionId: txnId, amount: input.amount, reason: input.reason },
        });
        this.db.run("UPDATE transactions SET event_ref = ? WHERE id = ?", evt.id, txnId);
        return ok({
          transactionId: txnId,
          eventId: evt.id,
          fromBalance: from ? from.balance : null,
          toBalance: to ? to.balance : null,
        });
      });
    } catch (e) {
      if (e instanceof NexusError) return err(e);
      return err(new NexusError("INTERNAL_ERROR", String(e)));
    }
  }

  /**
   * Purchase with inventory decrement — atomic: payment + stock movement +
   * ownership + causal event, or nothing (Scenario G).
   */
  purchase(input: {
    worldId: string;
    buyerResident: Resident;
    businessId: string;
    sku: string;
    quantity: number;
    simTime: number;
  }): Result<{ transactionId: string; eventId: string; itemTotal: number; buyerBalance: number; stockRemaining: number }> {
    if (!(input.quantity > 0)) return err(new NexusError("VALIDATION_ERROR", "quantity must be positive"));
    try {
      return this.db.transaction(() => {
        const business = this.store.getBusiness(input.businessId);
        if (!business) throw new NexusError("NOT_FOUND", `business ${input.businessId} not found`);
        const item = business.inventory.find((i) => i.sku === input.sku);
        if (!item) throw new NexusError("NOT_FOUND", `sku ${input.sku} not stocked by ${business.name}`);
        if (item.quantity < input.quantity) {
          throw new NexusError("CONFLICT", `insufficient stock: ${item.quantity} < ${input.quantity}`);
        }
        const buyerAccount = input.buyerResident.financialAccountId
          ? this.store.getAccount(input.buyerResident.financialAccountId)
          : null;
        if (!buyerAccount) throw new NexusError("NOT_FOUND", `buyer has no account`);
        const itemTotal = item.unitPrice * input.quantity;
        if (buyerAccount.balance < itemTotal) {
          throw new NexusError("CONFLICT", `insufficient funds: ${buyerAccount.balance} < ${itemTotal}`);
        }

        // stock movement
        item.quantity -= input.quantity;
        this.store.saveBusiness(business);

        // payment
        const pay = this.transfer({
          worldId: input.worldId,
          fromAccountId: buyerAccount.id,
          toAccountId: business.accountId,
          amount: itemTotal,
          reason: `purchase ${input.quantity}x ${item.sku} at ${business.name}`,
          simTime: input.simTime,
          participants: [{ residentId: input.buyerResident.id, role: "buyer" }],
        });
        if (!pay.ok) throw pay.error;

        const evt = this.store.recordEvent({
          worldId: input.worldId,
          type: "purchase",
          simTime: input.simTime,
          cause: `purchase at ${business.name}`,
          participants: [{ residentId: input.buyerResident.id, role: "buyer" }],
          effects: [
            { target: `inventory:${business.id}:${item.sku}`, change: `-${input.quantity}` },
            { target: `account:${business.accountId}`, change: `+${itemTotal}` },
          ],
          knowledge: [{ residentId: input.buyerResident.id, level: "direct_observation" }],
          payload: { sku: item.sku, quantity: input.quantity, itemTotal, businessId: business.id, transactionId: pay.value.transactionId },
        });
        // the transaction's causal event is the purchase (not the intermediate transfer)
        this.db.run("UPDATE transactions SET event_ref = ? WHERE id = ?", evt.id, pay.value.transactionId);

        // buyer learns the purchase happened
        const resident = this.store.getResident(input.buyerResident.id)!;
        if (!resident.knowledgeRefs.includes(evt.id)) {
          resident.knowledgeRefs.push(evt.id);
          this.store.saveResident(resident);
        }

        return ok({
          transactionId: pay.value.transactionId,
          eventId: evt.id,
          itemTotal,
          buyerBalance: pay.value.fromBalance ?? 0,
          stockRemaining: item.quantity,
        });
      });
    } catch (e) {
      if (e instanceof NexusError) return err(e);
      return err(new NexusError("INTERNAL_ERROR", String(e)));
    }
  }

  /**
   * Scheduled salary payment — atomic AND idempotent per (employee, payPeriodKey).
   * The dedup marker (kv row) is committed in the SAME transaction as the
   * money movement, so a crash can never leave a paid salary without its
   * marker: a retry after the crash sees the marker and skips. A concurrent
   * duplicate loses the kv PRIMARY KEY race and its whole transaction —
   * including the transfer — rolls back. No 10k-event scans: the marker is a
   * primary-key lookup.
   */
  paySalary(input: {
    worldId: string;
    employee: Resident;
    hours: number;
    simTime: number;
    payPeriodKey: string; // e.g. "day-42"
  }): Result<{ transactionId: string; eventId: string; amount: number } | { skipped: true; reason: string }> {
    const idempotencyKey = `salary:${input.employee.id}:${input.payPeriodKey}`;
    const dedupKey = `salary_dedup:${input.worldId}:${idempotencyKey}`;
    try {
      return this.db.transaction(() => {
        const employment = input.employee.employment;
        if (!employment || !employment.businessId) {
          throw new NexusError("VALIDATION_ERROR", "resident is not employed");
        }
        const employeeAccount = input.employee.financialAccountId
          ? this.store.getAccount(input.employee.financialAccountId)
          : null;
        if (!employeeAccount) throw new NexusError("VALIDATION_ERROR", "employee has no financial account");
        const marker = this.db.get<{ key: string }>("SELECT key FROM kv WHERE key = ?", dedupKey);
        if (marker) {
          return ok({ skipped: true, reason: `already paid for ${input.payPeriodKey} (marker ${dedupKey})` });
        }
        const business = this.store.getBusiness(employment.businessId);
        if (!business) throw new NexusError("NOT_FOUND", "employer business not found");
        const amount = Math.round(employment.salaryPerHour * input.hours * 100) / 100;
        if (amount <= 0) return ok({ skipped: true, reason: "zero salary" });

        const pay = this.transfer({
          worldId: input.worldId,
          fromAccountId: business.accountId,
          toAccountId: employeeAccount.id,
          amount,
          reason: `salary ${input.payPeriodKey} (${input.hours}h @ ${employment.salaryPerHour}/h)`,
          simTime: input.simTime,
          participants: [{ residentId: input.employee.id, role: "employee" }],
        });
        if (!pay.ok) throw pay.error;
        const evt = this.store.recordEvent({
          worldId: input.worldId,
          type: "employment_payment",
          simTime: input.simTime,
          cause: "scheduled employment payment",
          participants: [{ residentId: input.employee.id, role: "employee" }],
          effects: [{ target: `account:${employeeAccount.id}`, change: `+${amount}` }],
          knowledge: [{ residentId: input.employee.id, level: "direct_observation" }],
          payload: { idempotencyKey, amount, hours: input.hours, employeeId: input.employee.id, businessId: business.id },
        });
        // plain INSERT (no upsert): a concurrent duplicate fails the kv PRIMARY
        // KEY constraint and the whole transaction rolls back with it
        this.db.run(
          "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
          dedupKey, safeJsonStringify({ eventId: evt.id, transactionId: pay.value.transactionId, amount, at: new Date().toISOString() }),
        );
        // employee learns of the payment (resident-side knowledge, same as event.knowledge)
        const employee = this.store.getResident(input.employee.id)!;
        if (employee && !employee.knowledgeRefs.includes(evt.id)) {
          employee.knowledgeRefs.push(evt.id);
          this.store.saveResident(employee);
        }
        return ok({ transactionId: pay.value.transactionId, eventId: evt.id, amount });
      });
    } catch (e) {
      if (e instanceof NexusError) return err(e);
      return err(new NexusError("INTERNAL_ERROR", String(e)));
    }
  }

  /**
   * Property purchase with ownership transfer (directive §10.2). Money is
   * conserved: the payment moves buyer -> world treasury (institution account),
   * so unowned-asset purchases no longer destroy money. The buyer's
   * possessions record is kept in parity with vehicles.
   */
  buyProperty(input: { worldId: string; buyer: Resident; propertyId: string; simTime: number }): Result<{ eventId: string; price: number }> {
    try {
      return this.db.transaction(() => {
        const prop = this.store.getProperty(input.propertyId);
        if (!prop) throw new NexusError("NOT_FOUND", "property not found");
        if (prop.ownerId) throw new NexusError("CONFLICT", "property already owned");
        const account = input.buyer.financialAccountId ? this.store.getAccount(input.buyer.financialAccountId) : null;
        if (!account) throw new NexusError("NOT_FOUND", "buyer has no account");
        if (account.balance < prop.valuation) throw new NexusError("CONFLICT", "insufficient funds for property");
        const treasury = this.treasuryAccount(input.worldId);
        const pay = this.transfer({
          worldId: input.worldId,
          fromAccountId: account.id,
          toAccountId: treasury.id,
          amount: prop.valuation,
          reason: `property purchase ${prop.id}`,
          simTime: input.simTime,
          participants: [{ residentId: input.buyer.id, role: "buyer" }],
        });
        if (!pay.ok) throw pay.error;
        prop.ownerId = input.buyer.id;
        this.store.saveProperty(prop);
        const buyer = this.store.getResident(input.buyer.id)!;
        if (!buyer.possessionIds.includes(prop.id)) buyer.possessionIds.push(prop.id);
        this.store.saveResident(buyer);
        const evt = this.store.recordEvent({
          worldId: input.worldId,
          type: "property_purchase",
          simTime: input.simTime,
          cause: "property purchase",
          participants: [{ residentId: input.buyer.id, role: "buyer" }],
          effects: [
            { target: `property:${prop.id}`, change: `owner=${input.buyer.id}` },
            { target: `account:${treasury.id}`, change: `+${prop.valuation}` },
          ],
          knowledge: [{ residentId: input.buyer.id, level: "direct_observation" }],
          payload: { propertyId: prop.id, price: prop.valuation, buyerId: input.buyer.id, treasuryAccountId: treasury.id },
        });
        return ok({ eventId: evt.id, price: prop.valuation });
      });
    } catch (e) {
      if (e instanceof NexusError) return err(e);
      return err(new NexusError("INTERNAL_ERROR", String(e)));
    }
  }

  /**
   * Vehicle purchase with ownership + possession records (directive §10.3).
   * Money is conserved: buyer -> world treasury (institution account).
   */
  buyVehicle(input: { worldId: string; buyer: Resident; vehicleId: string; price?: number; simTime: number }): Result<{ eventId: string; price: number }> {
    try {
      return this.db.transaction(() => {
        const vehicle = this.store.getVehicle(input.vehicleId);
        if (!vehicle) throw new NexusError("NOT_FOUND", "vehicle not found");
        if (vehicle.ownerId) throw new NexusError("CONFLICT", "vehicle already owned");
        const price = input.price ?? Math.round(10_000 + vehicle.model.length * 1000);
        const account = input.buyer.financialAccountId ? this.store.getAccount(input.buyer.financialAccountId) : null;
        if (!account) throw new NexusError("NOT_FOUND", "buyer has no account");
        if (account.balance < price) throw new NexusError("CONFLICT", "insufficient funds for vehicle");
        const treasury = this.treasuryAccount(input.worldId);
        const pay = this.transfer({
          worldId: input.worldId, fromAccountId: account.id, toAccountId: treasury.id,
          amount: price, reason: `vehicle purchase ${vehicle.id}`, simTime: input.simTime,
          participants: [{ residentId: input.buyer.id, role: "buyer" }],
        });
        if (!pay.ok) throw pay.error;
        vehicle.ownerId = input.buyer.id;
        this.store.saveVehicle(vehicle);
        const buyer = this.store.getResident(input.buyer.id)!;
        if (!buyer.possessionIds.includes(vehicle.id)) buyer.possessionIds.push(vehicle.id);
        this.store.saveResident(buyer);
        const evt = this.store.recordEvent({
          worldId: input.worldId, type: "vehicle_purchase", simTime: input.simTime,
          cause: "vehicle purchase", participants: [{ residentId: input.buyer.id, role: "buyer" }],
          effects: [
            { target: `vehicle:${vehicle.id}`, change: `owner=${input.buyer.id}` },
            { target: `account:${treasury.id}`, change: `+${price}` },
          ],
          knowledge: [{ residentId: input.buyer.id, level: "direct_observation" }],
          payload: { vehicleId: vehicle.id, price, treasuryAccountId: treasury.id },
        });
        return ok({ eventId: evt.id, price });
      });
    } catch (e) {
      if (e instanceof NexusError) return err(e);
      return err(new NexusError("INTERNAL_ERROR", String(e)));
    }
  }

  /**
   * World treasury (institution account) — the counterparty for unowned-asset
   * purchases so money is conserved: buyer -> treasury moves the supply, it
   * never destroys it. Reuses the Account.ownerType=institution seam (WLD-11).
   */
  private treasuryAccount(worldId: string): Account {
    const existing = this.store.listAccounts(worldId).find((a) => a.ownerType === "institution");
    if (existing) return existing;
    const treasury = createAccount({ worldId, ownerType: "institution", balance: 0 });
    this.store.saveAccount(treasury);
    return treasury;
  }

  /** Money supply audit — detects unbounded money creation. */
  moneySupply(worldId: string): { total: number; accounts: number; transactions: number } {
    const accounts = this.store.listAccounts(worldId);
    const txnCount = this.db.count("SELECT COUNT(*) AS n FROM transactions WHERE world_id = ?", worldId);
    return {
      total: Math.round(accounts.reduce((s, a) => s + a.balance, 0) * 100) / 100,
      accounts: accounts.length,
      transactions: txnCount,
    };
  }

  transactionLog(worldId: string, limit = 100): Array<{ id: string; from: string | null; to: string | null; amount: number; reason: string; simTime: number; eventRef: string | null }> {
    return this.db.all<{
      id: string; from_account_id: string | null; to_account_id: string | null;
      amount: number; reason: string; sim_time: number; event_ref: string | null;
    }>("SELECT * FROM transactions WHERE world_id = ? ORDER BY sim_time DESC LIMIT ?", worldId, limit)
      .map((r) => ({
        id: r.id, from: r.from_account_id, to: r.to_account_id,
        amount: Number(r.amount), reason: r.reason, simTime: Number(r.sim_time), eventRef: r.event_ref,
      }));
  }
}
