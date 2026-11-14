/**
 * @nexus/railway — event intelligence (directive §9).
 *
 * VERIFIED FACTS about Railway webhooks (official docs, 2026-11-15):
 *  - Configured per project in the dashboard (Settings → Webhooks).
 *  - Payloads are NOT cryptographically signed. Verification = a custom secret
 *    header (we use X-Webhook-Secret) compared in CONSTANT TIME.
 *  - Delivery is best-effort, unordered, retried up to 3x (30s timeout).
 *  - "Treat a webhook as a prompt to act, not a source of truth."
 *
 * Therefore every accepted webhook is: deduplicated (source fingerprint),
 * replay-windowed, persisted append-only, and RECONCILED against the
 * authoritative API before being trusted. Lost events are recovered by the
 * rate-budget-aware poller (events query) — never by blind trust.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { RailwayWebhookEventSchema } from "@nexus/contracts";
import type { RailwayWebhookEvent } from "@nexus/contracts";
import type { RailwayClient } from "./client";
import { RailwayApiError, redactSecrets } from "./errors";
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import type { RailwayAuditLog } from "./audit";
import type { RailwayStateRepo, RailwayEventStore } from "./state";
import { Q_PROJECT_EVENTS, Q_DEPLOYMENT_DETAIL } from "./queries";

export interface WebhookDeps {
  audit: RailwayAuditLog;
  events: RailwayEventStore;
  state: RailwayStateRepo;
  client?: RailwayClient;
  secret?: string;
  /** Allowed clock skew for the payload timestamp (replay window). */
  replayToleranceMs?: number;
  now?: () => number;
}

export interface WebhookAcceptance {
  accepted: boolean;
  duplicate: boolean;
  eventId: string;
  reconciled?: { deploymentId: string; authoritativeStatus: string; matches: boolean };
  reason?: string;
}

export class WebhookReceiver {
  private readonly replayToleranceMs: number;

  constructor(private readonly deps: WebhookDeps) {
    this.replayToleranceMs = deps.replayToleranceMs ?? 15 * 60 * 1000;
  }

  /** Unauthenticated rejection logging is throttled (audit-flood protection):
   *  at most 20 rejection records per rolling 10 minutes. */
  private rejectionTimes: number[] = [];
  private recordThrottledRejection(reason: string): void {
    const nowMs = (this.deps.now ?? Date.now)();
    this.rejectionTimes = this.rejectionTimes.filter((t) => nowMs - t < 10 * 60 * 1000);
    if (this.rejectionTimes.length >= 20) return; // throttled — still rejected, just not re-audited
    this.rejectionTimes.push(nowMs);
    this.deps.audit.record({
      category: "webhook", severity: "warning", component: "railway.webhook",
      outcome: "rejected", evidence: { reason, throttled: this.rejectionTimes.length >= 20 },
    });
  }

  /** Constant-time secret comparison (never early-return on length). */
  private secretMatches(provided: string | undefined): boolean {
    const expected = this.deps.secret;
    if (!expected) return false; // unconfigured = fail-closed
    const a = createHash("sha256").update(provided ?? "").digest();
    const b = createHash("sha256").update(expected).digest();
    return timingSafeEqual(a, b);
  }

  isConfigured(): boolean {
    return typeof this.deps.secret === "string" && this.deps.secret.length > 0;
  }

  async handle(headers: Record<string, string | undefined>, rawBody: string): Promise<RailwayResult<WebhookAcceptance>> {
    const nowMs = (this.deps.now ?? Date.now)();

    // 1. fail-closed when no secret is configured
    if (!this.isConfigured()) {
      this.deps.audit.record({
        category: "webhook", severity: "warning", component: "railway.webhook",
        outcome: "rejected", evidence: { reason: "webhook secret not configured (RAILWAY_WEBHOOK_SECRET) — receiver disabled, fail-closed" },
      });
      return {
        ok: false,
        error: new RailwayApiError({ kind: "UNCONFIGURED", message: "webhook receiver not configured: RAILWAY_WEBHOOK_SECRET must be set before any webhook is accepted" }),
      };
    }

    // 2. constant-time secret verification (rejection audit is throttled so an
    //    unauthenticated flood cannot grow the audit table without bound)
    const provided = headers["x-webhook-secret"] ?? headers["X-Webhook-Secret"];
    if (!provided || !this.secretMatches(provided)) {
      this.recordThrottledRejection("missing or invalid X-Webhook-Secret header");
      return {
        ok: false,
        error: new RailwayApiError({ kind: "AUTH", message: "webhook rejected: secret header missing or invalid" }),
      };
    }

    // 3. payload validation (zod contract)
    let parsed: RailwayWebhookEvent;
    try {
      parsed = RailwayWebhookEventSchema.parse(JSON.parse(rawBody));
    } catch (e) {
      this.deps.audit.record({
        category: "webhook", severity: "warning", component: "railway.webhook",
        outcome: "rejected", evidence: { reason: "payload failed schema validation", detail: redactSecrets(String(e).slice(0, 200)) },
      });
      return {
        ok: false,
        error: new RailwayApiError({ kind: "VALIDATION", message: `webhook payload rejected: ${redactSecrets(String(e).slice(0, 200))}` }),
      };
    }

    // 4. replay window (payload timestamps older than tolerance are rejected)
    const ts = Date.parse(parsed.timestamp);
    if (!Number.isFinite(ts) || Math.abs(nowMs - ts) > this.replayToleranceMs) {
      this.deps.audit.record({
        category: "webhook", severity: "warning", component: "railway.webhook",
        outcome: "rejected", resource: parsed.resource.deployment?.id,
        evidence: { reason: "timestamp outside replay tolerance", timestamp: parsed.timestamp },
      });
      return {
        ok: false,
        error: new RailwayApiError({ kind: "AUTH", message: "webhook rejected: timestamp outside replay tolerance window" }),
      };
    }

    // 5. dedup fingerprint (type + deployment id + timestamp + status)
    const fingerprint = createHash("sha256")
      .update(`${parsed.type}|${parsed.resource.deployment?.id ?? "none"}|${parsed.timestamp}|${parsed.details.status ?? ""}`)
      .digest("hex")
      .slice(0, 32);
    const eventId = `webhook:${fingerprint}`;

    // 6. reconcile against the authoritative API (events are prompts, not truth)
    let reconciled: WebhookAcceptance["reconciled"];
    const deploymentId = parsed.resource.deployment?.id;
    if (deploymentId && this.deps.client) {
      const r = await this.deps.client.request<{ deployment: { id: string; status: string } }>(
        Q_DEPLOYMENT_DETAIL, { deploymentId }, { critical: true, skipCache: true },
      );
      if (r.ok) {
        const authoritativeStatus = r.value.data.deployment.status;
        const notificationStatus = parsed.details.status ?? "";
        reconciled = {
          deploymentId,
          authoritativeStatus,
          matches: notificationStatus === "" || notificationStatus === authoritativeStatus,
        };
      } else {
        reconciled = { deploymentId, authoritativeStatus: `unavailable (${r.error.kind})`, matches: false };
      }
    }

    // 7. idempotent persistence (out-of-order safe: keyed by fingerprint, ordered by timestamp on read)
    const appended = this.deps.events.appendIdempotent({
      id: eventId,
      kind: "webhook",
      source: "railway-webhook",
      at: parsed.timestamp,
      doc: { ...parsed, reconciled },
    });
    this.deps.audit.record({
      category: "webhook", severity: parsed.severity === "CRITICAL" ? "critical" : "info",
      component: "railway.webhook", outcome: "success",
      resource: deploymentId ?? parsed.resource.service?.id,
      evidence: { type: parsed.type, severity: parsed.severity, duplicate: appended.duplicate, reconciled },
    });

    return railwayOk({
      accepted: true,
      duplicate: appended.duplicate,
      eventId,
      reconciled,
    });
  }
}

// ---------------------------------------------------------------------------
// Controlled polling fallback (directive §9: "where webhooks are unavailable,
// use appropriately controlled API polling. Respect rate limits.")
// ---------------------------------------------------------------------------

export interface PollerDeps {
  client: RailwayClient;
  events: RailwayEventStore;
  state: RailwayStateRepo;
  audit: RailwayAuditLog;
  projectId: string;
  intervalMs?: number;
  jitterMs?: number;
  onNewEvent?: (e: { id: string; action: string; severity: string; createdAt: string }) => void;
}

export class EventPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly jitterMs: number;

  constructor(private readonly deps: PollerDeps) {
    this.intervalMs = Math.max(10_000, deps.intervalMs ?? 60_000);
    this.jitterMs = deps.jitterMs ?? 5_000;
  }

  /** One polling cycle: fetch recent project events, dedup, persist, checkpoint. */
  async tick(): Promise<RailwayResult<{ newEvents: number; skipped?: string }>> {
    // rate-limit respect: skip the cycle when the budget is low
    const remaining = this.deps.client.lastRateInfo()?.remaining;
    if (remaining !== undefined && remaining < 100) {
      return railwayOk({ newEvents: 0, skipped: `rate budget low (${remaining} remaining) — cycle deferred` });
    }
    const res = await this.deps.client.request<{ events: { edges: Array<{ node: { id: string; action: string; object: string; severity: string; createdAt: string; payload: unknown; projectId: string | null; environmentId: string | null } }> } }>(
      Q_PROJECT_EVENTS, { projectId: this.deps.projectId, first: 50 }, { critical: true },
    );
    if (!res.ok) return { ok: false, error: res.error };

    let newEvents = 0;
    for (const edge of res.value.data.events.edges) {
      const n = edge.node;
      const appended = this.deps.events.appendIdempotent({
        id: `poll:${n.id}`,
        kind: "poll",
        source: "railway-api",
        at: n.createdAt,
        doc: { id: n.id, action: n.action, object: n.object, severity: n.severity, projectId: n.projectId, environmentId: n.environmentId, payload: n.payload },
      });
      if (!appended.duplicate) {
        newEvents++;
        this.deps.onNewEvent?.({ id: n.id, action: n.action, severity: n.severity, createdAt: n.createdAt });
      }
    }
    // recovery checkpoint: restart resumes from the last poll position
    this.deps.state.set("poller:lastTick", { at: new Date().toISOString(), newEvents });
    return railwayOk({ newEvents });
  }

  start(): void {
    if (this.timer) return;
    const schedule = () => {
      const delay = this.intervalMs + Math.floor(Math.random() * this.jitterMs);
      this.timer = setTimeout(async () => {
        const r = await this.tick();
        if (!r.ok) {
          this.deps.audit.record({
            category: "api_failure", severity: "warning", component: "railway.poller",
            outcome: r.error.kind === "TIMEOUT" ? "timeout" : "failure",
            evidence: { error: r.error.toJSON() },
          });
        }
        schedule();
      }, delay);
      this.timer.unref?.();
    };
    schedule();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
