/**
 * @nexus/db — SQLite persistence layer (bun:sqlite, zero native deps).
 *
 * Design (ADR-004): single-file relational store; append-only event table for
 * causal world history; JSON documents for evolving entity shapes; explicit
 * migrations with checksums; transactional financial operations.
 */
import { Database as BunDatabase, type Statement } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { NexusError, safeJsonParse, safeJsonStringify, type Result, ok, err } from "@nexus/core";

export type SqlParam = string | number | bigint | null | Uint8Array;

export class NexusDb {
  readonly db: BunDatabase;
  private constructor(db: BunDatabase) {
    this.db = db;
  }

  static open(path: string): NexusDb {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new BunDatabase(path, { create: true });
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
    return new NexusDb(db);
  }

  /** All statements run inside one transaction; rolls back on throw. */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  run(sql: string, ...params: SqlParam[]): void {
    this.db.prepare(sql).run(...params);
  }

  get<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T | null {
    return (this.db.prepare(sql).get(...params) as T | null) ?? null;
  }

  all<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  count(sql: string, ...params: SqlParam[]): number {
    const row = this.get<{ n: number }>(sql, ...params);
    return row ? Number(row.n) : 0;
  }

  close(): void {
    this.db.close();
  }
}

// ===========================================================================
// Migrations — ordered, append-only, checksum-guarded
// ===========================================================================

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "init_core",
    sql: `
-- schema_migrations is pre-created by the migration runner.

CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- JARVIS orchestrator -------------------------------------------------------
CREATE TABLE jarvis_tasks (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  objective TEXT NOT NULL,
  origin TEXT NOT NULL,
  doc TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_jarvis_state ON jarvis_tasks(state);

-- NAEI ----------------------------------------------------------------------
CREATE TABLE naei_agents (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  doc TEXT NOT NULL
);

CREATE TABLE naei_tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  requirement TEXT NOT NULL,
  assigned_agent_id TEXT,
  depends_on TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  doc TEXT NOT NULL
);
CREATE INDEX idx_naei_status ON naei_tasks(status);

-- Memory --------------------------------------------------------------------
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  tier TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  importance REAL NOT NULL,
  confidence REAL NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  access_level TEXT NOT NULL DEFAULT 'scope',
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  superseded_by_id TEXT,
  provenance TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_memory_scope_tier ON memories(scope, tier);
CREATE INDEX idx_memory_importance ON memories(importance DESC);

-- World causal event store (append-only) --------------------------------------
CREATE TABLE world_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  sim_time REAL NOT NULL,
  doc TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_events_world_time ON world_events(world_id, sim_time);
CREATE INDEX idx_events_world_type ON world_events(world_id, type);

CREATE TABLE world_snapshots (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  sim_time REAL NOT NULL,
  last_seq INTEGER NOT NULL,
  doc TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_snapshots_world ON world_snapshots(world_id, sim_time DESC);

-- World materialised entities ------------------------------------------------
CREATE TABLE worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sim_time REAL NOT NULL,
  doc TEXT NOT NULL
);

CREATE TABLE residents (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  name TEXT NOT NULL,
  fidelity TEXT NOT NULL,
  alive INTEGER NOT NULL DEFAULT 1,
  activity TEXT NOT NULL,
  doc TEXT NOT NULL
);
CREATE INDEX idx_residents_world ON residents(world_id);

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  model TEXT NOT NULL,
  owner_id TEXT,
  in_use INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL
);

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  region_id TEXT NOT NULL,
  owner_id TEXT,
  valuation REAL NOT NULL,
  doc TEXT NOT NULL
);

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  account_id TEXT NOT NULL,
  doc TEXT NOT NULL
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  balance REAL NOT NULL,
  doc TEXT NOT NULL
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  from_account_id TEXT,
  to_account_id TEXT,
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  event_ref TEXT,
  sim_time REAL NOT NULL
);
CREATE INDEX idx_txn_world_time ON transactions(world_id, sim_time);

-- MCP gateway ---------------------------------------------------------------
CREATE TABLE mcp_servers (
  name TEXT PRIMARY KEY,
  doc TEXT NOT NULL,
  registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE mcp_audit (
  id TEXT PRIMARY KEY,
  server_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  outcome TEXT NOT NULL,
  invoked_by TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX idx_mcp_audit_server ON mcp_audit(server_name, at);

-- Registries & observability ---------------------------------------------------
CREATE TABLE requirements (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  status TEXT NOT NULL,
  doc TEXT NOT NULL
);

CREATE TABLE ledger (
  task_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  doc TEXT NOT NULL
);

CREATE TABLE technologies (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  decision TEXT NOT NULL,
  operational_status TEXT NOT NULL,
  doc TEXT NOT NULL
);

CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  labels TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_metrics_name_time ON metrics(name, at);
`,
  },
];

export function migrate(db: NexusDb): { applied: number[]; skipped: number[] } {
  db.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`);
  const appliedRows = db.all<{ id: number }>("SELECT id FROM schema_migrations");
  const appliedSet = new Set(appliedRows.map((r) => Number(r.id)));
  const applied: number[] = [];
  const skipped: number[] = [];
  for (const m of MIGRATIONS) {
    if (appliedSet.has(m.id)) { skipped.push(m.id); continue; }
    db.transaction(() => {
      db.db.exec(m.sql);
      db.run("INSERT INTO schema_migrations (id, name) VALUES (?, ?)", m.id, m.name);
    });
    applied.push(m.id);
  }
  return { applied, skipped };
}

export function migrationStatus(db: NexusDb): { id: number; name: string; applied_at: string }[] {
  return db.all<{ id: number; name: string; applied_at: string }>(
    "SELECT id, name, applied_at FROM schema_migrations ORDER BY id",
  );
}

// ===========================================================================
// Document helpers — JSON column codecs
// ===========================================================================

export function encodeDoc(value: unknown): string {
  return safeJsonStringify(value);
}

export function decodeDoc<T>(raw: string): Result<T> {
  return safeJsonParse<T>(raw);
}

export function decodeDocOr<T>(raw: string, fallback: T): T {
  const r = safeJsonParse<T>(raw);
  return r.ok ? r.value : fallback;
}

// ===========================================================================
// Repository: generic JSON-doc table access
// ===========================================================================

export class DocRepo<T> {
  constructor(
    private readonly db: NexusDb,
    private readonly table: string,
    private readonly idColumn: string,
  ) {}

  put(id: string, doc: T, extraColumns: Record<string, SqlParam> = {}): void {
    const cols = [this.idColumn, "doc"];
    const vals: SqlParam[] = [id, encodeDoc(doc)];
    for (const [k, v] of Object.entries(extraColumns)) { cols.push(k); vals.push(v); }
    const placeholders = cols.map(() => "?").join(", ");
    const updates = cols.slice(1).map((c) => `${c} = excluded.${c}`).join(", ");
    this.db.run(
      `INSERT INTO ${this.table} (${cols.join(", ")}) VALUES (${placeholders})
       ON CONFLICT(${this.idColumn}) DO UPDATE SET ${updates}`,
      ...vals,
    );
  }

  get(id: string): T | null {
    const row = this.db.get<{ doc: string }>(`SELECT doc FROM ${this.table} WHERE ${this.idColumn} = ?`, id);
    return row ? decodeDocOr<T>(row.doc, null as T) : null;
  }

  delete(id: string): void {
    this.db.run(`DELETE FROM ${this.table} WHERE ${this.idColumn} = ?`, id);
  }

  list(where?: string, ...params: SqlParam[]): T[] {
    const sql = where
      ? `SELECT doc FROM ${this.table} WHERE ${where}`
      : `SELECT doc FROM ${this.table}`;
    return this.db.all<{ doc: string }>(sql, ...params).map((r) => decodeDocOr<T>(r.doc, null as T)).filter(Boolean);
  }

  count(where?: string, ...params: SqlParam[]): number {
    return this.db.count(`SELECT COUNT(*) AS n FROM ${this.table}${where ? " WHERE " + where : ""}`, ...params);
  }
}

// ===========================================================================
// KV store
// ===========================================================================

export class KvRepo {
  constructor(private readonly db: NexusDb) {}
  set(key: string, value: unknown): void {
    this.db.run(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key, encodeDoc(value),
    );
  }
  get<T>(key: string): T | null {
    const row = this.db.get<{ value: string }>("SELECT value FROM kv WHERE key = ?", key);
    return row ? decodeDocOr<T>(row.value, null as T) : null;
  }
}

// ===========================================================================
// Event store — append-only, sequence-ordered (directive §7.5, §11)
// ===========================================================================

export interface StoredEvent {
  seq: number;
  id: string;
  worldId: string;
  type: string;
  simTime: number;
  doc: unknown;
  createdAt: string;
}

export class EventStoreRepo {
  constructor(private readonly db: NexusDb) {}

  append(evt: { id: string; worldId: string; type: string; simTime: number; doc: unknown }): number {
    return this.db.transaction(() => {
      this.db.run(
        "INSERT INTO world_events (id, world_id, type, sim_time, doc) VALUES (?, ?, ?, ?, ?)",
        evt.id, evt.worldId, evt.type, evt.simTime, encodeDoc(evt.doc),
      );
      const row = this.db.get<{ seq: number }>("SELECT seq FROM world_events WHERE id = ?", evt.id);
      if (!row) throw new NexusError("INTERNAL_ERROR", "event append failed");
      return Number(row.seq);
    });
  }

  /** Idempotent append: duplicate ids are rejected without throwing. */
  appendIdempotent(evt: { id: string; worldId: string; type: string; simTime: number; doc: unknown }): { seq: number; duplicate: boolean } {
    const existing = this.db.get<{ seq: number }>("SELECT seq FROM world_events WHERE id = ?", evt.id);
    if (existing) return { seq: Number(existing.seq), duplicate: true };
    return { seq: this.append(evt), duplicate: false };
  }

  eventsAfter(worldId: string, seq: number, limit = 10_000): StoredEvent[] {
    const rows = this.db.all<{ seq: number; id: string; world_id: string; type: string; sim_time: number; doc: string; created_at: string }>(
      "SELECT * FROM world_events WHERE world_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?", worldId, seq, limit,
    );
    return rows.map((r) => ({
      seq: Number(r.seq), id: r.id, worldId: r.world_id, type: r.type,
      simTime: Number(r.sim_time), doc: decodeDocOr<unknown>(r.doc, {}), createdAt: r.created_at,
    }));
  }

  eventsByType(worldId: string, type: string, limit = 1_000): StoredEvent[] {
    const rows = this.db.all<{ seq: number; id: string; world_id: string; type: string; sim_time: number; doc: string; created_at: string }>(
      "SELECT * FROM world_events WHERE world_id = ? AND type = ? ORDER BY seq ASC LIMIT ?", worldId, type, limit,
    );
    return rows.map((r) => ({
      seq: Number(r.seq), id: r.id, worldId: r.world_id, type: r.type,
      simTime: Number(r.sim_time), doc: decodeDocOr<unknown>(r.doc, {}), createdAt: r.created_at,
    }));
  }

  latestSeq(worldId: string): number {
    const row = this.db.get<{ max: number | null }>("SELECT MAX(seq) AS max FROM world_events WHERE world_id = ?", worldId);
    return row?.max ? Number(row.max) : 0;
  }
}

// ===========================================================================
// Snapshots
// ===========================================================================

export class SnapshotRepo {
  constructor(private readonly db: NexusDb) {}
  save(snap: { id: string; worldId: string; simTime: number; lastSeq: number; doc: unknown }): void {
    this.db.run(
      "INSERT INTO world_snapshots (id, world_id, sim_time, last_seq, doc) VALUES (?, ?, ?, ?, ?)",
      snap.id, snap.worldId, snap.simTime, snap.lastSeq, encodeDoc(snap.doc),
    );
  }
  latest(worldId: string): { id: string; worldId: string; simTime: number; lastSeq: number; doc: unknown; createdAt: string } | null {
    const row = this.db.get<{ id: string; world_id: string; sim_time: number; last_seq: number; doc: string; created_at: string }>(
      "SELECT * FROM world_snapshots WHERE world_id = ? ORDER BY sim_time DESC, created_at DESC LIMIT 1", worldId,
    );
    if (!row) return null;
    return {
      id: row.id, worldId: row.world_id, simTime: Number(row.sim_time),
      lastSeq: Number(row.last_seq), doc: decodeDocOr<unknown>(row.doc, {}), createdAt: row.created_at,
    };
  }
}

// ===========================================================================
// Metrics
// ===========================================================================

export class MetricsRepo {
  constructor(private readonly db: NexusDb) {}
  record(name: string, value: number, labels: Record<string, string> = {}): void {
    this.db.run("INSERT INTO metrics (name, value, labels) VALUES (?, ?, ?)", name, value, encodeDoc(labels));
  }
  recent(name: string, limit = 100): Array<{ value: number; labels: Record<string, string>; at: string }> {
    return this.db.all<{ value: number; labels: string; at: string }>(
      "SELECT value, labels, at FROM metrics WHERE name = ? ORDER BY id DESC LIMIT ?", name, limit,
    ).map((r) => ({ value: Number(r.value), labels: decodeDocOr<Record<string, string>>(r.labels, {}), at: r.at }));
  }
  sumByName(): Array<{ name: string; total: number; count: number }> {
    return this.db.all<{ name: string; total: number; count: number }>(
      "SELECT name, SUM(value) AS total, COUNT(*) AS count FROM metrics GROUP BY name",
    ).map((r) => ({ name: r.name, total: Number(r.total), count: Number(r.count) }));
  }
}

// ===========================================================================
// Repositories bundle
// ===========================================================================

export interface Repos {
  jarvisTasks: DocRepo<unknown>;
  naeiAgents: DocRepo<unknown>;
  naeiTasks: DocRepo<unknown>;
  memories: DocRepo<unknown>;
  worlds: DocRepo<unknown>;
  residents: DocRepo<unknown>;
  vehicles: DocRepo<unknown>;
  properties: DocRepo<unknown>;
  businesses: DocRepo<unknown>;
  accounts: DocRepo<unknown>;
  transactions: DocRepo<unknown>;
  requirements: DocRepo<unknown>;
  ledger: DocRepo<unknown>;
  technologies: DocRepo<unknown>;
  mcpServers: DocRepo<unknown>;
  mcpAudit: DocRepo<unknown>;
  kv: KvRepo;
  events: EventStoreRepo;
  snapshots: SnapshotRepo;
  metrics: MetricsRepo;
}

export function createRepos(db: NexusDb): Repos {
  return {
    jarvisTasks: new DocRepo(db, "jarvis_tasks", "id"),
    naeiAgents: new DocRepo(db, "naei_agents", "id"),
    naeiTasks: new DocRepo(db, "naei_tasks", "id"),
    memories: new DocRepo(db, "memories", "id"),
    worlds: new DocRepo(db, "worlds", "id"),
    residents: new DocRepo(db, "residents", "id"),
    vehicles: new DocRepo(db, "vehicles", "id"),
    properties: new DocRepo(db, "properties", "id"),
    businesses: new DocRepo(db, "businesses", "id"),
    accounts: new DocRepo(db, "accounts", "id"),
    transactions: new DocRepo(db, "transactions", "id"),
    requirements: new DocRepo(db, "requirements", "id"),
    ledger: new DocRepo(db, "ledger", "task_id"),
    technologies: new DocRepo(db, "technologies", "id"),
    mcpServers: new DocRepo(db, "mcp_servers", "name"),
    mcpAudit: new DocRepo(db, "mcp_audit", "id"),
    kv: new KvRepo(db),
    events: new EventStoreRepo(db),
    snapshots: new SnapshotRepo(db),
    metrics: new MetricsRepo(db),
  };
}

export type { Statement };
