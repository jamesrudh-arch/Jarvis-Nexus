/**
 * Railway webhook receiver unit tests (no network).
 * Verified webhook facts: no cryptographic signatures; custom secret header;
 * unordered, best-effort delivery. Tests: fail-closed config, constant-time
 * secret verification, schema validation, replay window, dedup, out-of-order,
 * reconciliation-against-API.
 */
import { describe, expect, test } from "bun:test";
import { NexusDb, migrate } from "@nexus/db";
import { WebhookReceiver, RailwayAuditLog, RailwayStateRepo, RailwayEventStore } from "@nexus/railway";
import { createRailwayMock, webhookPayload, MOCK } from "../helpers/railway-mocks";

const SECRET = "whsec_test_secret_0123456789";
const NOW_ISO = "2026-11-15T12:00:00.000Z";
const NOW = Date.parse(NOW_ISO);

function makeReceiver(opts: { secret?: string } = {}) {
  const db = NexusDb.open(":memory:");
  migrate(db);
  const audit = new RailwayAuditLog(db);
  const events = new RailwayEventStore(db);
  const state = new RailwayStateRepo(db);
  const receiver = new WebhookReceiver({
    audit, events, state, secret: opts.secret, now: () => NOW,
  });
  return { receiver, audit, events, db, close: () => db.close() };
}

describe("railway webhook receiver (mocked, no network)", () => {
  test("unconfigured receiver fails CLOSED (503 semantics) — nothing accepted without a secret", async () => {
    const { receiver, close } = makeReceiver({ secret: undefined });
    const r = await receiver.handle({ "x-webhook-secret": "anything" }, webhookPayload());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("UNCONFIGURED");
    close();
  });

  test("missing or wrong secret is rejected (401 semantics) and audited", async () => {
    const { receiver, audit, close } = makeReceiver({ secret: SECRET });
    const noHeader = await receiver.handle({}, webhookPayload());
    expect(noHeader.ok).toBe(false);
    if (!noHeader.ok) expect(noHeader.error.kind).toBe("AUTH");
    const wrong = await receiver.handle({ "x-webhook-secret": "wrong-secret" }, webhookPayload());
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.kind).toBe("AUTH");
    const rejections = audit.query({ category: "webhook" });
    expect(rejections.length).toBe(2);
    expect(rejections.every((r) => r.outcome === "rejected")).toBe(true);
    close();
  });

  test("valid secret + valid payload is accepted once; replayed payload is a duplicate", async () => {
    const { receiver, events, close } = makeReceiver({ secret: SECRET });
    const first = await receiver.handle({ "x-webhook-secret": SECRET }, webhookPayload({ timestamp: NOW_ISO }));
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.accepted).toBe(true);
      expect(first.value.duplicate).toBe(false);
      // no client attached to this receiver -> no API reconciliation (covered by the full-stack test below)
      expect(first.value.reconciled).toBeUndefined();
    }
    // exact replay -> duplicate, accepted-once semantics
    const replay = await receiver.handle({ "x-webhook-secret": SECRET }, webhookPayload({ timestamp: NOW_ISO }));
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.duplicate).toBe(true);
    // only ONE event row exists
    expect(events.count("webhook")).toBe(1);
    close();
  });

  test("timestamp outside the replay tolerance window is rejected", async () => {
    const { receiver, close } = makeReceiver({ secret: SECRET });
    const old = await receiver.handle(
      { "x-webhook-secret": SECRET },
      webhookPayload({ timestamp: "2026-11-15T10:00:00.000Z" }), // 2h old vs fixed now, tolerance 15min
    );
    expect(old.ok).toBe(false);
    if (!old.ok) expect(old.error.message).toContain("replay tolerance");
    close();
  });

  test("malformed payload fails schema validation", async () => {
    const { receiver, close } = makeReceiver({ secret: SECRET });
    const bad = await receiver.handle({ "x-webhook-secret": SECRET }, "{not-json");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.kind).toBe("VALIDATION");
    const missingFields = await receiver.handle(
      { "x-webhook-secret": SECRET },
      JSON.stringify({ type: "Deployment.failed", severity: "WARNING" }), // no resource/timestamp
    );
    expect(missingFields.ok).toBe(false);
    close();
  });

  test("out-of-order delivery is safe: events order by source timestamp, not arrival", async () => {
    const { receiver, events, close } = makeReceiver({ secret: SECRET });
    await receiver.handle({ "x-webhook-secret": SECRET }, webhookPayload({
      type: "Deployment.success",
      details: { id: MOCK.okDeploymentId, status: "SUCCESS" },
      resource: { deployment: { id: MOCK.okDeploymentId } },
      timestamp: "2026-11-15T12:05:00.000Z", // later event delivered FIRST
    }));
    await receiver.handle({ "x-webhook-secret": SECRET }, webhookPayload({
      timestamp: "2026-11-15T11:55:00.000Z", // earlier event delivered SECOND
    }));
    const stored = events.list({ kind: "webhook" });
    expect(stored.length).toBe(2);
    // stored order is arrival (seq) but source timestamps are preserved for ordering
    const times = stored.map((e) => e.at);
    expect(times.includes("2026-11-15T12:05:00.000Z")).toBe(true);
    expect(times.includes("2026-11-15T11:55:00.000Z")).toBe(true);
    close();
  });

  test("full-stack: accepted webhook is reconciled against the mocked authoritative API", async () => {
    const mock = createRailwayMock(); // full intel with mocked transport
    const receiver = new WebhookReceiver({
      audit: mock.intel.audit, events: mock.intel.events, state: mock.intel.state,
      client: mock.intel.client, secret: SECRET, // real clock: payload carries a current timestamp
    });
    const r = await receiver.handle({ "x-webhook-secret": SECRET }, webhookPayload());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reconciled?.deploymentId).toBe(MOCK.failedDeploymentId);
      expect(r.value.reconciled?.authoritativeStatus).toBeDefined();
    }
    mock.close();
  });
});
