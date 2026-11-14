/**
 * @nexus/memory — JARVIS memory architecture (directive §5.4).
 *
 * Multi-tier memory (working/episodic/semantic/procedural/personal/project/
 * event/relationship/operational) with retrieval ranking, consolidation,
 * contradiction detection, provenance, expiry and access control.
 *
 * Backends: SQLite (default, verified) — the MemoryStore interface is the
 * stable seam for an OpenViking provider adapter (registry record TECH-001).
 */
import {
  nexusId, ID_PREFIXES, ok, err, NexusError, type Clock, systemClock, type Result,
} from "@nexus/core";
import type { MemoryRecord, MemoryQuery, MemoryTier, MemoryKind } from "@nexus/contracts";
import type { NexusDb, Repos } from "@nexus/db";

export interface MemoryBackend {
  write(rec: MemoryRecord): Result<void>;
  get(id: string): MemoryRecord | null;
  query(q: MemoryQuery): MemoryRecord[];
  byScope(scope: string): MemoryRecord[];
  update(id: string, patch: Partial<MemoryRecord>): MemoryRecord | null;
  delete(id: string): boolean;
  all(): MemoryRecord[];
}

// ---------------------------------------------------------------------------
// SQLite backend
// ---------------------------------------------------------------------------

export class SqliteMemoryBackend implements MemoryBackend {
  constructor(private readonly db: NexusDb) {}

  write(rec: MemoryRecord): Result<void> {
    try {
      this.db.run(
        `INSERT INTO memories (id, scope, tier, kind, title, content, importance, confidence,
           tags, access_level, access_count, last_accessed_at, superseded_by_id, provenance, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, content=excluded.content, importance=excluded.importance,
           confidence=excluded.confidence, tags=excluded.tags, access_level=excluded.access_level,
           access_count=excluded.access_count, last_accessed_at=excluded.last_accessed_at,
           superseded_by_id=excluded.superseded_by_id, expires_at=excluded.expires_at`,
        rec.id, rec.scope, rec.tier, rec.kind, rec.title, rec.content,
        rec.importance, rec.confidence, JSON.stringify(rec.tags), rec.accessLevel,
        rec.accessCount, rec.lastAccessedAt ?? rec.provenance.createdAt, rec.supersededById ?? null,
        JSON.stringify(rec.provenance), rec.expiresAt ?? null, rec.provenance.createdAt,
      );
      return ok(undefined);
    } catch (e) {
      return err(new NexusError("INTERNAL_ERROR", String(e)));
    }
  }

  get(id: string): MemoryRecord | null {
    const row = this.db.get<MemoryRow>("SELECT * FROM memories WHERE id = ?", id);
    return row ? rowToRecord(row) : null;
  }

  query(q: MemoryQuery): MemoryRecord[] {
    const rows = this.db.all<MemoryRow>(
      `SELECT * FROM memories
       WHERE scope = ?
         AND (? IS NULL OR tier IN (SELECT value FROM json_each(?)))
         AND (? IS NULL OR importance >= ?)
         AND (superseded_by_id IS NULL)
         AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ORDER BY importance DESC, created_at DESC`,
      q.scope,
      q.tiers ? JSON.stringify(q.tiers) : null, q.tiers ? JSON.stringify(q.tiers) : null,
      q.minImportance ?? null, q.minImportance ?? null,
    );
    return rows.map(rowToRecord);
  }

  byScope(scope: string): MemoryRecord[] {
    return this.db.all<MemoryRow>("SELECT * FROM memories WHERE scope = ? ORDER BY created_at DESC", scope).map(rowToRecord);
  }

  update(id: string, patch: Partial<MemoryRecord>): MemoryRecord | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, id: existing.id };
    const r = this.write(merged);
    return r.ok ? merged : null;
  }

  delete(id: string): boolean {
    const before = this.db.count("SELECT COUNT(*) AS n FROM memories WHERE id = ?", id);
    this.db.run("DELETE FROM memories WHERE id = ?", id);
    return before > 0;
  }

  all(): MemoryRecord[] {
    return this.db.all<MemoryRow>("SELECT * FROM memories ORDER BY created_at DESC").map(rowToRecord);
  }
}

interface MemoryRow {
  id: string; scope: string; tier: string; kind: string; title: string; content: string;
  importance: number; confidence: number; tags: string; access_level: string;
  access_count: number; last_accessed_at: string | null; superseded_by_id: string | null;
  provenance: string; expires_at: string | null; created_at: string;
}

function rowToRecord(r: MemoryRow): MemoryRecord {
  return {
    id: r.id,
    scope: r.scope,
    tier: r.tier as MemoryTier,
    kind: r.kind as MemoryKind,
    title: r.title,
    content: r.content,
    importance: Number(r.importance),
    confidence: Number(r.confidence),
    provenance: JSON.parse(r.provenance),
    tags: JSON.parse(r.tags) as string[],
    accessLevel: r.access_level as MemoryRecord["accessLevel"],
    lastAccessedAt: r.last_accessed_at ?? undefined,
    accessCount: Number(r.access_count),
    supersededById: r.superseded_by_id ?? undefined,
    expiresAt: r.expires_at ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Memory service — creation, ranked retrieval, consolidation
// ---------------------------------------------------------------------------

export interface MemoryServiceConfig {
  clock?: Clock;
  backend?: MemoryBackend;
}

export class MemoryService {
  private readonly backend: MemoryBackend;
  private readonly clock: Clock;

  constructor(cfg: MemoryServiceConfig = {}) {
    this.clock = cfg.clock ?? systemClock;
    this.backend = cfg.backend ?? (nullBackend as MemoryBackend);
  }

  static withDb(db: NexusDb, _repos: Repos, cfg: MemoryServiceConfig = {}): MemoryService {
    return new MemoryService({ ...cfg, backend: new SqliteMemoryBackend(db) });
  }

  create(input: {
    scope: string;
    tier: MemoryTier;
    kind: MemoryKind;
    title: string;
    content: string;
    importance?: number;
    confidence?: number;
    source?: MemoryRecord["provenance"]["source"];
    sourceId?: string;
    tags?: string[];
    accessLevel?: MemoryRecord["accessLevel"];
    expiresAt?: string;
  }): MemoryRecord {
    const rec: MemoryRecord = {
      id: nexusId(ID_PREFIXES.memory),
      scope: input.scope,
      tier: input.tier,
      kind: input.kind,
      title: input.title,
      content: input.content,
      importance: input.importance ?? 0.5,
      confidence: input.confidence ?? 0.8,
      provenance: {
        source: input.source ?? "user",
        sourceId: input.sourceId,
        createdAt: this.clock.now().toISOString(),
      },
      tags: input.tags ?? [],
      accessLevel: input.accessLevel ?? "scope",
      accessCount: 0,
    };
    if (input.expiresAt) rec.expiresAt = input.expiresAt;
    const r = this.backend.write(rec);
    if (!r.ok) throw new Error(`memory write failed: ${String(r.error)}`);
    return rec;
  }

  /**
   * Ranked retrieval: relevance (term overlap) × importance × confidence ×
   * recency decay × access reinforcement. Never injects all memories blindly.
   */
  retrieve(q: MemoryQuery): MemoryRecord[] {
    const candidates = this.backend.query(q);
    const now = this.clock.nowMs();
    const scored = candidates.map((m) => {
      const relevance = q.textQuery ? termOverlap(q.textQuery, `${m.title} ${m.content} ${m.tags.join(" ")}`) : 0.4;
      const ageDays = Math.max(0, (now - Date.parse(m.provenance.createdAt)) / 86_400_000);
      const recency = 1 / (1 + ageDays / 30);
      const reinforcement = Math.min(1.5, 1 + m.accessCount * 0.05);
      const score = (relevance * 0.45 + m.importance * 0.3 + m.confidence * 0.1 + recency * 0.15) * reinforcement;
      return { m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, q.limit).map((s) => s.m);
    // record access for reinforcement
    for (const m of top) {
      this.backend.update(m.id, { accessCount: m.accessCount + 1, lastAccessedAt: this.clock.now().toISOString() });
    }
    return top;
  }

  /** Context assembly for a model request (directive §5.4). */
  assembleContext(scope: string, textQuery: string, limit = 8): string {
    const mems = this.retrieve({ scope, textQuery, limit });
    if (mems.length === 0) return "";
    return mems
      .map((m) => `[${m.tier}/${m.kind} | conf ${m.confidence.toFixed(2)}] ${m.title}: ${m.content}`)
      .join("\n");
  }

  /**
   * Consolidation pass (directive §5.4): decays stale working memory,
   * promotes repeated episodic themes to semantic summaries, flags
   * contradictions (same title scope, opposing confidence/kind).
   */
  consolidate(scope: string): { expired: number; promoted: number; contradictions: Array<[MemoryRecord, MemoryRecord]> } {
    const all = this.backend.byScope(scope);
    let expired = 0;
    let promoted = 0;
    const nowIso = this.clock.now().toISOString();
    const contradictions: Array<[MemoryRecord, MemoryRecord]> = [];

    for (const m of all) {
      if (m.expiresAt && m.expiresAt <= nowIso) {
        this.backend.delete(m.id);
        expired++;
      }
    }
    const live = this.backend.byScope(scope);
    const byTitle = new Map<string, MemoryRecord[]>();
    for (const m of live) {
      const key = normaliseTitle(m.title);
      byTitle.set(key, [...(byTitle.get(key) ?? []), m]);
    }
    for (const [, group] of byTitle) {
      if (group.length < 2) continue;
      for (let i = 1; i < group.length; i++) {
        const a = group[0]!, b = group[i]!;
        if (a.kind !== b.kind || isContradictory(a.content, b.content)) {
          contradictions.push([a, b]);
        }
      }
      // promotion: >=3 episodic memories with same theme -> semantic summary
      const episodic = group.filter((m) => m.tier === "episodic");
      if (episodic.length >= 3) {
        const existingSemantic = live.find((m) => m.tier === "semantic" && normaliseTitle(m.title) === normaliseTitle(group[0]!.title));
        if (!existingSemantic) {
          this.create({
            scope, tier: "semantic", kind: "fact",
            title: `Pattern: ${group[0]!.title}`,
            content: `Consolidated from ${episodic.length} episodic memories: ${[...new Set(episodic.map((e) => e.content))].join("; ").slice(0, 500)}`,
            importance: 0.7, confidence: 0.75, source: "system", sourceId: "consolidation",
            tags: ["consolidated"],
          });
          promoted++;
        }
      }
    }
    return { expired, promoted, contradictions };
  }

  /**
   * Controlled deletion with tombstone semantics (supersede, not erase).
   * Without a replacement the record is tombstoned with a self-reference
   * (hidden from retrieval; backendGet still shows it and its supersededById).
   * Providing a nonexistent or self-referential replacement is rejected.
   */
  supersede(id: string, replacementId?: string): boolean {
    if (replacementId) {
      const replacement = this.backend.get(replacementId);
      if (!replacement || replacement.id === id) return false;
    }
    const updated = this.backend.update(id, { supersededById: replacementId ?? id });
    return updated !== null && (updated.supersededById ?? null) !== null;
  }

  backendGet(id: string): MemoryRecord | null {
    return this.backend.get(id);
  }
  listScope(scope: string): MemoryRecord[] {
    return this.backend.byScope(scope);
  }
}

// null backend for construction before DB wiring — throws on use
const nullBackend: MemoryBackend = new Proxy({} as MemoryBackend, {
  get() {
    throw new Error("MemoryService: no backend configured (use MemoryService.withDb)");
  },
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function normaliseTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function termOverlap(query: string, text: string): number {
  const qs = new Set(query.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  if (qs.size === 0) return 0.4;
  const ts = new Set(text.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  let hits = 0;
  for (const w of qs) if (ts.has(w)) hits++;
  return hits / qs.size;
}

function isContradictory(a: string, b: string): boolean {
  const negations = ["not", "never", "no", "cannot", "isn't", "doesn't"];
  const aw = new Set(a.toLowerCase().split(/\W+/));
  const bw = new Set(b.toLowerCase().split(/\W+/));
  const aNeg = [...aw].filter((w) => negations.includes(w)).length;
  const bNeg = [...bw].filter((w) => negations.includes(w)).length;
  const contentSimilar = termOverlap(a, b) > 0.3;
  return contentSimilar && ((aNeg > 0) !== (bNeg > 0));
}
