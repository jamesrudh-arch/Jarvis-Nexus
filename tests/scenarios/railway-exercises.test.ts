/**
 * End-to-end operational exercises (directive §17, Scenarios A-I).
 * Executed against a MOCKED Railway transport (clearly labelled MOCK) and a
 * REAL local app store — no production infrastructure is touched. The LIVE
 * production variants run in tests/integration/railway-live.test.ts.
 *
 * Where an exercise cannot be completed safely against PRODUCTION
 * (H: authorized recovery execution; I: volume backup restore), it is
 * exercised in isolation here and the production variant is honestly marked
 * BLOCKED in the acceptance matrix.
 */
import { describe, expect, test } from "bun:test";
import { createRailwayMock, webhookPayload, MOCK } from "../helpers/railway-mocks";
import { BackupService, NEXUS_TABLES } from "@nexus/railway";
import type { InfrastructureSnapshot, Investigation, RecoveryPlan } from "@nexus/railway";
import { NexusDb, migrate } from "@nexus/db";

type Res<T> = { ok: true; value: T } | { ok: false; error: unknown };
function unwrap<T>(r: Res<T>, what: string): T {
  if (!r.ok) throw new Error(`precondition failed (${what})`);
  return r.value;
}

describe("Scenario A — deployment failure investigation (MOCK)", () => {
  test("detect -> evidence -> logs -> cause -> recommendation, end to end", async () => {
    const mock = createRailwayMock({ dataset: { latestDeploymentStatus: "FAILED", historyStatuses: ["FAILED", "SUCCESS"] } });
    // 1. detect via monitoring
    const mon = await mock.intel.runMonitoringCycle();
    expect(mon).not.toBeNull();
    const depDim = mon!.dimensions.find((d) => d.dimension === "deployment")!;
    expect(depDim.status).toBe("unhealthy");
    // 2. investigate
    const inv = unwrap(await mock.intel.diagnostics.investigate({ kind: "deployment_failure", resourceIds: [MOCK.failedDeploymentId] }), "investigate");
    expect(inv.causeClassification).toBe("CONFIRMED");
    // 3. recovery recommendation exists with an executable L3 operation
    const rec = inv.recommendations.find((r) => r.operationId);
    expect(rec?.operationId).toBeDefined();
    // 4. plan creation succeeds
    const plan = unwrap(mock.intel.recovery.createPlan(inv), "plan");
    expect(plan.step.operationId).toBe("railway.deployment.rollback");
    mock.close();
  });
});

describe("Scenario B — application outage despite successful deployment (MOCK)", () => {
  test("deployment=healthy and application=unhealthy are reported INDEPENDENTLY", async () => {
    const mock = createRailwayMock({ dataset: { latestDeploymentStatus: "SUCCESS", appHealthStatus: 503 } });
    const mon = await mock.intel.runMonitoringCycle();
    const deployment = mon!.dimensions.find((d) => d.dimension === "deployment")!;
    const application = mon!.dimensions.find((d) => d.dimension === "application")!;
    expect(deployment.status).toBe("healthy");       // deployment dimension honest
    expect(application.status).toBe("unhealthy");    // app dimension honest — never conflated
    expect(mon!.overall).toBe("unhealthy");
    mock.close();
  });
});

describe("Scenario C — credential failure detection without secret exposure (MOCK)", () => {
  test("auth error is classified and never leaks the token; unconfigured fails closed", async () => {
    const { RailwayClient, CredentialManager } = await import("@nexus/railway");
    const rejectingFetch = (async () =>
      new Response(JSON.stringify({ errors: [{ message: "Not Authorized" }] }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const client = new RailwayClient({
      credentials: new CredentialManager({ RAILWAY_API_TOKEN: "rlwy_wksp_revoked_revoked_revoked_000001" }),
      fetchFn: rejectingFetch, sleepFn: async () => {},
    });
    const r = await client.authCheck();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("AUTH");
      expect(JSON.stringify(r.error.toJSON()).includes("rlwy_wksp_revoked")).toBe(false); // no secret in the error
    }
    // unconfigured degrades honestly
    const mock2 = createRailwayMock({ env: { RAILWAY_API_TOKEN: undefined } });
    const health = mock2.intel.healthComponent();
    expect(health.status).toBe("degraded");
    expect(health.detail).toContain("not configured");
    mock2.close();
  });
});

describe("Scenario D — infrastructure discrepancy detection (MOCK)", () => {
  test("state divergence between Railway and internal records is detected and reported", async () => {
    const mock = createRailwayMock();
    const snap = unwrap(await mock.intel.discovery.discoverAll(), "discovery") as InfrastructureSnapshot;
    mock.intel.reconciliation.persistSnapshot(snap);
    // external change: deployment flips to FAILED
    mock.dataset.latestDeploymentStatus = "FAILED";
    mock.intel.client.invalidateCache();
    const r = unwrap(await mock.intel.reconciliation.reconcile(), "reconcile");
    expect(r.discrepancies.some((d) => d.kind === "status_mismatch")).toBe(true);
    mock.close();
  });
});

describe("Scenario E — abnormal resource consumption (MOCK)", () => {
  test("usage anomalies fire: threshold breach + volume pressure; measured vs estimated stay distinct", async () => {
    const mock = createRailwayMock({ env: { RAILWAY_USAGE_THRESHOLDS: JSON.stringify({ DISK_USAGE_GB: 1 }) } });
    mock.dataset.estimatedDiskGb = 5.2;     // threshold 1 -> breach
    mock.dataset.volumeCurrentSizeMB = 495; // 495/512 -> pressure
    mock.intel.client.invalidateCache();
    const snap = unwrap(await mock.intel.discovery.discoverAll(), "discovery") as InfrastructureSnapshot;
    const report = unwrap(await mock.intel.usage.report(snap), "usage");
    const kinds = report.anomalies.map((a) => a.kind);
    expect(kinds.includes("threshold_exceeded")).toBe(true);
    expect(kinds.includes("volume_pressure")).toBe(true);
    // measured vs estimated kept distinct with honest labelling
    expect(report.measured.every((m) => m.kind === "measured")).toBe(true);
    expect(report.estimated.every((m) => m.kind === "estimated")).toBe(true);
    expect(report.notes.some((n) => n.includes("no currency figure is fabricated"))).toBe(true);
    mock.close();
  });
});

describe("Scenario F — lost event recovery via controlled polling (MOCK)", () => {
  test("poller tick ingests missed events; duplicates never double-record; checkpoint persisted", async () => {
    const mock = createRailwayMock();
    expect(mock.intel.poller).not.toBeNull();
    const first = unwrap(await mock.intel.poller!.tick(), "tick1");
    expect(first.newEvents).toBe(1); // evt-1 ingested
    const second = unwrap(await mock.intel.poller!.tick(), "tick2");
    expect(second.newEvents).toBe(0); // dedup: same events again
    expect(mock.intel.events.count("poll")).toBe(1);
    // restart recovery: checkpoint recorded
    const checkpoint = mock.intel.state.get<{ at: string }>("poller:lastTick");
    expect(checkpoint?.at).toBeDefined();
    // new event arrives -> visibility restored
    mock.dataset.events!.push({ id: "evt-2", action: "deployment.status", object: "Deployment", severity: "WARNING", createdAt: "2026-11-15T12:10:00.000Z" });
    mock.intel.client.invalidateCache();
    const third = unwrap(await mock.intel.poller!.tick(), "tick3");
    expect(third.newEvents).toBe(1);
    expect(mock.intel.events.count("poll")).toBe(2);
    mock.close();
  });
});

describe("Scenario G — monitoring survives primary-application unavailability (MOCK)", () => {
  test("the intelligence module monitors the DOWN app from outside the app process", async () => {
    const mock = createRailwayMock({ dataset: { appHealthUnreachable: true, latestDeploymentStatus: "SUCCESS" } });
    const mon = await mock.intel.runMonitoringCycle();
    expect(mon).not.toBeNull();
    const application = mon!.dimensions.find((d) => d.dimension === "application")!;
    expect(application.status).toBe("unhealthy");
    expect(application.evidence.some((e) => e.summary.includes("unreachable"))).toBe(true);
    const api = mon!.dimensions.find((d) => d.dimension === "api")!;
    expect(api.status).toBe("healthy"); // monitoring itself is alive
    // evidence preserved during the outage
    expect(mock.intel.state.get("monitoring:latest")).not.toBeNull();
    mock.close();
  });
});

describe("Scenario H — authorized recovery in an ISOLATED environment (MOCK mutations)", () => {
  test("full authorized loop: diagnose -> plan -> owner grant -> execute -> independent verification", async () => {
    const mock = createRailwayMock({ readOnly: false, dataset: { latestDeploymentStatus: "FAILED", historyStatuses: ["FAILED", "SUCCESS"] } });
    const inv = unwrap(await mock.intel.diagnostics.investigate({ kind: "deployment_failure", resourceIds: [MOCK.failedDeploymentId] }), "investigate") as Investigation;
    const plan = unwrap(mock.intel.recovery.createPlan(inv), "plan") as RecoveryPlan;

    // agent authorization attempt -> denied (never self-approved)
    const agentDecision = mock.intel.authorization.requestAuthorization({
      operationId: plan.step.operationId, resourceIds: plan.step.resourceIds,
      scope: "recovery", principal: { type: "agent", id: "jarvis" },
    });
    expect(agentDecision.granted).toBe(false);

    // owner authorization -> granted
    const ownerDecision = mock.intel.authorization.requestAuthorization({
      operationId: plan.step.operationId, resourceIds: plan.step.resourceIds,
      scope: `recovery plan ${plan.id}`, principal: { type: "user", id: "owner" },
    });
    expect(ownerDecision.granted).toBe(true);

    // execute with the grant -> mutation runs against MOCK, then outcome is verified by re-query
    const execution = unwrap(await mock.intel.recovery.execute(plan.id, ownerDecision.grantId!, "user:owner"), "execute");
    expect(execution.steps[0]!.mutationExecuted).toBe(true);
    expect(execution.verified).toBe(true);
    expect(execution.steps[0]!.verification.method).toContain("re-query");
    // the mutation was recorded (never executed against real infrastructure)
    expect(mock.dataset.mutationsExecuted?.length).toBe(1);
    // grant consumed: a second execution attempt with the same grant fails
    const replay = await mock.intel.recovery.execute(plan.id, ownerDecision.grantId!, "user:owner");
    expect(replay.ok).toBe(false);
    mock.close();
  });

  test("read-only mode refuses execution even with a forged valid-looking grant (production protection)", async () => {
    const mock = createRailwayMock({ readOnly: true, dataset: { latestDeploymentStatus: "FAILED" } });
    const inv = unwrap(await mock.intel.diagnostics.investigate({ kind: "deployment_failure", resourceIds: [MOCK.failedDeploymentId] }), "investigate") as Investigation;
    const plan = unwrap(mock.intel.recovery.createPlan(inv), "plan") as RecoveryPlan;
    const execution = await mock.intel.recovery.execute(plan.id, "nexus_gnt_forged", "user:owner");
    expect(execution.ok).toBe(false);
    if (!execution.ok) expect(execution.error.kind).toBe("READ_ONLY");
    expect((mock.dataset.mutationsExecuted ?? []).length).toBe(0);
    mock.close();
  });
});

describe("Scenario I — backup restoration in an isolated environment (REAL local store)", () => {
  test("logical backup -> isolated in-memory restore -> row-exact verification", () => {
    // REAL SQLite (in-memory), not mocks: prove the backup is actually restorable.
    const db = NexusDb.open(":memory:");
    migrate(db);
    db.run("INSERT INTO kv (key, value) VALUES ('seed', '\"ok\"')");
    db.run("INSERT INTO requirements (id, product, status, doc) VALUES ('R-1', 'PLATFORM', 'VERIFIED', '{}')");

    const doc = BackupService.exportLogicalBackup(db);
    expect(doc.format).toBe("nexus-logical-backup");
    expect(doc.tables.length).toBe(NEXUS_TABLES.length);
    expect(doc.tables.find((t) => t.name === "kv")!.rows).toBe(1);

    const verification = BackupService.verifyLogicalBackup(doc);
    expect(verification.restored).toBe(true);
    expect(verification.rowsMatched).toBe(true);
    expect(verification.perTable.every((t) => t.match)).toBe(true);

    // tamper detection: removing rows breaks verification (integrity is real)
    const tampered = { ...doc, tables: doc.tables.map((t) => t.name === "kv" ? { ...t, data: [] } : t) };
    const tamperedVerification = BackupService.verifyLogicalBackup(tampered);
    expect(tamperedVerification.rowsMatched).toBe(false);
    db.close();
  });

  test("Railway volume backups are reported as existing but UNVERIFIED for recovery (honest limitation)", async () => {
    const mock = createRailwayMock();
    const snap = unwrap(await mock.intel.discovery.discoverAll(), "discovery") as InfrastructureSnapshot;
    const report = await mock.intel.backup.report(snap);
    expect(report.volumes[0]!.backups.length).toBe(1);
    expect(report.volumes[0]!.backups[0]!.verified).toBe(false);
    expect(report.volumes[0]!.backups[0]!.recoverability).toBe("UNVERIFIED");
    mock.close();
  });
});

describe("Webhook event intelligence — notifications are prompts, not truth (MOCK)", () => {
  test("an accepted webhook is reconciled against the authoritative API before being trusted", async () => {
    const mock = createRailwayMock();
    const r = await mock.intel.webhook.handle({ "x-webhook-secret": undefined }, webhookPayload());
    // no secret configured on this instance -> fail closed
    expect(r.ok).toBe(false);
    // now with a secret configured
    const mock2 = createRailwayMock({ env: { RAILWAY_WEBHOOK_SECRET: "whsec_x" } });
    const accepted = await mock2.intel.webhook.handle({ "x-webhook-secret": "whsec_x" }, webhookPayload());
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.value.reconciled).toBeDefined(); // authoritative check happened
      expect(accepted.value.reconciled!.matches).toBeDefined();
    }
    mock.close();
    mock2.close();
  });
});
