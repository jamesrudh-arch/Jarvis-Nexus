/**
 * @nexus/railway — cost & resource intelligence (directive §6).
 *
 * Honest accounting rules:
 *  - MEASURED (workspaceUsageTotals / usage) and ESTIMATED (estimatedUsage)
 *    values are labelled separately and never mixed.
 *  - No billing/currency figure is fabricated: the verified schema exposes
 *    per-measurement usage (CPU_USAGE, *_GB, ...), not a workspace USD total
 *    for workspace tokens. Thresholds are therefore configured per
 *    measurement; the limitation is stated in every report.
 *  - Volume pressure is OBSERVED (currentSizeMB vs sizeMB).
 *  - Anomaly detection is a documented heuristic (ratio vs previous report),
 *    labelled as such — never presented as ground truth.
 */
import type { RailwayClient } from "./client";
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import { Q_ESTIMATED_USAGE, Q_WORKSPACE_USAGE_TOTALS, USAGE_MEASUREMENTS } from "./queries";
import type { InfrastructureSnapshot } from "./model";

export type UsageKind = "measured" | "estimated" | "observed";

export interface UsagePoint {
  measurement: string;
  value: number;
  kind: UsageKind;
  projectId?: string | null;
}

export interface UsageAnomaly {
  kind: "threshold_exceeded" | "sudden_increase" | "volume_pressure";
  severity: "info" | "warning" | "critical";
  detail: string;
  measurement?: string;
  /** Heuristic confidence — anomaly detection is rule-based, not certain. */
  method: "heuristic";
}

export interface CostReport {
  asOf: string;
  measured: UsagePoint[];
  estimated: UsagePoint[];
  observed: Array<{ volumeInstanceId: string; usedMB: number | null; sizeMB: number; ratio: number | null }>;
  anomalies: UsageAnomaly[];
  thresholds: Record<string, number>;
  notes: string[];
}

export interface UsageOptions {
  /** Per-measurement alert thresholds, e.g. { DISK_USAGE_GB: 8 }. */
  thresholds?: Record<string, number>;
  /** Ratio increase over the previous report that raises sudden_increase. */
  suddenIncreaseRatio?: number;
  projectId?: string;
}

export class UsageService {
  constructor(
    private readonly client: RailwayClient,
    private readonly opts: UsageOptions = {},
  ) {}

  async report(snapshot?: InfrastructureSnapshot | null): Promise<RailwayResult<CostReport>> {
    const asOf = new Date().toISOString();
    const measurements = [...USAGE_MEASUREMENTS];
    const notes: string[] = [
      "measured vs estimated values are reported separately (directive §6: clearly distinguish measured costs from estimates)",
      "the verified Railway schema exposes per-measurement usage, not a workspace USD billing total — no currency figure is fabricated",
    ];
    const anomalies: UsageAnomaly[] = [];
    const thresholds = this.opts.thresholds ?? {};

    // ---- estimates ------------------------------------------------------------
    const estRes = await this.client.request<{ estimatedUsage: Array<{ estimatedValue: number; measurement: string; projectId: string }> }>(
      Q_ESTIMATED_USAGE, { measurements, projectId: this.opts.projectId ?? null },
    );
    const estimated: UsagePoint[] = estRes.ok
      ? estRes.value.data.estimatedUsage.map((e) => ({ measurement: e.measurement, value: Number(e.estimatedValue), kind: "estimated" as const, projectId: e.projectId ?? null }))
      : [];
    if (!estRes.ok) notes.push(`estimatedUsage unavailable: ${estRes.error.kind} (reported as missing, not zero)`);

    // ---- measured totals --------------------------------------------------------
    const measRes = await this.client.request<{ workspaceUsageTotals: Array<{ measurement: string; value: number }> }>(
      Q_WORKSPACE_USAGE_TOTALS, { measurements },
    );
    const measured: UsagePoint[] = measRes.ok
      ? measRes.value.data.workspaceUsageTotals.map((u) => ({ measurement: u.measurement, value: Number(u.value), kind: "measured" as const }))
      : [];
    if (!measRes.ok) notes.push(`workspaceUsageTotals unavailable: ${measRes.error.kind} (reported as missing, not zero)`);

    // ---- observed volume pressure -------------------------------------------------
    const observed: CostReport["observed"] = [];
    if (snapshot) {
      for (const v of snapshot.volumes) {
        const ratio = v.currentSizeMB != null && v.sizeMB > 0 ? v.currentSizeMB / v.sizeMB : null;
        observed.push({ volumeInstanceId: v.id, usedMB: v.currentSizeMB ?? null, sizeMB: v.sizeMB, ratio });
        if (ratio !== null && ratio > 0.9) {
          anomalies.push({
            kind: "volume_pressure", severity: ratio > 0.95 ? "critical" : "warning",
            detail: `volume ${v.id} at ${Math.round(ratio * 100)}% of capacity (${v.currentSizeMB}MB/${v.sizeMB}MB, mount ${v.mountPath})`,
            method: "heuristic",
          });
        }
      }
    }

    // ---- threshold anomalies (estimated values) -------------------------------------
    for (const point of estimated) {
      const threshold = thresholds[point.measurement];
      if (threshold !== undefined && point.value > threshold) {
        anomalies.push({
          kind: "threshold_exceeded", severity: "warning",
          detail: `estimated ${point.measurement} = ${point.value} exceeds configured threshold ${threshold}`,
          measurement: point.measurement, method: "heuristic",
        });
      }
    }

    return railwayOk({ asOf, measured, estimated, observed, anomalies, thresholds, notes });
  }

  /** Compare two reports for sudden increases (reconciliation/history hook). */
  static detectSuddenIncreases(previous: CostReport, current: CostReport, ratio = 1.5): UsageAnomaly[] {
    const out: UsageAnomaly[] = [];
    for (const cur of current.estimated) {
      const prev = previous.estimated.find((p) => p.measurement === cur.measurement);
      if (prev && prev.value > 0 && cur.value / prev.value >= ratio) {
        out.push({
          kind: "sudden_increase", severity: "warning",
          detail: `estimated ${cur.measurement} rose from ${prev.value} to ${cur.value} (x${(cur.value / prev.value).toFixed(2)})`,
          measurement: cur.measurement, method: "heuristic",
        });
      }
    }
    return out;
  }
}
