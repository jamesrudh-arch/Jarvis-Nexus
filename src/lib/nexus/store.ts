/**
 * Event-sourced world store — Prisma/SQLite port of WorldStore (ADR-002).
 *
 * Contract (unchanged from the Python reference):
 * - Every state change is a WorldEvent row keyed by an idempotency key.
 * - Duplicate delivery of the same key is a no-op (unique constraint).
 * - Projections (GeoNode, Entity, Memory, Region, WorldMeta, IdCounter)
 *   are materialised by an idempotent apply layer inside the same
 *   transaction as the event insert.
 * - Full state is rebuildable from the event log alone (replay).
 *
 * Perf: applyTick() batches one tick's events into a single transaction
 * (the seed path replays thousands of ticks); append() handles
 * singletons (genesis events).
 */
import { PrismaClient } from "@prisma/client";
import { canonical } from "./hash";

type Tx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type EventInput = { tick: number; type: string; payload: Record<string, unknown> };

export interface StoredEvent {
  seq: number;
  tick: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface EntityRow {
  entity_id: string;
  entity_type: string;
  created_tick: number;
  data: Record<string, unknown>;
}

export class EventStore {
  constructor(private db: PrismaClient) {}

  // ---------------------------------------------------------------- meta
  async meta(key: string, def: string | null = null): Promise<string | null> {
    const row = await this.db.worldMeta.findUnique({ where: { key } });
    return row ? row.value : def;
  }

  async setMeta(tx: Tx, key: string, value: string) {
    await tx.worldMeta.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  get currentTick(): Promise<number> {
    return this.meta("current_tick", "0").then((v) => parseInt(v || "0", 10));
  }

  // ------------------------------------------------------------- events
  /** Append a single event (idempotent). Returns true if newly applied. */
  async append(tick: number, type: string, payload: Record<string, unknown>): Promise<boolean> {
    return this.applyBatch([{ tick, type, payload }]);
  }

  /**
   * Append a batch of events atomically. Within-batch duplicates and
   * already-stored idempotency keys are skipped (no-ops), matching the
   * Python single-writer semantics.
   */
  async applyBatch(events: EventInput[]): Promise<boolean> {
    if (events.length === 0) return false;
    let applied = false;
    await this.db.$transaction(async (tx) => {
      let seq =
        (await tx.worldEvent.aggregate({ _max: { seq: true } }))._max.seq ?? 0;
      for (const ev of events) {
        const eventId =
          (ev.payload.idempotency_key as string | undefined) ||
          crypto.randomUUID();
        const exists = await tx.worldEvent.findUnique({ where: { eventId } });
        if (exists) continue;
        seq += 1;
        await tx.worldEvent.create({
          data: {
            eventId,
            seq,
            tick: ev.tick,
            type: ev.type,
            payload: canonical(ev.payload),
          },
        });
        await this.applyEvent(tx, ev.tick, ev.type, ev.payload);
        applied = true;
      }
    });
    return applied;
  }

  /** Idempotent projection layer (port of WorldStore._apply). */
  private async applyEvent(
    tx: Tx,
    tick: number,
    type: string,
    p: Record<string, unknown>
  ): Promise<void> {
    const T = type as string;
    if (T === "world.created") {
      await this.setMeta(tx, "world_id", p.world_id as string);
      await this.setMeta(tx, "world_name", p.name as string);
      await this.setMeta(tx, "seed", String(p.seed));
      await this.setMeta(tx, "epoch_utc", p.epoch_utc as string);
      await this.setMeta(tx, "minutes_per_tick", String(p.minutes_per_tick));
      await this.setMeta(tx, "current_tick", "0");
    } else if (T === "world.tick_advanced") {
      await this.setMeta(tx, "current_tick", String(p.tick));
      await this.setMeta(tx, "sim_time_utc", p.sim_time_utc as string);
    } else if (T === "geo.node_created") {
      await tx.geoNode.create({
        data: {
          nodeId: p.node_id as string,
          parentId: (p.parent_id as string | null) ?? null,
          level: p.level as string,
          name: p.name as string,
          path: p.path as string,
          meta: canonical(p.meta ?? {}),
        },
      });
    } else if (T === "region.lease_acquired") {
      const current = parseInt(
        (await tx.worldMeta.findUnique({ where: { key: "current_tick" } }))
          ?.value ?? "0", 10);
      await tx.region.upsert({
        where: { regionId: p.region_id as string },
        create: {
          regionId: p.region_id as string,
          owner: p.owner as string,
          leaseExpiresTick: current + (p.ttl_ticks as number),
        },
        update: {
          owner: p.owner as string,
          leaseExpiresTick: current + (p.ttl_ticks as number),
        },
      });
    } else if (T === "region.lease_renewed") {
      const current = parseInt(
        (await tx.worldMeta.findUnique({ where: { key: "current_tick" } }))
          ?.value ?? "0", 10);
      await tx.region.update({
        where: { regionId: p.region_id as string },
        data: {
          owner: p.owner as string,
          leaseExpiresTick: current + (p.ttl_ticks as number),
        },
      }).catch(() => {});
    } else if (T === "entity.registered") {
      await tx.entity.create({
        data: {
          entityId: p.entity_id as string,
          entityType: p.entity_type as string,
          createdTick: tick,
          data: canonical(p.data ?? {}),
        },
      }).catch(() => {});
    } else if (T === "resident.created") {
      await tx.entity.create({
        data: {
          entityId: p.resident_id as string,
          entityType: "resident",
          createdTick: tick,
          data: canonical(p.data ?? p),
        },
      });
    } else if (T === "resident.acted") {
      await tx.entity.update({
        where: { entityId: p.resident_id as string },
        data: { data: canonical(p.data ?? p) },
      });
    } else if (T === "resident.memory_recorded") {
      await tx.memory.create({
        data: {
          memoryId: p.memory_id as string,
          residentId: p.resident_id as string,
          tick: p.tick as number,
          kind: p.kind as string,
          text: p.text as string,
          importance: (p.importance as number) ?? 1,
        },
      }).catch(() => {});
    } else if (T === "resident.communication") {
      /* world-log fact; its state effect is the memory events */
    } else if (T === "world.weather_changed") {
      await this.setMeta(tx, "weather", p.weather as string);
    } else if (T === "command.executed" || T === "command.rejected") {
      // command log projection (kept for API parity)
    } else if (T === "jarvis.identity_established") {
      // versioned identity profile → WorldMeta projection (survives restarts)
      await this.setMeta(tx, "jarvis_identity", canonical(p.identity ?? {}));
    } else if (T === "economy.salary_paid" || T === "economy.salary_missed" || T === "economy.civic_grant") {
      await updateBusinessEntity(tx, p.business_after as Record<string, unknown> | undefined);
    } else if (T === "economy.transaction_completed") {
      // seller is always a business; buyer may be a business (restock) —
      // resident buyers carry their wallet on the same tick's
      // resident.acted event (atomic within the same applyBatch).
      await updateBusinessEntity(tx, p.seller_after as Record<string, unknown> | undefined);
      if (p.buyer_after) {
        await updateBusinessEntity(tx, p.buyer_after as Record<string, unknown>);
      }
    } else if (T === "economy.purchase_skipped") {
      /* audit-only record of a real negative outcome (no state change) */
    } else {
      throw new Error(`unknown event type: ${T}`);
    }
  }

  // ---------------------------------------------------------------- ids
  /** Deterministic sequential IDs; counter is a replayable projection. */
  async allocateId(tx: Tx, prefix: string): Promise<string> {
    const row = await tx.idCounter.findUnique({ where: { prefix } });
    const n = row ? row.nextVal : 1;
    await tx.idCounter.upsert({
      where: { prefix },
      create: { prefix, nextVal: n + 1 },
      update: { nextVal: n + 1 },
    });
    return `${prefix}-${String(n).padStart(6, "0")}`;
  }

  /** In-memory variant used while assembling a tick's event batch. */
  static counterMap(db: PrismaClient) {
    return new IdAllocator(db);
  }

  // ------------------------------------------------------------- queries
  async events(sinceSeq = 0, limit = 100): Promise<StoredEvent[]> {
    const rows = await this.db.worldEvent.findMany({
      where: { seq: { gt: sinceSeq } },
      orderBy: { seq: "asc" },
      take: limit,
    });
    return rows.map((r) => ({
      seq: r.seq,
      tick: r.tick,
      type: r.type,
      payload: JSON.parse(r.payload),
    }));
  }

  async eventCount(): Promise<number> {
    return this.db.worldEvent.count();
  }

  async entitiesOfType(type: string): Promise<EntityRow[]> {
    const rows = await this.db.entity.findMany({
      where: { entityType: type },
      orderBy: { entityId: "asc" },
    });
    return rows.map((r) => ({
      entity_id: r.entityId,
      entity_type: r.entityType,
      created_tick: r.createdTick,
      data: JSON.parse(r.data),
    }));
  }

  async entity(id: string): Promise<EntityRow | null> {
    const r = await this.db.entity.findUnique({ where: { entityId: id } });
    return r
      ? {
          entity_id: r.entityId,
          entity_type: r.entityType,
          created_tick: r.createdTick,
          data: JSON.parse(r.data),
        }
      : null;
  }

  async memoriesOf(residentId: string | null, limit = 20): Promise<Array<Record<string, unknown>>> {
    const rows = residentId
      ? await this.db.memory.findMany({
          where: { residentId },
          orderBy: [{ tick: "desc" }, { memoryId: "desc" }],
          take: limit,
        })
      : await this.db.memory.findMany({
          orderBy: [{ tick: "desc" }, { memoryId: "desc" }],
          take: limit,
        });
    return rows.map((r) => ({
      memory_id: r.memoryId,
      resident_id: r.residentId,
      tick: r.tick,
      kind: r.kind,
      text: r.text,
      importance: r.importance,
    }));
  }

  async eventsOfType<T = Record<string, unknown>>(type: string, tickFrom?: number, tickTo?: number): Promise<Array<{ tick: number; payload: T }>> {
    const where: Record<string, unknown> = { type };
    if (tickFrom !== undefined || tickTo !== undefined) {
      where.tick = {};
      if (tickFrom !== undefined) (where.tick as Record<string, number>).gte = tickFrom;
      if (tickTo !== undefined) (where.tick as Record<string, number>).lte = tickTo;
    }
    const rows = await this.db.worldEvent.findMany({ where, orderBy: { seq: "asc" } });
    return rows.map((r) => ({ tick: r.tick, payload: JSON.parse(r.payload) as T }));
  }

  async geoNodes(level?: string): Promise<Array<Record<string, unknown>>> {
    const rows = level
      ? await this.db.geoNode.findMany({ where: { level }, orderBy: { nodeId: "asc" } })
      : await this.db.geoNode.findMany({ orderBy: { nodeId: "asc" } });
    return rows.map((r) => ({
      node_id: r.nodeId,
      parent_id: r.parentId,
      level: r.level,
      name: r.name,
      path: r.path,
      meta: JSON.parse(r.meta),
    }));
  }

  async geoCounts(): Promise<Record<string, number>> {
    const rows = await this.db.geoNode.groupBy({ by: ["level"], _count: true });
    const out: Record<string, number> = {};
    for (const r of rows) out[r.level] = r._count;
    return out;
  }
}


/** Replace a business entity's projection with the full post-event snapshot. */
async function updateBusinessEntity(tx: Tx, businessAfter: Record<string, unknown> | undefined): Promise<void> {
  if (!businessAfter || !businessAfter.business_id) return;
  await tx.entity
    .update({
      where: { entityId: businessAfter.business_id as string },
      data: { data: canonical(businessAfter) },
    })
    .catch(() => {});
}


/** Allocates ids inside a pending batch without touching the DB per id. */
export class IdAllocator {
  private counters = new Map<string, number>();
  constructor(private db: PrismaClient) {}
  warm(prefix: string, used: number) {
    this.counters.set(prefix, Math.max(this.counters.get(prefix) ?? 0, used));
  }
  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}-${String(n).padStart(6, "0")}`;
  }
  /** Persist counters (idempotent) after a batch is committed. */
  async flush() {
    await this.db.$transaction(async (tx) => {
      for (const [prefix, used] of this.counters) {
        const row = await tx.idCounter.findUnique({ where: { prefix } });
        if (!row || row.nextVal <= used) {
          await tx.idCounter.upsert({
            where: { prefix },
            create: { prefix, nextVal: used + 1 },
            update: { nextVal: used + 1 },
          });
        }
      }
    });
  }
}
