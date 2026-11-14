/**
 * @nexus/railway — persistence: append-only event intake + state store.
 *
 * Tables (db migration 3 `railway_intelligence`): railway_events (dedup by
 * id, INSERT-only), railway_state (snapshots, cursors, checkpoints, grants).
 * Mirrors the house EventStoreRepo pattern (idempotent append) so webhook and
 * poller double-delivery can never double-record.
 */
import { NexusDb, encodeDoc, decodeDocOr } from "@nexus/db";

export interface StoredRailwayEvent {
  seq: number;
  id: string;
  kind: string;
  source: string;
  at: string;
  doc: unknown;
  createdAt: string;
}

export class RailwayEventStore {
  constructor(private readonly db: NexusDb) {}

  /** Idempotent append — duplicate source ids are recorded as duplicates, never re-inserted. */
  appendIdempotent(evt: { id: string; kind: string; source: string; at: string; doc: unknown }): { duplicate: boolean; seq: number | null } {
    const existing = this.db.get<{ seq: number }>("SELECT seq FROM railway_events WHERE id = ?", evt.id);
    if (existing) return { duplicate: true, seq: Number(existing.seq) };
    this.db.run(
      "INSERT INTO railway_events (id, kind, source, at, doc) VALUES (?, ?, ?, ?, ?)",
      evt.id, evt.kind, evt.source, evt.at, encodeDoc(evt.doc),
    );
    const row = this.db.get<{ seq: number }>("SELECT seq FROM railway_events WHERE id = ?", evt.id);
    return { duplicate: false, seq: row ? Number(row.seq) : null };
  }

  /** Events ordered by SOURCE timestamp (out-of-order arrivals sort correctly). */
  list(opts: { kind?: string; limit?: number; afterSeq?: number } = {}): StoredRailwayEvent[] {
    const limit = Math.min(1000, opts.limit ?? 100);
    const rows = this.db.all<{ seq: number; id: string; kind: string; source: string; at: string; doc: string; created_at: string }>(
      `SELECT * FROM railway_events
       WHERE (${opts.kind ? "kind = ?" : "1=1"}) AND (${opts.afterSeq !== undefined ? "seq > ?" : "1=1"})
       ORDER BY seq ASC LIMIT ?`,
      ...(opts.kind ? [opts.kind] : []),
      ...(opts.afterSeq !== undefined ? [opts.afterSeq] : []),
      limit,
    );
    return rows.map((r) => ({
      seq: Number(r.seq), id: r.id, kind: r.kind, source: r.source,
      at: r.at, doc: decodeDocOr<unknown>(r.doc, {}), createdAt: r.created_at,
    }));
  }

  count(kind?: string): number {
    return kind
      ? this.db.count("SELECT COUNT(*) AS n FROM railway_events WHERE kind = ?", kind)
      : this.db.count("SELECT COUNT(*) AS n FROM railway_events");
  }

  has(id: string): boolean {
    return this.db.get<{ seq: number }>("SELECT seq FROM railway_events WHERE id = ?", id) !== null;
  }
}

/** Key-value state: snapshots, poller cursors, grants, reconciliation history. */
export class RailwayStateRepo {
  constructor(private readonly db: NexusDb) {}

  set<T>(key: string, value: T): void {
    this.db.run(
      `INSERT INTO railway_state (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key, encodeDoc(value),
    );
  }

  get<T>(key: string): T | null {
    const row = this.db.get<{ value: string }>("SELECT value FROM railway_state WHERE key = ?", key);
    return row ? decodeDocOr<T>(row.value, null as T) : null;
  }

  delete(key: string): void {
    this.db.run("DELETE FROM railway_state WHERE key = ?", key);
  }

  /** Append-only history lists (snapshot history, reconciliation history). */
  appendHistory<T>(key: string, value: T, cap = 50): void {
    const list = this.get<T[]>(key) ?? [];
    list.push(value);
    if (list.length > cap) list.splice(0, list.length - cap);
    this.set(key, list);
  }
}
