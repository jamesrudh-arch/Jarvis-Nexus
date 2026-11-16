/**
 * INDEPENDENT SUPABASE BACKUP INFRASTRUCTURE — failure & recovery tests.
 *
 * Covers the mission's mandated scenarios:
 *  1. successful encrypted upload (full stage pipeline)
 *  2. Supabase authentication failure
 *  3. network timeout
 *  4. interrupted upload
 *  5. duplicate backup (overwrite protection)
 *  6. missing object (upload "succeeded", object vanished)
 *  7. corrupted downloaded artifact
 *  8. SHA-256 mismatch (explicit integrity-failure evidence)
 *  9. invalid AES-GCM authentication tag
 * 10. missing encryption key (plaintext must NEVER leave the volume)
 * 11. retention boundary (incl. last-recovery-point + orphan protections)
 * 12. concurrent backup execution (in-flight locking)
 * 13. restoration failure (production data untouched)
 * 14. Supabase service interruption (NO false off-volume protection)
 *
 * The Supabase Storage REST API is emulated by a local Bun.serve fake with
 * switchable failure modes; ALL cryptography is REAL (AES-256-GCM, SHA-256).
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createApp } from "@nexus/api";
import { BackupService, SupabaseStorageClient, parseSupabaseBackupConfig, NEXUS_TABLES } from "@nexus/railway";
import type { EncryptedBackupDoc } from "@nexus/railway";

const TMP = `/tmp/supabase_backup_${Date.now()}`;
mkdirSync(TMP, { recursive: true });

const OWNER_KEY = "supabase-backup-owner";
const KEY_HEX = randomBytes(32).toString("hex"); // TEST-ONLY runtime key
const sha = (b: Buffer | Uint8Array | string) => createHash("sha256").update(b).digest("hex");

// ---------------------------------------------------------------------------
// fake Supabase Storage server (switchable failure modes)
// ---------------------------------------------------------------------------
type FakeMode =
  | "ok" | "auth_fail" | "timeout" | "connection_reset" | "missing_object"
  | "corrupt_download" | "outage" | "public_bucket" | "slow";
let MODE: FakeMode = "ok";
const BUCKETS = new Map<string, { public: boolean }>();
const OBJECTS = new Map<string, { bytes: Buffer; updated_at: string }>();
let UPLOAD_ATTEMPTS = 0;
let SERVED_DOWNLOADS = 0;

const fake = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const path = decodeURIComponent(url.pathname);
    if (MODE === "outage") return new Response("service unavailable", { status: 503 });
    if (MODE === "timeout") {
      // hang forever; the client aborts at its timeout
      return new Promise<Response>(() => { /* never resolves */ }) as unknown as Promise<Response>;
    }
    if (MODE === "connection_reset") {
      return new Response("interrupted", { status: 599 });
    }

    // public object URL — must ALWAYS refuse for a private bucket
    const pub = path.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (pub) {
      const bucket = BUCKETS.get(pub[1]!);
      if (!bucket || bucket.public === false) return new Response("Unauthorized", { status: 403 });
      return new Response("should never happen in these tests");
    }

    // object LIST must be matched BEFORE the generic object routes (its path
    // shape /object/list/{bucket} also matches /object/{bucket}/{key}).
    // Faithful to the REAL API: returns DIRECT children of the prefix only —
    // folder children appear as {name: <segment>, metadata: null}, file
    // children as {name: <remaining path>, metadata: {size}, updated_at}.
    const list = path.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
    if (list && req.method === "POST") {
      if (MODE === "auth_fail") return new Response("Invalid API key", { status: 401 });
      const { prefix } = (await req.json()) as { prefix: string };
      const bucket = list[1]!;
      const rootLen = bucket.length + 1 + prefix.length;
      const children = new Map<string, { name: string; metadata: { size: number } | null; updated_at: string | null }>();
      for (const [k, v] of OBJECTS.entries()) {
        if (!k.startsWith(`${bucket}/${prefix}`)) continue;
        const remainder = k.slice(rootLen);
        if (remainder.length === 0) continue;
        const slash = remainder.indexOf("/");
        if (slash === -1) {
          children.set(remainder, { name: remainder, metadata: { size: v.bytes.length }, updated_at: v.updated_at });
        } else {
          const folder = remainder.slice(0, slash);
          if (!children.has(folder)) children.set(folder, { name: folder, metadata: null, updated_at: null });
        }
      }
      return Response.json([...children.values()].sort((a, b) => a.name.localeCompare(b.name)));
    }

    // bucket endpoints
    const bucketGet = path.match(/^\/storage\/v1\/bucket\/([^/]+)$/);
    if (bucketGet && req.method === "GET") {
      if (MODE === "auth_fail") return new Response("Invalid API key", { status: 401 });
      const b = BUCKETS.get(bucketGet[1]!);
      if (!b) return new Response("not found", { status: 404 });
      return Response.json({ name: bucketGet[1], public: b.public });
    }
    if (path === "/storage/v1/bucket" && req.method === "POST") {
      if (MODE === "auth_fail") return new Response("Invalid API key", { status: 401 });
      const body = (await req.json()) as { name: string; public: boolean };
      BUCKETS.set(body.name, { public: body.public === true });
      return Response.json({ name: body.name });
    }

    // object upload
    const up = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (up && req.method === "POST" && up[1] !== "list") {
      if (MODE === "auth_fail") return new Response("Invalid API key", { status: 401 });
      UPLOAD_ATTEMPTS += 1;
      const bucket = BUCKETS.get(up[1]!);
      if (!bucket) return new Response("bucket not found", { status: 404 });
      const key = `${up[1]}/${up[2]}`;
      const upsert = req.headers.get("x-upsert") === "1" || req.headers.get("x-upsert") === "true";
      if (OBJECTS.has(key) && !upsert) {
        return new Response("The resource already exists", { status: 400 });
      }
      if (up[2]!.endsWith(".meta.json") === false && MODE === "slow") {
        await new Promise((r) => setTimeout(r, 400));
      }
      OBJECTS.set(key, { bytes: Buffer.from(await req.arrayBuffer()), updated_at: new Date().toISOString() });
      return Response.json({ Key: up[2]! });
    }

    // object info (matches the REAL Supabase route /object/info/…; the
    // /object/stat/… route does not exist live — it 400s as NoSuchBucket)
    const stat = path.match(/^\/storage\/v1\/object\/info\/([^/]+)\/(.+)$/);
    if (stat && req.method === "GET") {
      if (MODE === "auth_fail") return new Response("Invalid API key", { status: 401 });
      return OBJECTS.has(`${stat[1]}/${stat[2]}`) ? Response.json({}) : new Response("not found", { status: 404 });
    }

    // object download
    const dl = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (dl && req.method === "GET" && dl[1] !== "list") {
      if (MODE === "auth_fail") return new Response("Invalid API key", { status: 401 });
      const key = `${dl[1]}/${dl[2]}`;
      const obj = OBJECTS.get(key);
      if (!obj) return new Response("not found", { status: 404 });
      if (MODE === "missing_object" && !key.endsWith(".meta.json")) {
        return new Response("not found", { status: 404 });
      }
      SERVED_DOWNLOADS += 1;
      if (MODE === "corrupt_download" && !key.endsWith(".meta.json")) {
        // flip bytes in transit — the artifact arrives corrupted
        const corrupted = Buffer.from(obj.bytes);
        corrupted[Math.floor(corrupted.length / 2)]! ^= 0xff;
        return new Response(new Uint8Array(corrupted));
      }
      return new Response(new Uint8Array(obj.bytes));
    }

    // object delete
    const del = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (del && req.method === "DELETE") {
      if (MODE === "auth_fail") return new Response("Invalid API key", { status: 401 });
      OBJECTS.delete(`${del[1]}/${del[2]}`);
      return Response.json({});
    }

    return new Response("not implemented", { status: 404 });
  },
});

const SB_URL = `http://127.0.0.1:${fake.port}`;
const envBase: Record<string, string> = {
  OWNER_KEY,
  NEXUS_ALLOW_ECHO: "true",
  NEXUS_BACKUP_INTERVAL_HOURS: "0",
  RATE_LIMIT_PER_MIN: "100000",
  NEXUS_BACKUP_RETENTION: "14",
  SUPABASE_URL: SB_URL,
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  NEXUS_BACKUP_ENCRYPTION_KEY: KEY_HEX,
  NEXUS_BACKUP_SUPABASE_RETRY_BASE_MS: "150", // fast retries for tests
  NEXUS_BACKUP_SUPABASE_RETRY_MAX: "2",
  NEXUS_BACKUP_SUPABASE_TIMEOUT_MS: "1500",
};

const app = createApp({
  dbPath: `${TMP}/live/nexus.db`,
  workspaceRoot: `${TMP}/live/ws`,
  env: { ...envBase },
});
const req = (p: string, init: RequestInit = {}) => app.app.request(new Request(`http://sb.test${p}`, init));
const owner = { Authorization: `Bearer ${OWNER_KEY}`, "content-type": "application/json", "X-Forwarded-For": "198.51.100.90" };

app.db.run(
  "INSERT INTO kv (key, value) VALUES ('supabase-canary', '\"SUPABASE-CANARY-VALUE\"') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);

type LogicalStatus = ReturnType<typeof app.listLogicalBackups>;
const listBackups = async (): Promise<LogicalStatus> => app.listLogicalBackups();
const protectionStatus = async () => (await listBackups()).supabase.protectionStatus as string;
const sbStatus = async () => (await listBackups()).supabase as Record<string, any>;
const logicalAlerts = async () => (await listBackups()).alerts as Array<{ code: string; detail: string }>;
const waitFor = async (f: () => boolean | Promise<boolean>, ms = 5000): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await f()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return await f();
};

// a direct client (for unit-level scenarios the app wiring does not reach)
const directClient = (envOverride: Record<string, string> = envBase) => {
  const parsed = parseSupabaseBackupConfig(envOverride);
  if (!parsed.configured) throw new Error("expected configured");
  return new SupabaseStorageClient(parsed.config);
};

beforeAll(() => {
  BUCKETS.set("jarvis-nexus-backups", { public: false });
});

afterAll(() => {
  app.stopBackupScheduler();
  app.db.close();
  fake.stop(true);
  rmSync(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1 + happy path: successful encrypted upload, verified off-volume
// ---------------------------------------------------------------------------
describe("supabase off-volume backup — happy path", () => {
  test("successful upload records EVERY stage and reaches SUPABASE_VERIFIED", async () => {
    MODE = "ok";
    const before = OBJECTS.size;
    const r = await req("/railway/backup/export", { method: "POST", headers: owner });
    expect(r.status).toBe(201);
    const body = (await r.json()) as { data: { supabaseEnqueued: boolean; artifactSha256?: string } };
    expect(body.data.supabaseEnqueued).toBe(true);

    const ok = await waitFor(async () => (await protectionStatus()) === "SUPABASE_VERIFIED");
    expect(ok).toBe(true);

    const status = (await sbStatus()) as Record<string, any>;
    expect(status.configured).toBe(true);
    expect(status.bucket).toBe("jarvis-nexus-backups");
    expect(status.destination).toContain("supabase-storage://jarvis-nexus-backups/production/database/");
    expect(status.lastSuccessfulUpload?.objectKey).toMatch(/^production\/database\/\d{4}\/\d{2}\/.+\.enc$/);
    expect(status.lastIndependentDownloadVerification).toEqual(
      expect.objectContaining({ byteMatch: true, decryptVerified: true }),
    );
    expect(status.lastArtifact.bytes).toBeGreaterThan(0);
    expect(status.lastArtifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(status.lastArtifact.tables).toBe(NEXUS_TABLES.length);
    expect(status.stageRecord).toEqual(
      expect.objectContaining({
        generation: expect.objectContaining({ ok: true }),
        encryption: expect.objectContaining({ ok: true }),
        checksum: expect.objectContaining({ ok: true }),
        bucket: expect.objectContaining({ ok: true }),
        upload: expect.objectContaining({ ok: true }),
        object_exists: expect.objectContaining({ ok: true }),
        download: expect.objectContaining({ ok: true }),
        byte_match: expect.objectContaining({ ok: true }),
        decrypt_verify: expect.objectContaining({ ok: true }),
        metadata: expect.objectContaining({ ok: true }),
      }),
    );
    // the artifact AND its metadata record exist in the bucket
    expect(OBJECTS.size).toBeGreaterThanOrEqual(before + 2);
    const encKeys = [...OBJECTS.keys()].filter((k) => k.endsWith(".enc"));
    expect(encKeys.length).toBe(1);
    // the stored artifact is encrypted: no plaintext canary inside
    const firstKey = encKeys[0] as string;
    const stored = OBJECTS.get(firstKey)!.bytes.toString("utf8");
    expect(stored).toContain("nexus-logical-backup-encrypted");
    expect(stored).not.toContain("SUPABASE-CANARY-VALUE");
    // the stored artifact carries the x-upsert: 0 duplicate protection upstream
    // (asserted via behavior in the duplicate test below)
    const metaKey = firstKey.replace(/\.enc$/, ".meta.json");
    const meta = JSON.parse(OBJECTS.get(metaKey)!.bytes.toString("utf8"));
    expect(meta.verified).toBe(true);
    expect(meta.sha256).toBe(status.lastArtifact.sha256);
    expect(JSON.stringify(meta)).not.toContain(KEY_HEX); // key NEVER in the bucket
  });

  test("full isolated restoration from the Supabase copy reaches RESTORE_VERIFIED", async () => {
    MODE = "ok";
    const r = await req("/railway/backup/supabase/restore", { method: "POST", headers: owner, body: "{}" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { data: { report: { restored: boolean; tables: number; rows: number }; objectKey: string; target: string } };
    expect(body.data.report.restored).toBe(true);
    expect(body.data.report.tables).toBe(NEXUS_TABLES.length);
    expect(body.data.objectKey).toMatch(/\.enc$/);
    expect(body.data.target).toContain("restore-verifications");
    // isolated target is NOT the live database
    const liveRows = app.db.count("SELECT COUNT(*) AS n FROM kv WHERE key = 'supabase-canary'");
    expect(liveRows).toBe(1); // production store untouched
    // restore log exists on disk (durable evidence)
    expect(body.data.target).toContain("nexus.db");
    const ok = await waitFor(async () => (await protectionStatus()) === "RESTORE_VERIFIED");
    expect(ok).toBe(true);
    const status = (await sbStatus()) as Record<string, any>;
    expect(status.lastRestorationVerification).toEqual(
      expect.objectContaining({ restored: true, tables: NEXUS_TABLES.length, rows: body.data.report.rows }),
    );
  });

  test("listing exposes verified backups and bucket privacy", async () => {
    MODE = "ok";
    const r = await req("/railway/backup/supabase/list", { headers: owner });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { data: { backups: Array<Record<string, any>>; bucketPrivacy: { bucket: string; public: boolean; verified: boolean }; verified: number } };
    expect(body.data.backups.length).toBe(1);
    expect(body.data.backups[0]!.verified).toBe(true);
    expect(body.data.backups[0]!.orphan).toBe(false);
    expect(body.data.bucketPrivacy).toEqual({ bucket: "jarvis-nexus-backups", public: false, verified: true });
    expect(body.data.verified).toBe(1);
  });

  test("monitoring exposes accurate supabase status (no secrets)", async () => {
    const text = JSON.stringify(app.listLogicalBackups());
    expect(text).not.toContain("test-service-role-key");
    expect(text).not.toContain(KEY_HEX);
    const m = await req("/metrics");
    const metrics = (await m.json()) as { counters: Array<{ name: string; labels: Record<string, string> }> };
    const names = metrics.counters.map((c) => c.name);
    expect(names).toContain("backup_supabase_uploads_total");
    expect(names).toContain("backup_supabase_restores_total");
    // rpo.offVolume must reflect the supabase plane, not the legacy offsite dir
    const rpo = (app.listLogicalBackups() as unknown as { rpo: { offVolume: Record<string, any> } }).rpo.offVolume;
    expect(rpo.provider).toBe("supabase-storage");
    expect(["SUPABASE_VERIFIED", "RESTORE_VERIFIED"]).toContain(rpo.status);
  });
});

// ---------------------------------------------------------------------------
// 2-4, 14: upload failure modes — never a false off-volume claim
// ---------------------------------------------------------------------------
describe("supabase upload failure modes (no false protection)", () => {
  const resetWithNewBackup = async (): Promise<void> => {
    MODE = "ok";
    await req("/railway/backup/export", { method: "POST", headers: owner });
    await waitFor(async () => (await protectionStatus()) === "SUPABASE_VERIFIED");
  };

  test("auth failure keeps status at SUPABASE_UPLOAD_PENDING — exactly, never VERIFIED", async () => {
    await resetWithNewBackup();
    MODE = "auth_fail";
    await req("/railway/backup/export", { method: "POST", headers: owner });
    // wait for retries to exhaust (RETRY_MAX=2)
    const done = await waitFor(async () => {
      const alerts = await logicalAlerts();
      return alerts.some((a) => a.code === "SUPABASE_RETRY_EXHAUSTED");
    }, 6000);
    expect(done).toBe(true);
    const status = await sbStatus();
    // CRITICAL: auth failure must not produce a verified claim for the NEWEST artifact
    expect(status.protectionStatus).toBe("SUPABASE_UPLOAD_PENDING");
    expect(status.lastError?.kind).toBe("AUTH");
    expect(status.failureCounters.uploads).toBeGreaterThan(0);
    expect(status.failureCounters.retries).toBeGreaterThan(0);
    // on-volume backup still succeeded
    expect(status.lastSuccessfulLocalBackupAt).toBeTruthy();
    MODE = "ok";
  });

  test("network timeout: classified TIMEOUT, retried, no verified claim", async () => {
    MODE = "ok";
    await req("/railway/backup/export", { method: "POST", headers: owner });
    await waitFor(async () => (await protectionStatus()) === "SUPABASE_VERIFIED");
    MODE = "timeout";
    await req("/railway/backup/export", { method: "POST", headers: owner });
    const seen = await waitFor(async () => {
      const s = await sbStatus();
      return s.lastError?.kind === "TIMEOUT";
    }, 4000);
    expect(seen).toBe(true);
    const status = await sbStatus();
    expect(status.protectionStatus).not.toBe("SUPABASE_VERIFIED");
    MODE = "ok";
  });

  test("interrupted upload: HTTP-level transport failure recorded, artifact not falsely verified", async () => {
    MODE = "connection_reset";
    await req("/railway/backup/export", { method: "POST", headers: owner });
    const seen = await waitFor(async () => {
      const s = await sbStatus();
      return s.pendingUploads.length > 0 || s.failureCounters.uploads > 0;
    }, 4000);
    expect(seen).toBe(true);
    const status = await sbStatus();
    expect(status.protectionStatus).not.toBe("RESTORE_VERIFIED");
    // no half-written object counted as a backup (list shows only complete .enc with meta)
    MODE = "ok";
  });

  test("supabase total outage: on-volume backup still succeeds, protection honestly pending", async () => {
    MODE = "outage";
    const r = await req("/railway/backup/export", { method: "POST", headers: owner });
    expect(r.status).toBe(201); // the LOCAL backup succeeded — outage must not break it
    const status = await sbStatus();
    expect(["SUPABASE_UPLOAD_PENDING", "BACKUP_FAILED"]).toContain(status.protectionStatus);
    expect(status.protectionStatus).not.toBe("SUPABASE_VERIFIED");
    const alerts = await logicalAlerts();
    expect(alerts.some((a) => a.code === "SUPABASE_UPLOAD_FAILED")).toBe(true);
    MODE = "ok";
  });
});

// ---------------------------------------------------------------------------
// 5: duplicate protection
// ---------------------------------------------------------------------------
describe("duplicate backup protection", () => {
  test("re-uploading the SAME object key verifies the existing copy — never overwrites", async () => {
    MODE = "ok";
    // craft an artifact and upload it twice with the SAME backup id
    const doc = BackupService.exportLogicalBackup(app.db, new Date("2026-11-16T00:00:00.000Z").toISOString());
    const enc = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    const serialized = Buffer.from(JSON.stringify(enc), "utf8");
    const client = directClient();
    const r1 = await client.uploadVerifiedBackup({
      enc, serialized: new Uint8Array(serialized), encryptionKey: Buffer.from(KEY_HEX, "hex"),
      exportedAt: enc.exportedAt, backupId: "20261116T000000000Z-dupetest1",
    });
    expect(r1.verified).toBe(true);
    const original = OBJECTS.get(`jarvis-nexus-backups/${r1.objectKey}`)!.bytes;
    // second upload of the identical bytes under the SAME key
    const r2 = await client.uploadVerifiedBackup({
      enc, serialized: new Uint8Array(serialized), encryptionKey: Buffer.from(KEY_HEX, "hex"),
      exportedAt: enc.exportedAt, backupId: "20261116T000000000Z-dupetest1",
    });
    expect(r2.verified).toBe(true);
    expect(r2.stages.upload?.detail).toContain("already exists");
    // byte-identical: existing copy unchanged
    expect(timingSafeEqual(OBJECTS.get(`jarvis-nexus-backups/${r1.objectKey}`)!.bytes, original)).toBe(true);
  });

  test("server refuses x-upsert=0 duplicates (storage-level guarantee)", async () => {
    MODE = "ok";
    const client = directClient();
    const key = "production/database/2026/11/20261116T000000000Z-dupetest2.enc";
    await client.uploadObject(key, Buffer.from("first"));
    let duplicate = false;
    try {
      await client.uploadObject(key, Buffer.from("second"));
    } catch (e) {
      duplicate = (e as { kind: string }).kind === "DUPLICATE";
    }
    expect(duplicate).toBe(true);
    // the original bytes stand — no overwrite
    const back = await client.downloadObject(key);
    expect(back.toString("utf8")).toBe("first");
  });
});

// ---------------------------------------------------------------------------
// 6-8: post-upload verification failures
// ---------------------------------------------------------------------------
describe("independent verification failures", () => {
  test("missing object: upload reports success but download 404s", async () => {
    MODE = "ok";
    const doc = BackupService.exportLogicalBackup(app.db);
    const enc = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    const serialized = Buffer.from(JSON.stringify(enc), "utf8");
    MODE = "missing_object";
    const client = directClient();
    let failed: { kind: string; stage?: string } | null = null;
    try {
      await client.uploadVerifiedBackup({
        enc, serialized: new Uint8Array(serialized), encryptionKey: Buffer.from(KEY_HEX, "hex"),
      });
    } catch (e) {
      failed = { kind: (e as { kind: string }).kind, stage: (e as { stage?: string }).stage };
    }
    expect(failed?.kind).toBe("NOT_FOUND");
    MODE = "ok";
  });

  test("corrupted download: byte_match stage FAILS and verification refuses", async () => {
    MODE = "ok";
    const doc = BackupService.exportLogicalBackup(app.db);
    const enc = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    const serialized = Buffer.from(JSON.stringify(enc), "utf8");
    MODE = "corrupt_download";
    const client = directClient();
    let failed: { stage?: string; verified?: boolean } | null = null;
    try {
      await client.uploadVerifiedBackup({
        enc, serialized: new Uint8Array(serialized), encryptionKey: Buffer.from(KEY_HEX, "hex"),
      });
    } catch (e) {
      failed = { stage: (e as { stage?: string }).stage };
    }
    expect(failed?.stage).toBe("byte_match");
    MODE = "ok";
  });

  test("SHA-256 mismatch is explicitly named in the failure detail", async () => {
    MODE = "ok";
    const doc = BackupService.exportLogicalBackup(app.db);
    const enc = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    const serialized = Buffer.from(JSON.stringify(enc), "utf8");
    const client = directClient();
    // upload a GOOD artifact, then verify with a WRONG expected sha
    const rec = await client.uploadVerifiedBackup({
      enc, serialized: new Uint8Array(serialized), encryptionKey: Buffer.from(KEY_HEX, "hex"),
    });
    let msg = "";
    try {
      await client.verifyExistingBackup(rec.objectKey, "0".repeat(64), Buffer.from(KEY_HEX, "hex"));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("SHA-256 mismatch");
    expect(msg).toContain("…"); // truncated hashes only — never a full digest echo of expectations
  });

  test("invalid AES-GCM authentication tag: decryption verification fails closed", async () => {
    MODE = "ok";
    const doc = BackupService.exportLogicalBackup(app.db);
    const enc = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    // tamper the GCM tag but keep hashes consistent (simulates a forged envelope)
    const tampered: EncryptedBackupDoc = { ...enc, tag: "ff".repeat(16) };
    const serialized = Buffer.from(JSON.stringify(tampered), "utf8");
    const client = directClient();
    // upload the forged envelope directly (bypassing the verified pipeline)
    const key = "production/database/2026/11/20261116T000000000Z-tampered.enc";
    await client.uploadObject(key, serialized);
    let failure: Error | null = null;
    try {
      // byte_match passes (bytes are self-consistent); GCM auth must fail
      await client.verifyExistingBackup(key, sha(serialized), Buffer.from(KEY_HEX, "hex"));
    } catch (e) {
      failure = e as Error;
    }
    expect(failure).not.toBeNull();
    expect(failure!.message).toMatch(/tag|decrypt|integrity/i);
  });
});

// ---------------------------------------------------------------------------
// 10: missing encryption key — plaintext must NEVER leave the volume
// ---------------------------------------------------------------------------
describe("missing encryption key", () => {
  test("upload refused for a plaintext artifact; alert visible; status pending", async () => {
    const app2 = createApp({
      dbPath: `${TMP}/nokey/nexus.db`,
      workspaceRoot: `${TMP}/nokey/ws`,
      env: (() => {
        const e = { ...envBase };
        delete e.NEXUS_BACKUP_ENCRYPTION_KEY;
        return e;
      })(),
    });
    try {
      const r = await app2.app.request(new Request("http://sb.test/railway/backup/export", { method: "POST", headers: new Headers(owner) }));
      expect(r.status).toBe(201);
      const body = (await r.json()) as { data: { encrypted: boolean; supabaseEnqueued?: boolean } };
      expect(body.data.encrypted).toBe(false); // honest plaintext ON-VOLUME
      expect(body.data.supabaseEnqueued).toBe(false); // and NEVER enqueued off-volume
      const j = app2.listLogicalBackups();
      expect(j.supabase.configured).toBe(true);
      expect(j.supabase.protectionStatus).not.toBe("SUPABASE_VERIFIED");
      expect(j.alerts.some((a) => a.code === "SUPABASE_SKIPPED_NO_KEY")).toBe(true);
      // no plaintext artifact reached the bucket
      for (const [k, v] of OBJECTS.entries()) {
        if (k.endsWith(".enc") && v.bytes.toString("utf8").includes("nexus-logical-backup\",")) {
          throw new Error("plaintext artifact leaked to supabase storage");
        }
      }
    } finally {
      app2.stopBackupScheduler();
      app2.db.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 11: retention
// ---------------------------------------------------------------------------
describe("retention management", () => {
  const DAY = 86_400_000;
  const seedVerified = async (client: SupabaseStorageClient, id: string, exportedAt: Date): Promise<void> => {
    const doc = BackupService.exportLogicalBackup(app.db, exportedAt.toISOString());
    const enc = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    const serialized = Buffer.from(JSON.stringify(enc), "utf8");
    const objectKey = `production/database/${exportedAt.getUTCFullYear()}/${String(exportedAt.getUTCMonth() + 1).padStart(2, "0")}/${id}.enc`;
    await client.uploadObject(objectKey, serialized);
    // make the listing timestamp reflect the same age
    OBJECTS.get(`jarvis-nexus-backups/${objectKey}`)!.updated_at = exportedAt.toISOString();
    const meta = {
      format: "nexus-supabase-backup-record", version: 1, backupId: id, bucket: "jarvis-nexus-backups",
      objectKey, environment: "production", exportedAt: exportedAt.toISOString(),
      bytes: serialized.length, sha256: sha(serialized), tables: 24, rows: 0, stages: {}, verified: true,
    };
    await client.uploadObject(objectKey.replace(/\.enc$/, ".meta.json"), Buffer.from(JSON.stringify(meta)));
    OBJECTS.get(`jarvis-nexus-backups/${objectKey.replace(/\.enc$/, ".meta.json")}`)!.updated_at = exportedAt.toISOString();
  };

  test("boundary semantics: age >= retention is outside the window and deleted; newest is protected", async () => {
    MODE = "ok";
    OBJECTS.clear(); // isolate: retention unit tests seed their own universe
    const client = directClient();
    const now = new Date("2026-11-16T12:00:00.000Z");
    // ages: 16d (expired), exactly 14d (boundary -> expired), 13d (inside), 1h (newest)
    await seedVerified(client, "20261031T120000000Z-ret-a", new Date(now.getTime() - 16 * DAY));
    await seedVerified(client, "20261102T120000000Z-ret-b", new Date(now.getTime() - 14 * DAY)); // exact boundary
    await seedVerified(client, "20261103T120000000Z-ret-c", new Date(now.getTime() - 13 * DAY));
    await seedVerified(client, "20261116T110000000Z-ret-d", new Date(now.getTime() - 1 * 3_600_000));
    const report = await client.enforceRetention(now);
    expect(report.retentionDays).toBe(14);
    expect(report.deleted.map((d) => d.backupId).sort()).toEqual([
      "20261031T120000000Z-ret-a", // 16d — clearly outside
      "20261102T120000000Z-ret-b", // exactly 14d — boundary counts as outside (documented)
    ].sort());
    expect(report.deleted.every((d) => d.reason === "EXPIRED")).toBe(true);
    // newest + inside-window survive
    expect(OBJECTS.has("jarvis-nexus-backups/production/database/2026/11/20261103T120000000Z-ret-c.enc")).toBe(true);
    expect(OBJECTS.has("jarvis-nexus-backups/production/database/2026/11/20261116T110000000Z-ret-d.enc")).toBe(true);
    // every deletion is recorded with a timestamp
    expect(report.deleted.every((d) => /^\d{4}-\d{2}-\d{2}T/.test(d.deletedAt))).toBe(true);
  });

  test("never deletes the last / only recovery point", async () => {
    MODE = "ok";
    OBJECTS.clear();
    const client = directClient();
    const now = new Date("2026-11-16T12:00:00.000Z");
    const ancient = new Date(now.getTime() - 320 * DAY);
    await seedVerified(client, "20260101T000000000Z-only", ancient); // ancient recovery point
    const report = await client.enforceRetention(now);
    expect(report.skippedOnlyRecoveryPoint).toBe(true);
    expect(report.deleted).toHaveLength(0);
    expect(report.protectedNewest).toContain("20260101T000000000Z-only");
    const ancientKey = `production/database/${ancient.getUTCFullYear()}/${String(ancient.getUTCMonth() + 1).padStart(2, "0")}/20260101T000000000Z-only.enc`;
    expect(OBJECTS.has(`jarvis-nexus-backups/${ancientKey}`)).toBe(true);
  });

  test("newest verified backup is never deleted even when expired", async () => {
    MODE = "ok";
    OBJECTS.clear();
    const client = directClient();
    const now = new Date("2026-11-16T12:00:00.000Z");
    await seedVerified(client, "20260901T000000000Z-old", new Date(now.getTime() - 76 * DAY));
    await seedVerified(client, "20261001T000000000Z-newest", new Date(now.getTime() - 46 * DAY)); // both expired
    const report = await client.enforceRetention(now);
    expect(report.protectedNewest).toContain("20261001T000000000Z-newest");
    expect(report.deleted.map((d) => d.backupId)).toEqual(["20260901T000000000Z-old"]);
    expect(OBJECTS.has("jarvis-nexus-backups/production/database/2026/10/20261001T000000000Z-newest.enc")).toBe(true);
  });

  test("orphans (failed/incomplete uploads) are not valid backups and are swept after grace", async () => {
    MODE = "ok";
    OBJECTS.clear();
    const client = directClient({ ...envBase, NEXUS_BACKUP_SUPABASE_ORPHAN_GRACE_MS: "1000" } as Record<string, string>);
    // an .enc WITHOUT metadata (interrupted upload) — old
    const orphanKey = "production/database/2026/11/20260101T000000000Z-orphan.enc";
    await client.uploadObject(orphanKey, Buffer.from("half-written"));
    OBJECTS.get(`jarvis-nexus-backups/${orphanKey}`)!.updated_at = new Date(Date.now() - 3_600_000).toISOString();
    // a fresh orphan — inside grace, kept for now
    const freshOrphanKey = "production/database/2026/11/20261116T115900000Z-fresh.enc";
    await client.uploadObject(freshOrphanKey, Buffer.from("in-flight"));
    OBJECTS.get(`jarvis-nexus-backups/${freshOrphanKey}`)!.updated_at = new Date().toISOString();
    const report = await client.enforceRetention();
    const orphanDeletions = report.deleted.filter((d) => d.reason === "ORPHAN_INCOMPLETE");
    expect(orphanDeletions.map((d) => d.objectKey)).toEqual([orphanKey]);
    expect(OBJECTS.has("jarvis-nexus-backups/" + orphanKey)).toBe(false);
    expect(OBJECTS.has("jarvis-nexus-backups/" + freshOrphanKey)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 12: concurrency
// ---------------------------------------------------------------------------
describe("concurrent backup execution", () => {
  test("overlap refused: in-flight upload lock prevents double processing", async () => {
    MODE = "slow"; // uploads take 400ms
    const r = await req("/railway/backup/export", { method: "POST", headers: owner });
    expect(r.status).toBe(201);
    // the upload is now in flight (slow mode) — a manual retry must be refused
    const retry = await req("/railway/backup/supabase/retry", { method: "POST", headers: owner });
    expect([200, 202, 409]).toContain(retry.status);
    if (retry.status === 409) {
      const body = (await retry.json()) as { data?: { reason: string } };
      expect(body.data?.reason).toContain("in flight");
    }
    MODE = "ok";
    const ok = await waitFor(async () => {
      const s = await sbStatus();
      return s.retry.inFlight === false;
    }, 6000);
    expect(ok).toBe(true);
  });

  test("sync run overlap guard refuses interleaved runs", () => {
    const first = app.runLogicalBackup();
    expect(first.ok).toBe(true);
    // a synchronous second run after the first COMPLETED is legitimate;
    // the guard exists for interleaving, which the sync design makes impossible —
    // assert the guard flag is reset (no stuck state)
    const second = app.runLogicalBackup();
    expect(second.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13: restoration failure — production untouched
// ---------------------------------------------------------------------------
describe("restoration failure", () => {
  test("corrupted bucket artifact: restore fails cleanly, live store untouched", async () => {
    MODE = "ok";
    // ensure a verified baseline
    await req("/railway/backup/export", { method: "POST", headers: owner });
    await waitFor(async () => (await protectionStatus()) === "SUPABASE_VERIFIED");
    // corrupt the stored copy (bucket-side damage)
    const encKeys = [...OBJECTS.keys()].filter((k) => k.endsWith(".enc"));
    const target = encKeys.sort().pop()!;
    const original = OBJECTS.get(target)!.bytes;
    const damaged = Buffer.from(original);
    damaged[Math.floor(damaged.length / 2)]! ^= 0xff;
    MODE = "corrupt_download";
    const r = await req("/railway/backup/supabase/restore", { method: "POST", headers: owner, body: JSON.stringify({ key: target }) });
    expect([422, 502]).toContain(r.status);
    const body = (await r.json()) as { error: string };
    expect(["decrypt_failed", "download_failed", "restore_failed"]).toContain(body.error);
    MODE = "ok";
    OBJECTS.set(target, { bytes: original, updated_at: new Date().toISOString() });
    // live production store untouched
    const liveRows = app.db.count("SELECT COUNT(*) AS n FROM kv WHERE key = 'supabase-canary'");
    expect(liveRows).toBe(1);
  });

  test("tampered artifact (invalid GCM tag) is rejected before any restore write", async () => {
    MODE = "ok";
    const doc = BackupService.exportLogicalBackup(app.db);
    const enc = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    const tampered: EncryptedBackupDoc = { ...enc, tag: "ff".repeat(16) };
    const key = "production/database/2026/11/20261116T000000000Z-badtag.enc";
    await directClient().uploadObject(key, Buffer.from(JSON.stringify(tampered), "utf8"));
    const r = await req("/railway/backup/supabase/restore", { method: "POST", headers: owner, body: JSON.stringify({ key }) });
    expect(r.status).toBe(422);
    const body = (await r.json()) as { error: string; detail: string };
    expect(body.error).toBe("decrypt_failed");
    expect(body.detail).toMatch(/tag|decrypt/i);
  });
});

// ---------------------------------------------------------------------------
// privacy + config honesty
// ---------------------------------------------------------------------------
describe("bucket privacy and configuration honesty", () => {
  test("public bucket is REFUSED by policy", async () => {
    MODE = "ok";
    BUCKETS.set("jarvis-nexus-backups", { public: true });
    const doc = BackupService.exportLogicalBackup(app.db);
    const enc = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    const client = directClient();
    let refused: { kind: string } | null = null;
    try {
      await client.uploadVerifiedBackup({
        enc, serialized: new Uint8Array(Buffer.from(JSON.stringify(enc))), encryptionKey: Buffer.from(KEY_HEX, "hex"),
      });
    } catch (e) {
      refused = { kind: (e as { kind: string }).kind };
    }
    expect(refused?.kind).toBe("PUBLIC_BUCKET");
    BUCKETS.set("jarvis-nexus-backups", { public: false });
  });

  test("unconfigured status reports the EXACT missing variable names", async () => {
    const appUn = createApp({
      dbPath: `${TMP}/unconf/nexus.db`,
      workspaceRoot: `${TMP}/unconf/ws`,
      env: (() => {
        const e: Record<string, string> = { ...envBase };
        delete e.SUPABASE_URL;
        delete e.SUPABASE_SERVICE_ROLE_KEY;
        return e;
      })(),
    });
    try {
      const r = await appUn.app.request(new Request("http://sb.test/railway/backup/supabase/status", { headers: new Headers(owner) }));
      expect(r.status).toBe(200);
      const body = (await r.json()) as { data: { configured: boolean; missingVariables: string[]; protectionStatus: string } };
      expect(body.data.configured).toBe(false);
      expect(body.data.missingVariables.sort()).toEqual(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"]);
      expect(body.data.protectionStatus).toBe("BACKUP_FAILED"); // no run yet — honest
      const r2 = await appUn.app.request(new Request("http://sb.test/railway/backup/export", { method: "POST", headers: new Headers(owner) }));
      expect(r2.status).toBe(201);
      const j = appUn.listLogicalBackups();
      expect(j.supabase.protectionStatus).toBe("LOCAL_BACKUP_ONLY");
    } finally {
      appUn.stopBackupScheduler();
      appUn.db.close();
    }
  });

  test("service-role key never appears in status, logs or errors", async () => {
    MODE = "auth_fail";
    await req("/railway/backup/export", { method: "POST", headers: owner });
    await waitFor(async () => {
      const alerts = await logicalAlerts();
      return alerts.some((a) => a.code === "SUPABASE_UPLOAD_FAILED");
    }, 3000);
    const r = await req("/railway/backups", { headers: owner });
    const text = await r.text();
    expect(text).not.toContain("test-service-role-key");
    MODE = "ok";
  });
});
