/**
 * World store — entity persistence + causal event history + snapshots +
 * restart recovery (directive §7.1, §7.5, §11).
 *
 * Invariants:
 *  - Every authoritative state change appends a WorldEvent (append-only).
 *  - Entity projections are write-through: state lives in the entity tables,
 *    and snapshots are verified consistency checkpoints. On restart, if the
 *    live world is BEHIND the last checkpoint (torn write), the checkpoint is
 *    restored so state never regresses. Events after a snapshot are retained
 *    for audit; there is no event-sourced projection rebuild today (registry
 *    WLD-9 tracks that as outstanding work — do not claim replay).
 *  - Knowledge propagation is explicit: residents only know events recorded
 *    for them (world_truth vs direct_observation vs reported/rumour).
 */
import { nexusId, ID_PREFIXES, safeJsonStringify, ok, err, NexusError, type Result } from "@nexus/core";
import type { WorldEvent } from "@nexus/contracts";
import type { NexusDb } from "@nexus/db";
import { EventStoreRepo, SnapshotRepo } from "@nexus/db";
import type { World, Resident, Vehicle, Property, Business, Account } from "./entities";

export interface SnapshotContents {
  world: World;
  residents: Resident[];
  vehicles: Vehicle[];
  properties: Property[];
  businesses: Business[];
  accounts: Account[];
}

export class WorldStore {
  private readonly eventRepo: EventStoreRepo;
  private readonly snapshotRepo: SnapshotRepo;
  constructor(readonly db: NexusDb) {
    this.eventRepo = new EventStoreRepo(db);
    this.snapshotRepo = new SnapshotRepo(db);
  }

  // -------------------------------------------------------------------------
  // Entities (materialised projections backed by relational tables)
  // -------------------------------------------------------------------------

  saveWorld(w: World): void {
    this.db.run(
      `INSERT INTO worlds (id, name, sim_time, doc) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, sim_time=excluded.sim_time, doc=excluded.doc`,
      w.id, w.name, w.simulationTime, safeJsonStringify(w),
    );
  }
  getWorld(worldId: string): World | null {
    const row = this.db.get<{ doc: string }>("SELECT doc FROM worlds WHERE id = ?", worldId);
    return row ? (JSON.parse(row.doc) as World) : null;
  }
  listWorlds(): World[] {
    return this.db.all<{ doc: string }>("SELECT doc FROM worlds").map((r) => JSON.parse(r.doc) as World);
  }

  saveResident(r: Resident): void {
    this.db.run(
      `INSERT INTO residents (id, world_id, name, fidelity, alive, activity, doc) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET fidelity=excluded.fidelity, alive=excluded.alive, activity=excluded.activity, doc=excluded.doc`,
      r.id, r.worldId, `${r.name.first} ${r.name.last}`, r.fidelity, r.alive ? 1 : 0, r.currentActivity, safeJsonStringify(r),
    );
  }
  getResident(id: string): Resident | null {
    const row = this.db.get<{ doc: string }>("SELECT doc FROM residents WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as Resident) : null;
  }
  listResidents(worldId: string): Resident[] {
    return this.db.all<{ doc: string }>("SELECT doc FROM residents WHERE world_id = ? ORDER BY id", worldId)
      .map((r) => JSON.parse(r.doc) as Resident);
  }

  saveVehicle(v: Vehicle): void {
    this.db.run(
      `INSERT INTO vehicles (id, world_id, model, owner_id, in_use, doc) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, in_use=excluded.in_use, doc=excluded.doc`,
      v.id, v.worldId, v.model, v.ownerId ?? null, v.inUse ? 1 : 0, safeJsonStringify(v),
    );
  }
  getVehicle(id: string): Vehicle | null {
    const row = this.db.get<{ doc: string }>("SELECT doc FROM vehicles WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as Vehicle) : null;
  }
  listVehicles(worldId: string): Vehicle[] {
    return this.db.all<{ doc: string }>("SELECT doc FROM vehicles WHERE world_id = ?", worldId)
      .map((r) => JSON.parse(r.doc) as Vehicle);
  }

  saveProperty(p: Property): void {
    this.db.run(
      `INSERT INTO properties (id, world_id, type, region_id, owner_id, valuation, doc) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, valuation=excluded.valuation, doc=excluded.doc`,
      p.id, p.worldId, p.type, p.regionId, p.ownerId ?? null, p.valuation, safeJsonStringify(p),
    );
  }
  getProperty(id: string): Property | null {
    const row = this.db.get<{ doc: string }>("SELECT doc FROM properties WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as Property) : null;
  }
  listProperties(worldId: string): Property[] {
    return this.db.all<{ doc: string }>("SELECT doc FROM properties WHERE world_id = ?", worldId)
      .map((r) => JSON.parse(r.doc) as Property);
  }

  saveBusiness(b: Business): void {
    this.db.run(
      `INSERT INTO businesses (id, world_id, name, kind, account_id, doc) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET doc=excluded.doc`,
      b.id, b.worldId, b.name, b.kind, b.accountId, safeJsonStringify(b),
    );
  }
  getBusiness(id: string): Business | null {
    const row = this.db.get<{ doc: string }>("SELECT doc FROM businesses WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as Business) : null;
  }
  listBusinesses(worldId: string): Business[] {
    return this.db.all<{ doc: string }>("SELECT doc FROM businesses WHERE world_id = ?", worldId)
      .map((r) => JSON.parse(r.doc) as Business);
  }

  saveAccount(a: Account): void {
    this.db.run(
      `INSERT INTO accounts (id, world_id, owner_type, balance, doc) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET balance=excluded.balance, doc=excluded.doc`,
      a.id, a.worldId, a.ownerType, a.balance, safeJsonStringify(a),
    );
  }
  getAccount(id: string): Account | null {
    const row = this.db.get<{ doc: string }>("SELECT doc FROM accounts WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as Account) : null;
  }
  listAccounts(worldId: string): Account[] {
    return this.db.all<{ doc: string }>("SELECT doc FROM accounts WHERE world_id = ?", worldId)
      .map((r) => JSON.parse(r.doc) as Account);
  }

  // -------------------------------------------------------------------------
  // Causal event history (append-only, idempotent)
  // -------------------------------------------------------------------------

  recordEvent(evt: Omit<WorldEvent, "id" | "participants" | "witnesses" | "evidence" | "effects" | "knowledge">
      & Partial<Pick<WorldEvent, "participants" | "witnesses" | "evidence" | "effects" | "knowledge">>
      & { id?: string }): WorldEvent {
    const full: WorldEvent = {
      participants: [], witnesses: [], evidence: [], effects: [], knowledge: [],
      ...evt,
      id: evt.id ?? nexusId(ID_PREFIXES.event),
    } as WorldEvent;
    this.eventRepo.appendIdempotent({
      id: full.id, worldId: full.worldId, type: full.type, simTime: full.simTime, doc: full,
    });
    return full;
  }

  events(worldId: string, opts?: { afterSeq?: number; type?: string; limit?: number }) {
    if (opts?.type) return this.eventRepo.eventsByType(worldId, opts.type, opts.limit ?? 1000).map((e) => e.doc as WorldEvent);
    return this.eventRepo.eventsAfter(worldId, opts?.afterSeq ?? 0, opts?.limit ?? 10_000).map((e) => e.doc as WorldEvent);
  }

  eventById(id: string): WorldEvent | null {
    const row = this.db.get<{ doc: string }>("SELECT doc FROM world_events WHERE id = ?", id);
    return row ? (JSON.parse(row.doc) as WorldEvent) : null;
  }

  // -------------------------------------------------------------------------
  // Snapshots & recovery (directive §11)
  // -------------------------------------------------------------------------

  snapshot(worldId: string, label: string): Result<{ snapshotId: string; simTime: number; lastSeq: number }> {
    const world = this.getWorld(worldId);
    if (!world) return err(new NexusError("NOT_FOUND", `world ${worldId} not found`));
    const contents: SnapshotContents = {
      world,
      residents: this.listResidents(worldId),
      vehicles: this.listVehicles(worldId),
      properties: this.listProperties(worldId),
      businesses: this.listBusinesses(worldId),
      accounts: this.listAccounts(worldId),
    };
    const snapshotId = nexusId(ID_PREFIXES.snapshot);
    const lastSeq = this.eventRepo.latestSeq(worldId);
    this.snapshotRepo.save({
      id: snapshotId, worldId, simTime: world.simulationTime, lastSeq,
      doc: { label, contents },
    });
    return ok({ snapshotId, simTime: world.simulationTime, lastSeq });
  }

  latestSnapshot(worldId: string): { simTime: number; lastSeq: number; contents: SnapshotContents; label: string } | null {
    const snap = this.snapshotRepo.latest(worldId);
    if (!snap) return null;
    const doc = snap.doc as { label: string; contents: SnapshotContents };
    return { simTime: snap.simTime, lastSeq: snap.lastSeq, contents: doc.contents, label: doc.label };
  }

  /**
   * Restart recovery (directive §11, Scenario D). Entity state is write-through;
   * the snapshot is a verified consistency checkpoint. If the live world is
   * BEHIND the last checkpoint (torn write: crash between entity writes and
   * saveWorld), the checkpoint contents are restored — exactly, including
   * removing entities that postdate the checkpoint — so state never regresses.
   * Progress after the checkpoint is sacrificed for consistency; the events
   * remain in the append-only history for audit.
   */
  recover(worldId: string): { recoveredFromSnapshot: boolean; snapshotSimTime: number | null; replayedEvents: number; world: World | null; restoredFromSnapshot: boolean } {
    const snap = this.latestSnapshot(worldId);
    let world = this.getWorld(worldId);
    if (!world) {
      if (!snap) return { recoveredFromSnapshot: false, snapshotSimTime: null, replayedEvents: 0, world: null, restoredFromSnapshot: false };
      // world row lost entirely: rebuild from the checkpoint
      this.restoreSnapshot(worldId, snap.contents);
      world = this.getWorld(worldId);
      return { recoveredFromSnapshot: true, snapshotSimTime: snap.simTime, replayedEvents: 0, world, restoredFromSnapshot: true };
    }
    const eventsSinceSnapshot = snap ? this.events(worldId, { afterSeq: snap.lastSeq }) : [];
    let restoredFromSnapshot = false;
    if (snap && world.simulationTime < snap.simTime) {
      // torn write detected: restore the checkpoint exactly
      this.restoreSnapshot(worldId, snap.contents);
      world = this.getWorld(worldId);
      restoredFromSnapshot = true;
    }
    // events after the checkpoint are counted and retained for audit; there
    // is no event-sourced projection rebuild in the store today (WLD-9).
    return {
      recoveredFromSnapshot: snap !== null,
      snapshotSimTime: snap?.simTime ?? null,
      replayedEvents: eventsSinceSnapshot.length,
      world,
      restoredFromSnapshot,
    };
  }

  /**
   * Write a snapshot's contents back into the entity tables, exactly: rows
   * that postdate the checkpoint are removed, so restored state equals the
   * checkpoint byte-for-byte at the entity level.
   */
  private restoreSnapshot(worldId: string, contents: SnapshotContents): void {
    this.db.transaction(() => {
      this.saveWorld(contents.world);
      for (const r of contents.residents) this.saveResident(r);
      for (const v of contents.vehicles) this.saveVehicle(v);
      for (const p of contents.properties) this.saveProperty(p);
      for (const b of contents.businesses) this.saveBusiness(b);
      for (const a of contents.accounts) this.saveAccount(a);
      const deleteAbsent = (table: string, keepIds: string[]) => {
        if (keepIds.length === 0) {
          this.db.run(`DELETE FROM ${table} WHERE world_id = ?`, worldId);
        } else {
          const ph = keepIds.map(() => "?").join(", ");
          this.db.run(`DELETE FROM ${table} WHERE world_id = ? AND id NOT IN (${ph})`, worldId, ...keepIds);
        }
      };
      deleteAbsent("residents", contents.residents.map((r) => r.id));
      deleteAbsent("vehicles", contents.vehicles.map((v) => v.id));
      deleteAbsent("properties", contents.properties.map((p) => p.id));
      deleteAbsent("businesses", contents.businesses.map((b) => b.id));
      deleteAbsent("accounts", contents.accounts.map((a) => a.id));
    });
  }
}
