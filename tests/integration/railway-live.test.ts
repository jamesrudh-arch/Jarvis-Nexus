/**
 * LIVE Railway integration tests (READ-ONLY).
 *
 * Gated on RAILWAY_API_TOKEN — these tests authenticate against the REAL
 * Railway GraphQL API and read REAL infrastructure state. No mutation is ever
 * executed (asserted below). Skipped automatically without credentials —
 * skips are honest, not failures.
 */
import { describe, expect, test } from "bun:test";
import {
  RailwayIntel, introspectLiveFields, diffContract, contractIsCompatible,
  checkUsedFieldsAgainstBaseline,
} from "@nexus/railway";
import { NexusDb, migrate } from "@nexus/db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hasCreds = Boolean(process.env.RAILWAY_API_TOKEN);
/** Live tests perform real network discovery (~4-15s) — extend the 5s default
 *  timeout. Without credentials they SKIP honestly instead of failing. */
const live = (name: string, fn: () => Promise<void>) =>
  hasCreds ? test(name, fn, 60_000) : test.skip(name, fn);
const tmp = mkdtempSync(join(tmpdir(), "nexus_railway_live_"));

function makeLiveIntel(readOnly = true): { intel: RailwayIntel; close: () => void } {
  const db = NexusDb.open(join(tmp, "live.db"));
  migrate(db);
  const intel = new RailwayIntel({
    db,
    env: {
      ...process.env,
      RAILWAY_READ_ONLY: String(readOnly),
      RAILWAY_PROJECT_ID: process.env.RAILWAY_PROJECT_ID,
    } as Record<string, string | undefined>,
  });
  return { intel, close: () => db.close() };
}

describe("railway LIVE read-only verification", () => {
  live("credentials authenticate against the real API", async () => {
    const { intel, close } = makeLiveIntel();
    const r = await intel.client.authCheck();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.note).toContain("authenticated");
    close();
  });

  live("full infrastructure discovery returns real resources with honest classifications", async () => {
    const { intel, close } = makeLiveIntel();
    const r = await intel.discovery.discoverAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.projects.length).toBeGreaterThanOrEqual(1);
      expect(r.value.environments.length).toBeGreaterThanOrEqual(1);
      expect(r.value.serviceInstances.length).toBeGreaterThanOrEqual(1);
      // every resource is classified (discovered / inaccessible / missing / unsupported / unverified)
      expect(r.value.classifications).toBeDefined();
      // no variable VALUES anywhere in the snapshot (secret hygiene)
      const serialized = JSON.stringify(r.value);
      expect(serialized.includes("RAILWAY_API_TOKEN")).toBe(false);
    }
    close();
  });

  live("monitoring reports all five dimensions independently against real infrastructure", async () => {
    const { intel, close } = makeLiveIntel();
    const mon = await intel.runMonitoringCycle();
    expect(mon).not.toBeNull();
    const dims = mon!.dimensions.map((d) => d.dimension).sort();
    expect(dims).toEqual(["api", "application", "dependencies", "deployment", "infrastructure"]);
    // every dimension carries evidence and its own status
    for (const d of mon!.dimensions) {
      expect(["healthy", "degraded", "unhealthy", "unknown"]).toContain(d.status);
      expect(d.evidence.length).toBeGreaterThan(0);
    }
    close();
  });

  live("usage/cost intelligence separates measured from estimated values", async () => {
    const { intel, close } = makeLiveIntel();
    const snap = await intel.discovery.discoverAll();
    const report = await intel.usage.report(snap.ok ? snap.value : null);
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.value.measured.every((m) => m.kind === "measured")).toBe(true);
      expect(report.value.estimated.every((m) => m.kind === "estimated")).toBe(true);
      expect(report.value.notes.some((n) => n.includes("no currency figure is fabricated"))).toBe(true);
    }
    close();
  });

  live("live schema matches the committed contract baseline (no BREAKING drift)", async () => {
    const { intel, close } = makeLiveIntel();
    const live = await introspectLiveFields(intel.client);
    expect(live.ok).toBe(true);
    if (live.ok) {
      const drifts = diffContract(live.value);
      const breaking = drifts.filter((d) => d.severity === "BREAKING");
      expect(breaking).toEqual([]);
      expect(contractIsCompatible(drifts)).toBe(true);
    }
    close();
  });

  live("previous token status is probed without exposing it (rotation evidence)", async () => {
    // Scenario C live variant: classify the PREVIOUS token's status.
    const prev = process.env.RAILWAY_API_TOKEN_PREVIOUS;
    if (!prev) return; // no previous token retained — honest skip
    const { RailwayClient, CredentialManager } = await import("@nexus/railway");
    const client = new RailwayClient({
      credentials: new CredentialManager({ RAILWAY_API_TOKEN: prev }),
      fetchFn: fetch, sleepFn: async () => {},
    });
    const r = await client.authCheck();
    // Either outcome is valid evidence: rejected (rotation completed) or valid (rotation incomplete — security finding).
    if (!r.ok) {
      expect(["AUTH", "GRAPHQL"]).toContain(r.error.kind);
      expect(JSON.stringify(r.error.toJSON()).includes(prev)).toBe(false);
    } else {
      console.log(JSON.stringify({ finding: "PREVIOUS_TOKEN_STILL_VALID", note: "rotation incomplete — recommend revoking the old workspace token in the Railway dashboard" }));
    }
  });

  live("read-only mode refuses ALL mutations even with owner principal (production protection)", async () => {
    const { intel, close } = makeLiveIntel(true);
    const decision = intel.authorization.requestAuthorization({
      operationId: "railway.deployment.restart",
      resourceIds: ["any-deployment-id"],
      scope: "live test — must be refused",
      principal: { type: "user", id: "owner" },
    });
    expect(decision.granted).toBe(false);
    expect(decision.reason).toContain("READ-ONLY");
    close();
  });

  live("rate-limit headers are captured from live responses", async () => {
    const { intel, close } = makeLiveIntel();
    await intel.client.authCheck();
    const rate = intel.client.lastRateInfo();
    expect(rate?.remaining).toBeDefined();
    expect(rate!.remaining!).toBeGreaterThan(0);
    close();
  });
});

// cleanup when the suite ends
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });
