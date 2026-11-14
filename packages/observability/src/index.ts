/**
 * @nexus/observability — unified operational intelligence (directive §14).
 * Structured logs, health aggregation, metrics, correlation ids.
 * Diagnostic components must never mask failures as healthy.
 */
import { nexusId, ID_PREFIXES, systemClock, type Clock } from "@nexus/core";
import type { HealthStatusSchema, MetricSchema } from "@nexus/contracts";
import type { z } from "zod";
import type { MetricsRepo } from "@nexus/db";

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type Metric = z.infer<typeof MetricSchema>;

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  component: string;
  message: string;
  correlationId?: string;
  data?: unknown;
}

export class NexusLogger {
  private entries: LogEntry[] = [];
  private readonly maxEntries = 2_000;

  constructor(private readonly sink: (e: LogEntry) => void = () => {}) {}

  log(level: LogLevel, component: string, message: string, data?: unknown, correlationId?: string): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(), level, component, message,
      correlationId, data,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
    this.sink(entry);
    if (level === "error") console.error(JSON.stringify(entry));
    else if (level === "warn") console.warn(JSON.stringify(entry));
  }
  debug(c: string, m: string, d?: unknown, cid?: string) { this.log("debug", c, m, d, cid); }
  info(c: string, m: string, d?: unknown, cid?: string) { this.log("info", c, m, d, cid); }
  warn(c: string, m: string, d?: unknown, cid?: string) { this.log("warn", c, m, d, cid); }
  error(c: string, m: string, d?: unknown, cid?: string) { this.log("error", c, m, d, cid); }

  recent(filter?: { level?: LogLevel; component?: string; limit?: number }): LogEntry[] {
    return this.entries
      .filter((e) => (filter?.level ? e.level === filter.level : true))
      .filter((e) => (filter?.component ? e.component === filter.component : true))
      .slice(-(filter?.limit ?? 100));
  }
}

export type HealthProbe = () => Promise<HealthStatus> | HealthStatus;

export class HealthRegistry {
  private probes = new Map<string, { component: string; probe: HealthProbe }>();

  register(component: string, probe: HealthProbe): void {
    this.probes.set(component, { component, probe });
  }

  /** Runs all probes; aggregates worst status. Failures are NEVER masked (§14). */
  async check(): Promise<{ overall: HealthStatus["status"]; components: HealthStatus[] }> {
    const components: HealthStatus[] = [];
    for (const { component, probe } of this.probes.values()) {
      try {
        components.push(await probe());
      } catch (e) {
        components.push({
          component, status: "unhealthy", detail: String(e).slice(0, 300),
          checkedAt: new Date().toISOString(),
        });
      }
    }
    const overall: HealthStatus["status"] = components.some((c) => c.status === "unhealthy")
      ? "unhealthy"
      : components.some((c) => c.status === "degraded")
        ? "degraded"
        : components.length === 0 ? "unknown" as HealthStatus["status"] : "healthy";
    return { overall, components };
  }
}

export class MetricsCollector {
  private counters = new Map<string, number>();
  private readonly clock: Clock;

  constructor(private readonly repo?: MetricsRepo, clock?: Clock) {
    this.clock = clock ?? systemClock;
  }

  increment(name: string, labels: Record<string, string> = {}, by = 1): void {
    const key = `${name}|${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
    this.repo?.record(name, by, labels);
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.repo?.record(name, value, labels);
  }

  snapshot(): Array<{ name: string; labels: Record<string, string>; count: number }> {
    return [...this.counters.entries()].map(([key, count]) => {
      const [name, labelsRaw] = key.split("|");
      return { name: name!, labels: JSON.parse(labelsRaw!) as Record<string, string>, count };
    });
  }
}

export function newCorrelationId(): string {
  return nexusId(ID_PREFIXES.req);
}
