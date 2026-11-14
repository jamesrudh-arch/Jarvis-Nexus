/**
 * @nexus/railway — tamper-evident audit trail (directive §14).
 *
 * Every relevant event gets: unique id, timestamp, affected resource, event
 * category, severity, evidence, responsible component, outcome, principal —
 * plus a SHA-256 hash chain (each record commits to its predecessor), so any
 * after-the-fact modification or deletion is detectable by `verify()`.
 * Records are INSERT-only; the monitoring component cannot silently erase
 * its own history through this API (no update/delete methods exist).
 * Evidence is redacted before storage (credential material can never enter
 * the audit trail).
 */
import { createHash } from "node:crypto";
import { nexusId } from "@nexus/core";
import { NexusDb, encodeDoc, decodeDocOr } from "@nexus/db";
import { redactSecrets } from "./errors";

export const RAILWAY_AUDIT_CATEGORIES = [
  "auth_failure", "api_failure", "deployment_change", "diagnostic", "root_cause",
  "reconciliation", "cost_anomaly", "recovery_recommendation", "authorized_operation",
  "recovery_execution", "verification_outcome", "webhook", "contract_drift", "credential_event",
] as const;

export type RailwayAuditCategory = (typeof RAILWAY_AUDIT_CATEGORIES)[number];
export type AuditSeverity = "info" | "warning" | "critical";
export type AuditOutcome = "success" | "failure" | "rejected" | "timeout";

export interface AuditEntryInput {
  category: RailwayAuditCategory;
  severity: AuditSeverity;
  component: string;
  outcome: AuditOutcome;
  resource?: string;
  principal?: string;
  evidence: Record<string, unknown>;
}

export interface StoredAuditRecord extends AuditEntryInput {
  id: string;
  at: string;
  seq: number;
  prevHash: string | null;
  hash: string;
}

/** Deterministic JSON canonicalization (sorted keys, nested). */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export class RailwayAuditLog {
  constructor(private readonly db: NexusDb) {}

  /** Append one tamper-evident record. Returns the stored record. */
  record(entry: AuditEntryInput, at: string = new Date().toISOString()): StoredAuditRecord {
    return this.db.transaction(() => {
      const prev = this.db.get<{ hash: string }>("SELECT hash FROM railway_audit ORDER BY seq DESC LIMIT 1");
      const prevHash = prev?.hash ?? null;
      const id = nexusId("aud");
      const redactedEvidence = JSON.parse(redactSecrets(JSON.stringify(entry.evidence ?? {}))) as Record<string, unknown>;
      const hash = createHash("sha256")
        .update(prevHash ?? "genesis")
        .update(canonicalize({
          id, at, category: entry.category, severity: entry.severity,
          component: entry.component, outcome: entry.outcome,
          resource: entry.resource ?? null, principal: entry.principal ?? null,
          evidence: redactedEvidence,
        }))
        .digest("hex");
      this.db.run(
        `INSERT INTO railway_audit (id, at, category, severity, resource, component, outcome, principal, evidence, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, at, entry.category, entry.severity, entry.resource ?? null, entry.component,
        entry.outcome, entry.principal ?? null, encodeDoc(redactedEvidence), prevHash, hash,
      );
      const row = this.db.get<{ seq: number }>("SELECT seq FROM railway_audit WHERE id = ?", id);
      return {
        ...entry, evidence: redactedEvidence, id, at,
        seq: row ? Number(row.seq) : -1, prevHash, hash,
      };
    });
  }

  /** Recompute the whole chain; report the first break if tampered. */
  verify(): { valid: boolean; checked: number; firstBreak?: { seq: number; reason: string } } {
    const rows = this.db.all<{ seq: number; id: string; at: string; category: string; severity: string; resource: string | null; component: string; outcome: string; principal: string | null; evidence: string; prev_hash: string | null; hash: string }>(
      "SELECT * FROM railway_audit ORDER BY seq ASC",
    );
    let prevHash: string | null = null;
    for (const r of rows) {
      if (r.prev_hash !== prevHash) {
        return { valid: false, checked: rows.length, firstBreak: { seq: Number(r.seq), reason: "prev_hash chain broken — record removed or reordered" } };
      }
      const evidence = decodeDocOr<Record<string, unknown>>(r.evidence, {});
      const expected: string = createHash("sha256")
        .update(r.prev_hash ?? "genesis")
        .update(canonicalize({
          id: r.id, at: r.at, category: r.category, severity: r.severity,
          component: r.component, outcome: r.outcome, resource: r.resource,
          principal: r.principal, evidence,
        }))
        .digest("hex");
      if (expected !== r.hash) {
        return { valid: false, checked: rows.length, firstBreak: { seq: Number(r.seq), reason: "hash mismatch — record content modified after the fact" } };
      }
      prevHash = r.hash;
    }
    return { valid: true, checked: rows.length };
  }

  query(opts: { category?: RailwayAuditCategory; limit?: number } = {}): StoredAuditRecord[] {
    const limit = Math.min(500, opts.limit ?? 100);
    const rows = this.db.all<{ seq: number; id: string; at: string; category: string; severity: string; resource: string | null; component: string; outcome: string; principal: string | null; evidence: string; prev_hash: string | null; hash: string }>(
      `SELECT * FROM railway_audit ${opts.category ? "WHERE category = ?" : ""} ORDER BY seq DESC LIMIT ?`,
      ...(opts.category ? [opts.category] : []), limit,
    );
    return rows.map((r) => ({
      seq: Number(r.seq), id: r.id, at: r.at, category: r.category as RailwayAuditCategory,
      severity: r.severity as AuditSeverity, resource: r.resource ?? undefined,
      component: r.component, outcome: r.outcome as AuditOutcome,
      principal: r.principal ?? undefined,
      evidence: decodeDocOr<Record<string, unknown>>(r.evidence, {}),
      prevHash: r.prev_hash ?? null, hash: r.hash,
    }));
  }
}
