/**
 * @nexus/railway — infrastructure state reconciliation (directive §11).
 *
 * Authoritative comparison: actual Railway state (discovery) vs JARVIS
 * internal state (last persisted snapshot). Detects missing resources,
 * unexpected resources, deployment discrepancies, stale records and
 * unexpected configuration changes.
 *
 * Reconcile REPORTS — it never silently overwrites internal records. The
 * internal snapshot advances only through the explicit `persistSnapshot()`
 * path, and reconciliation history is retained.
 */
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import type { DiscoveryService } from "./discovery";
import type { RailwayAuditLog } from "./audit";
import type { RailwayStateRepo, RailwayEventStore } from "./state";
import type { InfrastructureSnapshot } from "./model";
import { deploymentFingerprint } from "./model";

export type DiscrepancyKind =
  | "missing_in_actual"     // internal knows it, Railway no longer has it (deleted externally)
  | "missing_in_internal"   // Railway has it, JARVIS never recorded it (new / lost event)
  | "status_mismatch"       // both have it, state differs (unexpected change)
  | "unexpected_resource"   // resource class present but not modeled
  | "stale_record";         // internal snapshot too old to be authoritative

export interface Discrepancy {
  kind: DiscrepancyKind;
  resource: string;
  detail: string;
}

export interface ReconciliationReport {
  id: string;
  at: string;
  internalAsOf: string | null;
  actualAsOf: string;
  discrepancies: Discrepancy[];
  summary: string;
  recommendation: string;
}

export interface SnapshotRecord {
  asOf: string;
  snapshot: InfrastructureSnapshot;
}

const STALE_AFTER_MS = 10 * 60 * 1000;

export interface ReconciliationDeps {
  discovery: DiscoveryService;
  state: RailwayStateRepo;
  events: RailwayEventStore;
  audit: RailwayAuditLog;
  now?: () => number;
  staleAfterMs?: number;
}

export class ReconciliationService {
  constructor(private readonly deps: ReconciliationDeps) {}

  /** The ONLY sanctioned way internal state advances (with history). */
  persistSnapshot(snapshot: InfrastructureSnapshot): void {
    const record: SnapshotRecord = { asOf: snapshot.asOf, snapshot };
    this.deps.state.set("snapshot:latest", record);
    this.deps.state.appendHistory("snapshot:history", record, 20);
    this.deps.events.appendIdempotent({
      id: `snapshot:${snapshot.asOf}`,
      kind: "discovery", source: "railway-api",
      at: snapshot.asOf,
      doc: { asOf: snapshot.asOf, projects: snapshot.projects.length, serviceInstances: snapshot.serviceInstances.length, volumes: snapshot.volumes.length },
    });
  }

  latestInternal(): SnapshotRecord | null {
    return this.deps.state.get<SnapshotRecord>("snapshot:latest");
  }

  async reconcile(): Promise<RailwayResult<ReconciliationReport>> {
    const nowMs = (this.deps.now ?? Date.now)();
    const actualRes = await this.deps.discovery.discoverAll();
    if (!actualRes.ok) return { ok: false, error: actualRes.error };
    const actual = actualRes.value;
    const internal = this.latestInternal();
    const discrepancies: Discrepancy[] = [];

    if (!internal) {
      discrepancies.push({
        kind: "missing_in_internal",
        resource: "*",
        detail: "no internal snapshot exists — first discovery; run persistSnapshot to establish the internal baseline",
      });
    } else {
      // --- projects ---
      diffSets(
        internal.snapshot.projects.map((p) => p.id),
        actual.projects.map((p) => p.id),
        (id) => discrepancies.push({ kind: "missing_in_actual", resource: `project:${id}`, detail: "project disappeared from Railway (deleted or access revoked)" }),
        (id) => discrepancies.push({ kind: "missing_in_internal", resource: `project:${id}`, detail: "new or previously unrecorded project" }),
      );
      // --- service instances + latest deployment fingerprints ---
      const internalInstances = new Map(internal.snapshot.serviceInstances.map((si) => [si.id, si]));
      for (const si of actual.serviceInstances) {
        const prev = internalInstances.get(si.id);
        if (!prev) {
          discrepancies.push({ kind: "missing_in_internal", resource: `serviceInstance:${si.id}`, detail: `service instance ${si.serviceName} appeared outside normal discovery flow` });
          continue;
        }
        if (deploymentFingerprint(prev.latestDeployment ?? emptyDeployment(si.id)) !== deploymentFingerprint(si.latestDeployment ?? emptyDeployment(si.id))) {
          discrepancies.push({
            kind: "status_mismatch",
            resource: `serviceInstance:${si.id}`,
            detail: `deployment changed: ${prev.latestDeployment?.status ?? "none"}@${prev.latestDeployment?.statusUpdatedAt ?? "?"} -> ${si.latestDeployment?.status ?? "none"}@${si.latestDeployment?.statusUpdatedAt ?? "?"}`,
          });
        }
      }
      for (const prev of internal.snapshot.serviceInstances) {
        if (!actual.serviceInstances.some((si) => si.id === prev.id)) {
          discrepancies.push({ kind: "missing_in_actual", resource: `serviceInstance:${prev.id}`, detail: `service instance ${prev.serviceName} no longer present in the environment` });
        }
      }
      // --- volumes ---
      diffSets(
        internal.snapshot.volumes.map((v) => v.id),
        actual.volumes.map((v) => v.id),
        (id) => discrepancies.push({ kind: "missing_in_actual", resource: `volume:${id}`, detail: "volume missing from Railway (deleted — data at risk)" }),
        (id) => discrepancies.push({ kind: "missing_in_internal", resource: `volume:${id}`, detail: "unrecorded volume appeared" }),
      );
      // --- staleness ---
      const ageMs = nowMs - Date.parse(internal.asOf);
      if (ageMs > (this.deps.staleAfterMs ?? STALE_AFTER_MS)) {
        discrepancies.push({
          kind: "stale_record",
          resource: "snapshot:latest",
          detail: `internal snapshot is ${Math.round(ageMs / 60000)} minutes old (stale threshold ${Math.round((this.deps.staleAfterMs ?? STALE_AFTER_MS) / 60000)} min) — polling/webhook flow may be interrupted`,
        });
      }
    }

    const report: ReconciliationReport = {
      id: `recon_${nowMs}_${Math.floor(Math.random() * 1e6)}`,
      at: new Date(nowMs).toISOString(),
      internalAsOf: internal?.asOf ?? null,
      actualAsOf: actual.asOf,
      discrepancies,
      summary: discrepancies.length === 0
        ? "internal state matches authoritative Railway state"
        : `${discrepancies.length} discrepancy(ies): ${discrepancies.map((d) => d.kind).join(", ")}`,
      recommendation: discrepancies.length === 0
        ? "no action required"
        : "review discrepancies; persistSnapshot() only after the owner confirms the authoritative state should be adopted (internal records are never silently overwritten)",
    };

    this.deps.state.appendHistory("reconciliation:history", report, 50);
    this.deps.events.appendIdempotent({
      id: `reconciliation:${report.at}`,
      kind: "reconciliation", source: "internal", at: report.at,
      doc: { id: report.id, discrepancies: discrepancies.length, summary: report.summary },
    });
    this.deps.audit.record({
      category: "reconciliation",
      severity: discrepancies.length === 0 ? "info" : "warning",
      component: "railway.reconciliation",
      outcome: "success",
      evidence: { reportId: report.id, discrepancyCount: discrepancies.length, kinds: [...new Set(discrepancies.map((d) => d.kind))] },
    });
    return railwayOk(report);
  }

  /** "What changed?" — diff the two most recent internal snapshots. */
  whatChanged(): Array<{ resource: string; change: string }> {
    const history = this.deps.state.get<SnapshotRecord[]>("snapshot:history") ?? [];
    if (history.length < 2) return [];
    const [prev, curr] = [history[history.length - 2]!, history[history.length - 1]!];
    const changes: Array<{ resource: string; change: string }> = [];
    for (const si of curr.snapshot.serviceInstances) {
      const before = prev.snapshot.serviceInstances.find((s) => s.id === si.id);
      if (!before) changes.push({ resource: `serviceInstance:${si.serviceName}`, change: "appeared" });
      else if (before.latestDeployment?.id !== si.latestDeployment?.id) {
        changes.push({ resource: `serviceInstance:${si.serviceName}`, change: `deployment ${before.latestDeployment?.id ?? "none"} -> ${si.latestDeployment?.id ?? "none"} (${si.latestDeployment?.status ?? "?"})` });
      } else if (before.latestDeployment?.status !== si.latestDeployment?.status) {
        changes.push({ resource: `serviceInstance:${si.serviceName}`, change: `deployment status ${before.latestDeployment?.status} -> ${si.latestDeployment?.status}` });
      }
    }
    for (const before of prev.snapshot.serviceInstances) {
      if (!curr.snapshot.serviceInstances.some((s) => s.id === before.id)) {
        changes.push({ resource: `serviceInstance:${before.serviceName}`, change: "removed" });
      }
    }
    return changes;
  }

  history(limit = 20): ReconciliationReport[] {
    const list = this.deps.state.get<ReconciliationReport[]>("reconciliation:history") ?? [];
    return list.slice(-limit).reverse();
  }
}

function diffSets(internal: string[], actual: string[], onMissingActual: (id: string) => void, onMissingInternal: (id: string) => void): void {
  const actualSet = new Set(actual);
  const internalSet = new Set(internal);
  for (const id of internal) if (!actualSet.has(id)) onMissingActual(id);
  for (const id of actual) if (!internalSet.has(id)) onMissingInternal(id);
}

function emptyDeployment(id: string): Parameters<typeof deploymentFingerprint>[0] {
  return {
    id, status: "UNKNOWN", environmentId: "", projectId: "",
    createdAt: "", updatedAt: null, statusUpdatedAt: null,
  };
}
