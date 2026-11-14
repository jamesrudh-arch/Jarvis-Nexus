/**
 * @nexus/railway — real-time infrastructure monitoring (directive §5).
 *
 * Five INDEPENDENT dimensions, each reported separately — never conflated:
 *   A. Railway API health      (connectivity, auth, latency, rate limits)
 *   B. Deployment health       (lifecycle states, failures, timestamps)
 *   C. Application health      (direct HTTP checks — independent of the API)
 *   D. Dependency health       (app-reported component health + platform status)
 *   E. Infrastructure health   (volumes, domains, platform incidents)
 *
 * A successful deployment is never reported as a healthy application; a
 * healthy API is never reported as healthy infrastructure.
 */
import type { RailwayClient } from "./client";
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import type { DiscoveryService } from "./discovery";
import type { InfrastructureSnapshot } from "./model";
import { classifyDeploymentStatus } from "./model";

export type DimensionStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
export type DimensionName = "api" | "deployment" | "application" | "dependencies" | "infrastructure";

export interface EvidenceItem {
  source: string;
  summary: string;
  data?: unknown;
}

export interface DimensionResult {
  dimension: DimensionName;
  status: DimensionStatus;
  detail: string;
  evidence: EvidenceItem[];
  checkedAt: string;
}

export interface MonitoringReport {
  asOf: string;
  dimensions: DimensionResult[];
  /** Worst-of across dimensions (reporting convenience only). */
  overall: DimensionStatus;
}

export interface MonitoringOptions {
  /** Override app endpoint checks (tests / local isolation). */
  appUrlOverride?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Treat SLEEPING deployments as degraded (false) or healthy-idle (true). */
  sleepingIsHealthy?: boolean;
}

const WORST: Record<DimensionStatus, number> = { unhealthy: 0, degraded: 1, unknown: 2, healthy: 3 };

export class MonitoringService {
  constructor(
    private readonly client: RailwayClient,
    private readonly discovery: DiscoveryService,
    private readonly opts: MonitoringOptions = {},
  ) {}

  async runAll(existingSnapshot?: InfrastructureSnapshot): Promise<RailwayResult<MonitoringReport>> {
    const checkedAt = new Date().toISOString();
    // Snapshot: reuse the caller's, or discover fresh (client cache amortizes).
    let snapshot = existingSnapshot ?? null;
    let discoveryError: string | null = null;
    if (!snapshot) {
      const r = await this.discovery.discoverAll();
      if (r.ok) snapshot = r.value;
      else discoveryError = `${r.error.kind}: ${r.error.message}`;
    }

    const api = this.checkApi(checkedAt, discoveryError);
    const deployment = this.checkDeployments(snapshot, checkedAt, discoveryError);
    const application = await this.checkApplication(snapshot, checkedAt);
    const dependencies = await this.checkDependencies(snapshot, checkedAt);
    const infrastructure = this.checkInfrastructure(snapshot, checkedAt, discoveryError);

    const dimensions = [api, deployment, application, dependencies, infrastructure];
    const overall = dimensions.reduce<DimensionStatus>(
      (worst, d) => (WORST[d.status] < WORST[worst] ? d.status : worst),
      "healthy",
    );
    return railwayOk({ asOf: checkedAt, dimensions, overall });
  }

  // ---- A. Railway API health -------------------------------------------------
  private checkApi(checkedAt: string, discoveryError: string | null): DimensionResult {
    const stats = this.client.stats();
    const evidence: EvidenceItem[] = [];
    let status: DimensionStatus = "healthy";
    let detail = "Railway API reachable";

    if (discoveryError) {
      status = "unhealthy";
      detail = `Railway API discovery failed: ${discoveryError}`;
      evidence.push({ source: "discovery", summary: discoveryError });
    }
    if (stats.failures > 0 && stats.requests > 0) {
      const failureRate = stats.failures / (stats.requests + stats.failures);
      if (failureRate > 0.5) { status = "unhealthy"; detail = `Railway API failure rate ${(failureRate * 100).toFixed(0)}%`; }
      else if (failureRate > 0.1 && status === "healthy") { status = "degraded"; detail = `Railway API failure rate ${(failureRate * 100).toFixed(0)}%`; }
    }
    if (stats.breaker.state !== "closed") {
      status = "unhealthy";
      detail = `circuit breaker ${stats.breaker.state} (${stats.breaker.failures} consecutive failures)`;
    }
    if (stats.lastRate?.remaining !== undefined && stats.lastRate.remaining < 100) {
      if (status === "healthy") status = "degraded";
      detail += `; rate budget low (${stats.lastRate.remaining} remaining)`;
    }
    evidence.push({ source: "client_stats", summary: `${stats.requests} requests, ${stats.failures} failures, avg ${stats.avgLatencyMs}ms`, data: { ...stats } });
    return { dimension: "api", status, detail, evidence, checkedAt };
  }

  // ---- B. Deployment health ---------------------------------------------------
  private checkDeployments(snapshot: InfrastructureSnapshot | null, checkedAt: string, discoveryError: string | null): DimensionResult {
    if (!snapshot) {
      return {
        dimension: "deployment", status: "unknown",
        detail: `deployment state unavailable: ${discoveryError ?? "no snapshot"}`,
        evidence: [{ source: "discovery", summary: `no snapshot available (${discoveryError ?? "not discovered"})` }], checkedAt,
      };
    }
    const evidence: EvidenceItem[] = [];
    let status: DimensionStatus = "healthy";
    const details: string[] = [];

    if (snapshot.serviceInstances.length === 0) {
      return {
        dimension: "deployment", status: "unknown",
        detail: "no service instances visible to this token",
        evidence: [{ source: "discovery", summary: `0 service instances discovered (${snapshot.classifications.length} classification entries)` }], checkedAt,
      };
    }
    for (const si of snapshot.serviceInstances) {
      const latest = si.latestDeployment;
      if (!latest) {
        details.push(`${si.serviceName}: never deployed`);
        status = WORST[status] > WORST.degraded ? "degraded" : status;
        continue;
      }
      const cls = classifyDeploymentStatus(latest.status);
      evidence.push({ source: "latest_deployment", summary: `${si.serviceName}: ${latest.status} (${cls}) at ${latest.statusUpdatedAt ?? latest.createdAt}`, data: { serviceId: si.serviceId, deploymentId: latest.id, status: latest.status } });
      if (cls === "failed") {
        status = "unhealthy";
        details.push(`${si.serviceName}: latest deployment ${latest.status}`);
      } else if (cls === "transitioning" || cls === "approval_needed") {
        status = WORST[status] > WORST.degraded ? "degraded" : status;
        details.push(`${si.serviceName}: ${latest.status}`);
      } else if (cls === "sleeping" && !this.opts.sleepingIsHealthy) {
        status = WORST[status] > WORST.degraded ? "degraded" : status;
        details.push(`${si.serviceName}: sleeping`);
      } else if (cls === "unknown") {
        status = WORST[status] > WORST.unknown ? "unknown" : status;
        details.push(`${si.serviceName}: ${latest.status}`);
      }
    }
    const failedHistory = snapshot.recentDeployments.filter((d) => classifyDeploymentStatus(d.status) === "failed");
    if (failedHistory.length > 0) {
      evidence.push({ source: "deployment_history", summary: `${failedHistory.length} failed deployments in recent history`, data: failedHistory.slice(0, 5).map((d) => ({ id: d.id, status: d.status, createdAt: d.createdAt })) });
    }
    return {
      dimension: "deployment", status, detail: details.join("; ") || "all latest deployments healthy",
      evidence, checkedAt,
    };
  }

  // ---- C. Application health (direct HTTP — independent of the Railway API) ---
  private async checkApplication(snapshot: InfrastructureSnapshot | null, checkedAt: string): Promise<DimensionResult> {
    const fetchFn = this.opts.fetchFn ?? fetch;
    const timeoutMs = this.opts.timeoutMs ?? 8_000;
    const evidence: EvidenceItem[] = [];
    const targets: Array<{ name: string; url: string }> = [];

    if (this.opts.appUrlOverride) {
      targets.push({ name: "override", url: this.opts.appUrlOverride });
    } else if (snapshot) {
      for (const si of snapshot.serviceInstances) {
        for (const d of si.domains) {
          const path = si.healthcheckPath || "/health";
          targets.push({ name: `${si.serviceName} (${d.domain}${path})`, url: `https://${d.domain}${path}` });
        }
      }
    }

    if (targets.length === 0) {
      return {
        dimension: "application", status: "unknown",
        detail: "no application endpoints known (no domains discovered and no override configured)",
        evidence: [{ source: "discovery", summary: snapshot ? `${snapshot.serviceInstances.length} service instances carry no public domains` : "no discovery snapshot" }], checkedAt,
      };
    }

    let status: DimensionStatus = "healthy";
    const details: string[] = [];
    for (const t of targets.slice(0, 6)) {
      try {
        const res = await fetchFn(t.url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
        if (res.status >= 200 && res.status < 300) {
          evidence.push({ source: "http_check", summary: `${t.url} -> ${res.status}`, data: { url: t.url, status: res.status } });
        } else if (res.status === 503) {
          status = "unhealthy";
          evidence.push({ source: "http_check", summary: `${t.url} -> ${res.status} (application reports unhealthy)`, data: { url: t.url, status: res.status } });
          details.push(`${t.name}: HTTP ${res.status}`);
        } else if (res.status === 401 || res.status === 403) {
          // endpoints requiring owner auth are still proof the app is ALIVE
          if (status === "healthy") status = "degraded";
          evidence.push({ source: "http_check", summary: `${t.url} -> ${res.status} (alive, auth-gated)`, data: { url: t.url, status: res.status } });
        } else {
          status = "unhealthy";
          evidence.push({ source: "http_check", summary: `${t.url} -> ${res.status}`, data: { url: t.url, status: res.status } });
          details.push(`${t.name}: HTTP ${res.status}`);
        }
      } catch (e) {
        status = "unhealthy";
        const reason = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError") ? "timeout" : "unreachable";
        evidence.push({ source: "http_check", summary: `${t.url} -> ${reason}`, data: { url: t.url, error: reason } });
        details.push(`${t.name}: ${reason}`);
      }
    }
    return { dimension: "application", status, detail: details.join("; ") || "application endpoints responding", evidence, checkedAt };
  }

  // ---- D. Dependency health -----------------------------------------------------
  private async checkDependencies(snapshot: InfrastructureSnapshot | null, checkedAt: string): Promise<DimensionResult> {
    const fetchFn = this.opts.fetchFn ?? fetch;
    const timeoutMs = this.opts.timeoutMs ?? 8_000;
    const evidence: EvidenceItem[] = [];
    let status: DimensionStatus = "unknown";
    const details: string[] = [];

    // The application's own dependency view (database, providers, MCP, ...).
    const url = this.opts.appUrlOverride
      ? new URL("/health/detailed", this.opts.appUrlOverride).toString()
      : snapshot?.serviceInstances.flatMap((si) => si.domains.map((d) => `https://${d.domain}/health/detailed`))[0];
    if (url) {
      try {
        const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (res.status === 200) {
          const body = await res.json().catch(() => null) as { overall?: string; components?: Array<{ component?: string; status?: string }> } | null;
          const components = body?.components ?? [];
          const unhealthy = components.filter((c) => c.status === "unhealthy");
          const degraded = components.filter((c) => c.status === "degraded");
          status = unhealthy.length > 0 ? "unhealthy" : degraded.length > 0 ? "degraded" : "healthy";
          evidence.push({ source: "app_health_detailed", summary: `app reports overall=${body?.overall ?? "?"} (${unhealthy.length} unhealthy, ${degraded.length} degraded of ${components.length})`, data: { components: components.map((c) => ({ component: c.component, status: c.status })) } });
          if (unhealthy.length > 0) details.push(`app dependencies unhealthy: ${unhealthy.map((c) => c.component).join(", ")}`);
        } else {
          status = "unknown";
          evidence.push({ source: "app_health_detailed", summary: `HTTP ${res.status} — application dependency view unavailable` });
        }
      } catch (e) {
        status = "unknown";
        evidence.push({ source: "app_health_detailed", summary: `application dependency view unreachable (${e instanceof Error ? e.name : "error"}) — correlated with application dimension` });
      }
    }

    // Railway platform as an external dependency.
    const ps = snapshot?.platformStatus;
    if (ps) {
      if (!ps.isStable || ps.incident) {
        if (status === "healthy" || status === "unknown") status = "degraded";
        details.push(`Railway platform: ${ps.incident ? `incident ${ps.incident.status} — ${ps.incident.message}` : "unstable"}`);
      }
      if (ps.maintenance && ps.maintenance.status === "INPROGRESS") {
        if (status === "healthy") status = "degraded";
        details.push(`Railway maintenance in progress: ${ps.maintenance.message}`);
      }
      evidence.push({ source: "platform_status", summary: `isStable=${ps.isStable}${ps.incident ? `, incident=${ps.incident.status}` : ""}` });
    } else {
      evidence.push({ source: "platform_status", summary: "platform status unavailable" });
    }
    if (evidence.length === 0) {
      evidence.push({ source: "dependencies", summary: "no dependency sources available (no app endpoint, no platform status)" });
    }
    return { dimension: "dependencies", status, detail: details.join("; ") || "dependencies nominal", evidence, checkedAt };
  }

  // ---- E. Infrastructure health ----------------------------------------------------
  private checkInfrastructure(snapshot: InfrastructureSnapshot | null, checkedAt: string, discoveryError: string | null): DimensionResult {
    if (!snapshot) {
      return { dimension: "infrastructure", status: "unknown", detail: `infrastructure state unavailable: ${discoveryError ?? "no snapshot"}`, evidence: [], checkedAt };
    }
    const evidence: EvidenceItem[] = [];
    let status: DimensionStatus = "healthy";
    const details: string[] = [];

    for (const v of snapshot.volumes) {
      if (v.state === "ERROR") { status = "unhealthy"; details.push(`volume ${v.id} state=ERROR`); }
      else if (v.state !== "READY") { status = WORST[status] > WORST.degraded ? "degraded" : status; details.push(`volume ${v.id} state=${v.state}`); }
      if (v.currentSizeMB != null && v.sizeMB > 0 && v.currentSizeMB / v.sizeMB > 0.9) {
        status = WORST[status] > WORST.degraded ? "degraded" : status;
        details.push(`volume ${v.id} at ${Math.round((v.currentSizeMB / v.sizeMB) * 100)}% of ${v.sizeMB}MB`);
      }
      evidence.push({ source: "volume", summary: `${v.id}: ${v.state}, ${v.currentSizeMB ?? "?"}MB/${v.sizeMB}MB at ${v.mountPath}` });
    }
    const domainIssues = snapshot.serviceInstances.flatMap((si) => si.domains.filter((d) => !["ACTIVE", "SUCCESS", "VALID"].includes(d.status)));
    if (domainIssues.length > 0) {
      status = WORST[status] > WORST.degraded ? "degraded" : status;
      details.push(`${domainIssues.length} domain(s) not active`);
    }
    const ps = snapshot.platformStatus;
    if (ps && (!ps.isStable || ps.incident)) {
      status = WORST[status] > WORST.unhealthy ? "unhealthy" : status;
      details.push(`Railway platform incident: ${ps.incident?.status ?? "unstable"}`);
    }
    if (snapshot.projects.length === 0) {
      status = WORST[status] > WORST.unknown ? "unknown" : status;
      details.push("no projects visible — possible permission or scope limitation");
    }
    if (evidence.length === 0) {
      evidence.push({ source: "infrastructure", summary: `no volumes or domain issues recorded across ${snapshot.projects.length} project(s)` });
    }
    return { dimension: "infrastructure", status, detail: details.join("; ") || "infrastructure nominal", evidence, checkedAt };
  }
}
