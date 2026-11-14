/**
 * Stage 2 Phase 4 — backup scheduling, retention and honest status (integration tests).
 *
 * Covers:
 *  1. POST /railway/backup/export (owner): export + isolated restore verification
 *     + file write; repeated exports produce distinct files.
 *  2. Retention pruning: with NEXUS_BACKUP_RETENTION=3, a 4th export prunes the
 *     oldest; history never exceeds the retention count.
 *  3. GET /railway/backups includes the logical layer: schedule config, lastRun
 *     with rowsMatched, RPO/RTO objectives, history list.
 *  4. Unauthenticated export is rejected (401).
 */
import { describe, expect, test, afterAll } from "bun:test";
import { rmSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "@nexus/api";

const TMP = `/tmp/nexus_phase4_${Date.now()}`;
mkdirSync(TMP, { recursive: true });

const OWNER_KEY = "phase4-owner-key";
const app = createApp({
  dbPath: `${TMP}/nexus.db`,
  workspaceRoot: `${TMP}/workspaces`,
  env: {
    OWNER_KEY,
    NEXUS_ALLOW_ECHO: "true",
    NEXUS_BACKUP_INTERVAL_HOURS: "0", // scheduler disabled in tests — deterministic
    NEXUS_BACKUP_RETENTION: "3",
  } as Record<string, string>,
});

afterAll(() => {
  app.stopBackupScheduler();
  app.db.close();
  rmSync(TMP, { recursive: true, force: true });
});

const req = (path: string, init: RequestInit = {}) =>
  app.app.request(new Request(`http://nexus.local${path}`, init));
const ownerHeaders = { Authorization: `Bearer ${OWNER_KEY}`, "X-Forwarded-For": "198.51.100.40" };

describe("logical backup export + verification (Phase 4)", () => {
  test("export requires owner (401)", async () => {
    const r = await req("/railway/backup/export", { method: "POST", headers: { "X-Forwarded-For": "198.51.100.41" } });
    expect(r.status).toBe(401);
  });

  test("export returns file, tables, rows and a PASSED isolated restore verification", async () => {
    const r = await req("/railway/backup/export", { method: "POST", headers: ownerHeaders });
    expect(r.status).toBe(201);
    const body = (await r.json()) as any;
    expect(body.data.file).toContain("backups");
    expect(body.data.file.endsWith(".json")).toBe(true);
    expect(body.data.tables).toBeGreaterThan(10);
    expect(body.data.verification.restored).toBe(true);
    expect(body.data.verification.rowsMatched).toBe(true);
    expect(body.data.verification.perTable.every((t: any) => t.match)).toBe(true);
  });

  test("repeated exports produce distinct files and respect retention (prune oldest)", async () => {
    // 2 more exports (total 3 — at retention limit)
    for (let i = 0; i < 2; i++) {
      const r = await req("/railway/backup/export", { method: "POST", headers: ownerHeaders });
      expect(r.status).toBe(201);
      // distinct timestamps: file names differ (ms-resolution exportedAt)
      await new Promise((res) => setTimeout(res, 5));
    }
    const dir = join(TMP, "workspaces", "backups");
    let files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(3);

    // 4th export prunes the oldest — count stays at retention (3)
    await new Promise((res) => setTimeout(res, 5));
    const r4 = await req("/railway/backup/export", { method: "POST", headers: ownerHeaders });
    expect(r4.status).toBe(201);
    const body4 = (await r4.json()) as any;
    expect(body4.data.pruned).toBe(1);
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(3);
  });
});

describe("backup status view (Phase 4)", () => {
  test("logical layer reports schedule, lastRun, RPO/RTO and bounded history", async () => {
    const status = app.listLogicalBackups();
    expect(status.schedule.enabled).toBe(false); // interval 0 in test env
    expect(status.schedule.retentionCount).toBe(3);
    expect(status.lastRun).not.toBeNull();
    expect(status.lastRun!.rowsMatched).toBe(true);
    expect(status.lastRun!.pruned).toBeGreaterThanOrEqual(1);
    expect(status.historyCount).toBe(3);
    expect(status.history.length).toBe(3);
    expect(status.rpo.objectiveHours).toBe(0);
    expect(status.rto.objectiveMinutes).toBeGreaterThan(0);
    // every history entry points at a real file
    for (const h of status.history) {
      expect(h.bytes).toBeGreaterThan(0);
      expect(h.file.endsWith(".json")).toBe(true);
    }
  });
});
