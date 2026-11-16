/**
 * @nexus/railway — Supabase Storage off-volume backup infrastructure.
 *
 * Mission (independent Supabase backup infrastructure): Railway's trial plan
 * permits ONE volume per service and native volume snapshots are Pro-gated,
 * so the sole production-acceptance blocker was the absence of INDEPENDENTLY
 * VERIFIED off-volume backup protection. This module eliminates that blocker
 * using Supabase Storage as a second, independent storage plane:
 *
 *   production SQLite store
 *     -> JARVIS backup engine (existing BackupService — NOT replaced)
 *     -> AES-256-GCM encryption (existing NEXUS_BACKUP_ENCRYPTION_KEY — reused)
 *     -> artifact + SHA-256 integrity calculation
 *     -> Supabase Storage PRIVATE bucket (jarvis-nexus-backups)
 *     -> INDEPENDENT download verification (object must be re-fetched and
 *        byte-identical before anything is called "uploaded")
 *     -> AES-256-GCM authentication verification (decrypt must succeed)
 *     -> backup verification record (per-stage, persisted as object metadata)
 *
 * A backup is NEVER classified as successful merely because an upload returned
 * HTTP 200. Success requires every stage to pass independently:
 *   generation -> encryption -> checksum -> upload -> object-exists ->
 *   independent-download -> byte-match -> decrypt/auth-verify -> metadata.
 *
 * Security invariants:
 *  - the service-role key is used SERVER-SIDE only (this package + the API
 *    service); it never reaches frontend code, logs, artifacts or responses
 *  - no public access: buckets are created private and an existing public
 *    bucket is REFUSED (never silently used)
 *  - the public object URL must NOT serve objects (verified, not assumed)
 *  - objects are never overwritten (unique backup ids + upsert refused)
 *  - the encryption key is NEVER stored in the bucket
 *  - plaintext artifacts NEVER leave the volume (upload is refused without a
 *    valid key — fail-closed, mirroring the on-volume offsite rule)
 *
 * All timestamps are UTC ISO strings; retention arithmetic uses epoch
 * milliseconds so timezone boundaries cannot shift a deletion decision.
 */
import { createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { EncryptedBackupDoc, LogicalBackupDoc } from "./backup";
import { BackupService } from "./backup";

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------

export interface SupabaseBackupConfig {
  /** https://<project-ref>.supabase.co — SUPABASE_URL */
  url: string;
  /** service-role secret — SUPABASE_SERVICE_ROLE_KEY. NEVER logged or echoed. */
  serviceRoleKey: string;
  /** private bucket name (mission: jarvis-nexus-backups). */
  bucket: string;
  /** environment segment of the object path (mission: production/). */
  environment: string;
  /** retention window in days (mission: 14 via NEXUS_BACKUP_RETENTION). */
  retentionDays: number;
  /** per-request timeout. */
  timeoutMs: number;
  /** grace period before an orphan (failed/incomplete upload) is swept. */
  orphanGraceMs: number;
  /** test seam: injectable transport (production uses global fetch). */
  fetchFn?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

/** Parse + validate the Supabase env contract. Returns a usable config or an
 * honest, non-faking status object. Values are never included in errors. */
export function parseSupabaseBackupConfig(
  env: Record<string, string | undefined>,
): { configured: false; reason: "MISSING_URL" | "MISSING_KEY" | "INVALID_URL"; missing: string[]; detail?: string } | { configured: true; config: SupabaseBackupConfig } {
  const url = (env.SUPABASE_URL ?? "").trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const missing: string[] = [];
  if (url.length === 0) missing.push("SUPABASE_URL");
  if (key.length === 0) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    return { configured: false, reason: missing.includes("SUPABASE_URL") ? "MISSING_URL" : "MISSING_KEY", missing };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { configured: false, reason: "INVALID_URL", missing: [], detail: "SUPABASE_URL is not a valid URL (expected https://<project-ref>.supabase.co)" };
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    return { configured: false, reason: "INVALID_URL", missing: [], detail: "SUPABASE_URL must use https" };
  }
  const retention = Number(env.NEXUS_BACKUP_RETENTION ?? 14);
  return {
    configured: true,
    config: {
      url: url.replace(/\/+$/, ""),
      serviceRoleKey: key,
      bucket: (env.NEXUS_SUPABASE_BACKUP_BUCKET ?? "jarvis-nexus-backups").trim() || "jarvis-nexus-backups",
      environment: (env.NEXUS_BACKUP_SUPABASE_ENV ?? "production").trim() || "production",
      retentionDays: Number.isFinite(retention) && retention >= 1 ? Math.floor(retention) : 14,
      timeoutMs: positiveOr(env.NEXUS_BACKUP_SUPABASE_TIMEOUT_MS, 30_000),
      orphanGraceMs: positiveOr(env.NEXUS_BACKUP_SUPABASE_ORPHAN_GRACE_MS, 48 * 3_600_000),
      fetchFn: undefined,
    },
  };
}

function positiveOr(v: string | undefined, d: number): number {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

// ---------------------------------------------------------------------------
// errors (redacted by construction — the key never appears in any message)
// ---------------------------------------------------------------------------

export type SupabaseErrorKind =
  | "UNCONFIGURED"  // credentials absent — capability refused, never faked
  | "AUTH"          // 401/403 from the storage API
  | "TIMEOUT"       // request aborted at timeoutMs
  | "NETWORK"       // transport failure (DNS, connection reset, TLS)
  | "DUPLICATE"     // object already exists (overwrite refused)
  | "NOT_FOUND"     // object/bucket absent
  | "PUBLIC_BUCKET" // bucket exists but is public — refused by policy
  | "HTTP";         // unexpected status

const RETRYABLE: ReadonlySet<SupabaseErrorKind> = new Set(["TIMEOUT", "NETWORK"]);

export class SupabaseBackupError extends Error {
  readonly kind: SupabaseErrorKind;
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly stage?: SupabaseStage;

  constructor(init: { kind: SupabaseErrorKind; message: string; httpStatus?: number; stage?: SupabaseStage; retryable?: boolean }) {
    super(redactSupabaseSecrets(init.message));
    this.name = "SupabaseBackupError";
    this.kind = init.kind;
    this.httpStatus = init.httpStatus;
    this.stage = init.stage as SupabaseStage | undefined;
    this.retryable = init.retryable ?? RETRYABLE.has(init.kind);
  }

  toJSON(): Record<string, unknown> {
    return { kind: this.kind, message: this.message, httpStatus: this.httpStatus, stage: this.stage, retryable: this.retryable };
  }
}

/** Strip service-role keys / JWTs / bearer headers from any text. */
export function redactSupabaseSecrets(text: string): string {
  return text
    .replace(/sb_secret_[A-Za-z0-9_\-]+/g, "sb_secret_<redacted>")
    .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "<jwt-redacted>")
    .replace(/Bearer\s+\S+/g, "Bearer <redacted>")
    .replace(/service_role[=:]\s*\S+/gi, "service_role=<redacted>");
}

// ---------------------------------------------------------------------------
// verification records — every stage recorded independently
// ---------------------------------------------------------------------------

export type SupabaseStage =
  | "generation"        // logical export produced
  | "encryption"        // AES-256-GCM envelope built
  | "checksum"          // SHA-256 of the serialized artifact computed
  | "bucket"            // private bucket exists (created or verified)
  | "upload"            // artifact stored in the bucket
  | "object_exists"     // object visible via an independent API call
  | "download"          // artifact re-fetched through an independent request
  | "byte_match"        // downloaded bytes hash-identical to the uploaded artifact
  | "decrypt_verify"    // AES-256-GCM authentication + decryption succeeded
  | "metadata"          // verification record persisted next to the artifact
  | "public_access"     // unauthenticated public URL must refuse to serve
  | "retention";        // retention sweep executed

export type SupabaseStageResult = { ok: boolean; at: string; detail?: string };

export interface SupabaseBackupRecord {
  backupId: string;
  bucket: string;
  objectKey: string;      // production/database/2026/11/<backupId>.enc
  metaKey: string;        // production/database/2026/11/<backupId>.meta.json
  environment: string;
  exportedAt: string;     // UTC ISO — drives retention arithmetic
  bytes: number;
  sha256: string;         // SHA-256 of the serialized encrypted artifact
  plaintextSha256: string;
  tables: number;
  rows: number;
  stages: Partial<Record<SupabaseStage, SupabaseStageResult>>;
  /** true ONLY when every mandatory stage succeeded. */
  verified: boolean;
  /** stage that failed, when !verified */
  failedStage?: SupabaseStage;
  error?: { kind: SupabaseErrorKind; message: string };
}

export interface SupabaseListedBackup {
  backupId: string;
  objectKey: string;
  metaKey: string;
  bytes: number;
  sha256: string | null;
  exportedAt: string | null;
  verified: boolean | null;   // null = no metadata found (orphan / incomplete)
  tables: number | null;
  rows: number | null;
  updatedAt: string | null;   // as reported by the storage API
  orphan: boolean;
}

export interface RetentionDeletion {
  objectKey: string;
  backupId: string;
  reason: "EXPIRED" | "ORPHAN_INCOMPLETE";
  exportedAt: string | null;
  deletedAt: string;
}

export interface RetentionReport {
  ranAt: string;
  retentionDays: number;
  windowStartMs: number;
  listed: number;
  verifiedBackups: number;
  orphans: number;
  keptVerified: number;
  deleted: RetentionDeletion[];
  protectedNewest: string | null;
  skippedOnlyRecoveryPoint: boolean;
  notes: string[];
}

/** Protection status — the mission's five honest states. */
export type ProtectionStatus =
  | "LOCAL_BACKUP_ONLY"      // on-volume artifact only; Supabase NOT configured
  | "SUPABASE_UPLOAD_PENDING"// Supabase configured; upload/verification not (yet) complete
  | "SUPABASE_VERIFIED"      // upload + independent download + decrypt all verified
  | "RESTORE_VERIFIED"       // SUPABASE_VERIFIED + a full isolated restore from the Supabase copy succeeded
  | "BACKUP_FAILED";         // the most recent backup run failed (local or off-volume stages)

export const SUPABASE_PROTECTION_ORDER: Record<ProtectionStatus, number> = {
  BACKUP_FAILED: 0,
  LOCAL_BACKUP_ONLY: 1,
  SUPABASE_UPLOAD_PENDING: 2,
  SUPABASE_VERIFIED: 3,
  RESTORE_VERIFIED: 4,
};

// ---------------------------------------------------------------------------
// object path layout (mission §2): production/database/YYYY/MM/<backup-id>.enc
// ---------------------------------------------------------------------------

const UTC_MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

export function backupObjectKey(environment: string, exportedAt: Date, backupId: string): string {
  const yyyy = String(exportedAt.getUTCFullYear());
  const mm = UTC_MONTHS[exportedAt.getUTCMonth()];
  return `${environment}/database/${yyyy}/${mm}/${backupId}.enc`;
}

export function backupMetaKey(objectKey: string): string {
  return objectKey.replace(/\.enc$/, ".meta.json");
}

/** Unique backup identifier: UTC timestamp + 8 random hex chars. Collision
 * probability is negligible AND collisions are handled (duplicate upload is
 * refused and verified, never overwritten). */
export function newBackupId(at: Date = new Date()): string {
  return `${at.toISOString().replace(/[:.]/g, "").replace(/-/g, "")}-${randomBytes(4).toString("hex")}`;
}

/** Parse the UTC export timestamp out of a backup id (retention-safe). */
export function backupIdDate(backupId: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-/.exec(backupId);
  if (!m || m.length < 8) return null;
  const [_, y, mo, d, h, mi, s, ms] = m as unknown as [string, string, string, string, string, string, string, string];
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms));
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// client
// ---------------------------------------------------------------------------

export class SupabaseStorageClient {
  readonly config: SupabaseBackupConfig;
  /** Set after ensureBucket(): { public: false } read back from the API. */
  private bucketVerifiedPublic: boolean | null = null;

  constructor(config: SupabaseBackupConfig) {
    this.config = config;
  }

  private fetchFn(): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
    return this.config.fetchFn ?? ((input: string | URL | Request, init?: RequestInit) => fetch(input, init));
  }

  private async request(
    path: string,
    init: { method?: string; body?: string | Uint8Array; headers?: Record<string, string>; signalMs?: number } = {},
  ): Promise<{ status: number; bytes: Buffer; text: string }> {
    const doFetch = this.fetchFn();
    const url = `${this.config.url}${path}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.serviceRoleKey}`,
      apikey: this.config.serviceRoleKey,
      ...(init.headers ?? {}),
    };
    let res: Response;
    try {
      res = await doFetch(url, {
        method: init.method ?? "GET",
        headers,
        body: init.body,
        signal: AbortSignal.timeout(init.signalMs ?? this.config.timeoutMs),
      });
    } catch (e) {
      const err = e as Error;
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        throw new SupabaseBackupError({ kind: "TIMEOUT", message: `Supabase request timed out: ${path}` });
      }
      throw new SupabaseBackupError({ kind: "NETWORK", message: `Supabase transport failure on ${path}: ${err?.name ?? "Error"} ${err?.message ?? ""}`.trim() });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, bytes: buf, text: buf.toString("utf8") };
  }

  // ---- bucket management ---------------------------------------------------

  /** Fetch bucket metadata (null when absent). */
  async getBucket(name = this.config.bucket): Promise<{ name: string; public: boolean } | null> {
    const r = await this.request(`/storage/v1/bucket/${encodeURIComponent(name)}`);
    if (r.status === 404 || r.status === 400) return null;
    if (r.status === 401 || r.status === 403) {
      throw new SupabaseBackupError({ kind: "AUTH", message: `Supabase rejected the service credential for bucket lookup (${r.status})`, httpStatus: r.status });
    }
    if (r.status !== 200) {
      throw new SupabaseBackupError({ kind: "HTTP", message: `bucket lookup returned HTTP ${r.status}`, httpStatus: r.status });
    }
    const doc = JSON.parse(r.text) as { name?: string; public?: boolean; id?: string };
    return { name: String(doc.name ?? doc.id ?? name), public: doc.public === true };
  }

  /** Create a PRIVATE bucket. Refuses to create public buckets. */
  async createBucket(name = this.config.bucket): Promise<void> {
    const r = await this.request(`/storage/v1/bucket`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, id: name, public: false }),
    });
    if (r.status === 200 || r.status === 201) return;
    if (r.status === 401 || r.status === 403) {
      throw new SupabaseBackupError({ kind: "AUTH", message: `Supabase rejected the service credential for bucket creation (${r.status})`, httpStatus: r.status });
    }
    throw new SupabaseBackupError({ kind: "HTTP", message: `bucket creation returned HTTP ${r.status}: ${r.text.slice(0, 200)}`, httpStatus: r.status });
  }

  /**
   * Ensure the private bucket exists, verifying privacy BOTH ways:
   *  1. bucket metadata reports public === false (read-back from the API)
   *  2. the PUBLIC object URL refuses to serve (probed once an object exists —
   *     see verifyPublicAccessRefused on the upload path)
   * A bucket that exists but is public is REFUSED — never silently used.
   */
  async ensureBucket(): Promise<{ bucket: string; created: boolean; public: boolean }> {
    let existing = await this.getBucket();
    let created = false;
    if (!existing) {
      await this.createBucket();
      created = true;
      existing = await this.getBucket();
    }
    if (!existing) {
      throw new SupabaseBackupError({ kind: "HTTP", message: "bucket creation reported success but the bucket is still not visible" });
    }
    if (existing.public) {
      throw new SupabaseBackupError({ kind: "PUBLIC_BUCKET", message: `bucket ${this.config.bucket} is PUBLIC — refused by policy (off-volume backups require a private bucket)` });
    }
    this.bucketVerifiedPublic = existing.public;
    return { bucket: existing.name, created, public: false };
  }

  /** Privacy re-verification for status views (cheap, cached per call). */
  async bucketPrivacy(): Promise<{ bucket: string; public: boolean; verified: boolean }> {
    const b = await this.getBucket();
    return { bucket: this.config.bucket, public: b?.public === true, verified: b !== null && b.public === false };
  }

  /**
   * Prove the PUBLIC object URL does not serve the artifact. Returns true when
   * access is refused (expected for a private bucket). This is an UNAUTHENTICATED
   * request by design — it must not carry the service key.
   */
  async verifyPublicAccessRefused(objectKey: string): Promise<boolean> {
    const doFetch = this.fetchFn();
    let res: Response;
    try {
      res = await doFetch(`${this.config.url}/storage/v1/object/public/${this.config.bucket}/${objectKey}`, {
        method: "GET",
        signal: AbortSignal.timeout(this.config.timeoutMs),
        // no authorization/apikey headers — this is the anonymous internet view
      });
    } catch {
      // network refusal also means "not publicly served"
      return true;
    }
    return res.status === 403 || res.status === 401 || res.status === 400 || res.status === 404;
  }

  // ---- object operations -----------------------------------------------------

  /** Upload WITHOUT overwrite permission (x-upsert: 0). Duplicate => DUPLICATE error. */
  async uploadObject(objectKey: string, bytes: Uint8Array, contentType = "application/octet-stream"): Promise<void> {
    const r = await this.request(`/storage/v1/object/${this.config.bucket}/${objectKey}`, {
      method: "POST",
      headers: {
        "content-type": contentType,
        "cache-control": "3600",
        "x-upsert": "0", // never overwrite an existing backup artifact
      },
      body: new Uint8Array(bytes),
    });
    if (r.status === 200 || r.status === 201) return;
    if (r.status === 400 || r.status === 409) {
      const duplicateHint = /already exists|duplicate|exists/i.test(r.text);
      throw new SupabaseBackupError({
        kind: duplicateHint ? "DUPLICATE" : "HTTP",
        message: duplicateHint
          ? `object ${objectKey} already exists — overwrite refused (duplicate protection)`
          : `upload rejected (HTTP ${r.status}): ${r.text.slice(0, 200)}`,
        httpStatus: r.status,
      });
    }
    if (r.status === 401 || r.status === 403) {
      throw new SupabaseBackupError({ kind: "AUTH", message: `Supabase rejected the service credential for upload (${r.status})`, httpStatus: r.status });
    }
    throw new SupabaseBackupError({ kind: "HTTP", message: `upload returned HTTP ${r.status}: ${r.text.slice(0, 200)}`, httpStatus: r.status });
  }

  /** Independent authenticated download. */
  async downloadObject(objectKey: string): Promise<Buffer> {
    const r = await this.request(`/storage/v1/object/${this.config.bucket}/${objectKey}`, { method: "GET" });
    if (r.status === 200) return r.bytes;
    if (r.status === 404) {
      throw new SupabaseBackupError({ kind: "NOT_FOUND", message: `object ${objectKey} not found in bucket ${this.config.bucket}`, httpStatus: 404 });
    }
    if (r.status === 401 || r.status === 403) {
      throw new SupabaseBackupError({ kind: "AUTH", message: `Supabase rejected the service credential for download (${r.status})`, httpStatus: r.status });
    }
    throw new SupabaseBackupError({ kind: "HTTP", message: `download returned HTTP ${r.status}`, httpStatus: r.status });
  }

  /** Independent existence check (HEAD-equivalent via the stat endpoint). */
  async objectExists(objectKey: string): Promise<boolean> {
    const r = await this.request(`/storage/v1/object/stat/${this.config.bucket}/${objectKey}`);
    if (r.status === 200) return true;
    if (r.status === 404 || r.status === 400) return false;
    if (r.status === 401 || r.status === 403) {
      throw new SupabaseBackupError({ kind: "AUTH", message: `Supabase rejected the service credential for stat (${r.status})`, httpStatus: r.status });
    }
    throw new SupabaseBackupError({ kind: "HTTP", message: `stat returned HTTP ${r.status}`, httpStatus: r.status });
  }

  async deleteObject(objectKey: string): Promise<void> {
    const r = await this.request(`/storage/v1/object/${this.config.bucket}/${objectKey}`, { method: "DELETE" });
    if (r.status === 200 || r.status === 204 || r.status === 404) return;
    if (r.status === 401 || r.status === 403) {
      throw new SupabaseBackupError({ kind: "AUTH", message: `Supabase rejected the service credential for delete (${r.status})`, httpStatus: r.status });
    }
    throw new SupabaseBackupError({ kind: "HTTP", message: `delete returned HTTP ${r.status}`, httpStatus: r.status });
  }

  /** List object keys under a prefix (storage list API). */
  async listObjects(prefix: string): Promise<Array<{ name: string; size: number; updatedAt: string | null }>> {
    const r = await this.request(`/storage/v1/object/list/${this.config.bucket}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
    });
    if (r.status === 401 || r.status === 403) {
      throw new SupabaseBackupError({ kind: "AUTH", message: `Supabase rejected the service credential for listing (${r.status})`, httpStatus: r.status });
    }
    if (r.status !== 200 && r.status !== 201) {
      throw new SupabaseBackupError({ kind: "HTTP", message: `listing returned HTTP ${r.status}`, httpStatus: r.status });
    }
    const arr = JSON.parse(r.text) as Array<{ name: string; metadata?: { size?: number }; updated_at?: string; created_at?: string }>;
    return arr.map((o) => ({
      name: o.name,
      size: Number(o.metadata?.size ?? 0),
      updatedAt: o.updated_at ?? o.created_at ?? null,
    }));
  }

  // ---- high-level pipeline ---------------------------------------------------

  /**
   * Full stage-recorded upload of an ENCRYPTED backup artifact.
   * `enc` is the serialized encrypted doc; `sha256` must equal
   * SHA-256(serializedEncrypted) — recomputed here (never trusted from input).
   *
   * The artifact is only marked verified after: upload -> object-exists ->
   * independent download -> byte match -> GCM decrypt/auth verification.
   * On duplicate (same object key exists) the existing object is VERIFIED
   * against the expected bytes instead of being overwritten: if identical,
   * verification continues; if different, the upload FAILS (never overwrite).
   */
  async uploadVerifiedBackup(input: {
    enc: EncryptedBackupDoc;
    serialized: Uint8Array;
    encryptionKey: Buffer;
    exportedAt?: string;
    backupId?: string;
    now?: () => Date;
  }): Promise<SupabaseBackupRecord> {
    const now = input.now ?? (() => new Date());
    const exportedAt = input.exportedAt ?? input.enc.exportedAt;
    const at = new Date(exportedAt);
    const backupId = input.backupId ?? newBackupId(at);
    const objectKey = backupObjectKey(this.config.environment, at, backupId);
    const metaKey = backupMetaKey(objectKey);
    const record: SupabaseBackupRecord = {
      backupId, bucket: this.config.bucket, objectKey, metaKey,
      environment: this.config.environment,
      exportedAt,
      bytes: input.serialized.length,
      sha256: createHash("sha256").update(input.serialized).digest("hex"),
      plaintextSha256: input.enc.plaintextSha256,
      tables: input.enc.tables, rows: input.enc.rows,
      stages: {}, verified: false,
    };
    const stage = (s: SupabaseStage, ok: boolean, detail?: string): void => {
      record.stages[s] = { ok, at: now().toISOString(), detail };
    };
    const fail = (s: SupabaseStage, e: unknown): never => {
      stage(s, false, e instanceof Error ? e.message : String(e));
      record.verified = false;
      record.failedStage = s;
      record.error = e instanceof SupabaseBackupError
        ? { kind: e.kind, message: e.message }
        : { kind: "HTTP", message: e instanceof Error ? e.message : String(e) };
      throw e instanceof SupabaseBackupError ? e : new SupabaseBackupError({ kind: "HTTP", message: String(e), stage: s });
    };

    stage("generation", true, `${input.enc.tables} tables / ${input.enc.rows} rows exported`);
    stage("encryption", true, `aes-256-gcm envelope, iv=${input.enc.iv}`);
    stage("checksum", true, `sha256=${record.sha256.slice(0, 16)}…`);

    // bucket (private, verified)
    try {
      const b = await this.ensureBucket();
      stage("bucket", true, `${b.bucket} private${b.created ? " (created)" : " (reused)"}`);
    } catch (e) {
      fail("bucket", e);
    }

    // upload — duplicate-aware, never overwriting
    let duplicate = false;
    try {
      await this.uploadObject(objectKey, input.serialized);
      stage("upload", true, `${record.bytes} bytes stored at ${objectKey}`);
    } catch (e) {
      if (e instanceof SupabaseBackupError && e.kind === "DUPLICATE") {
        duplicate = true;
        stage("upload", true, `object already exists — overwrite refused, verifying existing copy`);
      } else {
        fail("upload", e);
      }
    }

    // independent existence check
    try {
      const exists = await this.objectExists(objectKey);
      if (!exists) fail("object_exists", new SupabaseBackupError({ kind: "NOT_FOUND", message: "upload reported success but the object is not visible via an independent stat call", stage: "object_exists" }));
      stage("object_exists", true, "object visible via independent stat call");
    } catch (e) {
      fail("object_exists", e);
    }

    // independent download + byte match (this is what makes the protection REAL)
    // (fail() throws; the initializer only satisfies definite-assignment)
    let downloaded: Buffer<ArrayBuffer> = Buffer.alloc(0);
    try {
      downloaded = (await this.downloadObject(objectKey)) as Buffer<ArrayBuffer>;
      stage("download", true, `${downloaded.length} bytes re-fetched independently`);
    } catch (e) {
      fail("download", e);
    }
    const downloadedHash = createHash("sha256").update(downloaded).digest("hex");
    const byteMatch = downloaded.length === input.serialized.length && timingSafeEqual(downloaded, Buffer.from(input.serialized));
    stage("byte_match", byteMatch, byteMatch ? `downloaded sha256 == uploaded sha256 (${downloadedHash.slice(0, 16)}…)` : `downloaded sha256 ${downloadedHash.slice(0, 16)}… != uploaded ${record.sha256.slice(0, 16)}…`);
    if (!byteMatch) {
      record.verified = false;
      record.failedStage = "byte_match";
      record.error = { kind: "HTTP", message: "downloaded bytes do not match the uploaded artifact (integrity failure)" };
      throw new SupabaseBackupError({ kind: "HTTP", message: "downloaded bytes do not match the uploaded artifact", stage: "byte_match" });
    }

    // AES-256-GCM authentication + decryption verification (parse the downloaded bytes)
    try {
      const parsed = JSON.parse(downloaded.toString("utf8")) as EncryptedBackupDoc;
      BackupService.decryptBackupDoc(parsed, input.encryptionKey);
      stage("decrypt_verify", true, "AES-256-GCM authentication tag verified on the DOWNLOADED copy");
    } catch (e) {
      record.verified = false;
      record.failedStage = "decrypt_verify";
      record.error = { kind: "HTTP", message: e instanceof Error ? e.message : String(e) };
      fail("decrypt_verify", new SupabaseBackupError({ kind: "HTTP", message: `decryption verification failed on the downloaded copy: ${e instanceof Error ? e.message : String(e)}`, stage: "decrypt_verify" }));
    }

    // public-URL privacy probe (unauthenticated) — the object must NOT be
    // fetchable through /object/public/...
    const publicRefused = await this.verifyPublicAccessRefused(objectKey);
    stage("public_access", publicRefused, publicRefused ? "public object URL refuses to serve (private)" : "WARNING: public object URL served the artifact");

    // persist the verification record next to the artifact (no secrets inside).
    // Every verification stage has passed at this point, so the record is
    // marked verified BEFORE being persisted (the record it stores must say
    // verified:true — a record claiming otherwise would be dishonest).
    record.verified = true;
    stage("metadata", true, `verification record stored at ${metaKey}`);
    try {
      const meta = this.redactRecordForStorage(record);
      await this.uploadObject(metaKey, Buffer.from(JSON.stringify(meta, null, 2), "utf8"), "application/json").catch(async (e) => {
        if (e instanceof SupabaseBackupError && e.kind === "DUPLICATE") {
          // metadata already exists (a retry after partial success): verify it matches
          const existing = JSON.parse((await this.downloadObject(metaKey)).toString("utf8"));
          if (existing.sha256 !== record.sha256) {
            throw new SupabaseBackupError({ kind: "HTTP", message: "existing metadata record disagrees with this artifact", stage: "metadata" });
          }
          return;
        }
        throw e;
      });
    } catch (e) {
      record.verified = false;
      fail("metadata", e);
    }

    return record;
  }

  /** Strip anything sensitive before persisting a record (defense in depth —
   * records contain only non-sensitive operational metadata by construction). */
  private redactRecordForStorage(record: SupabaseBackupRecord): Record<string, unknown> {
    return {
      format: "nexus-supabase-backup-record",
      version: 1,
      backupId: record.backupId,
      bucket: record.bucket,
      objectKey: record.objectKey,
      environment: record.environment,
      exportedAt: record.exportedAt,
      bytes: record.bytes,
      sha256: record.sha256,
      plaintextSha256: record.plaintextSha256,
      tables: record.tables,
      rows: record.rows,
      stages: record.stages,
      verified: record.verified,
      note: "no encryption keys, credentials or plaintext data are stored in this record",
    };
  }

  /**
   * Independent verification of an EXISTING backup (no upload): download ->
   * SHA-256 match against the recorded checksum -> GCM decrypt/auth verify.
   * Returns the downloaded serialized artifact on success.
   */
  async verifyExistingBackup(objectKey: string, expectedSha256: string, encryptionKey: Buffer): Promise<{ bytes: Buffer; record: SupabaseBackupRecord }> {
    const bytes = await this.downloadObject(objectKey);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== expectedSha256) {
      throw new SupabaseBackupError({ kind: "HTTP", message: `SHA-256 mismatch for ${objectKey}: downloaded ${hash.slice(0, 16)}… != expected ${expectedSha256.slice(0, 16)}…`, stage: "byte_match" });
    }
    const parsed = JSON.parse(bytes.toString("utf8")) as EncryptedBackupDoc;
    BackupService.decryptBackupDoc(parsed, encryptionKey); // throws on bad tag / tamper
    const backupId = objectKey.split("/").pop()?.replace(/\.enc$/, "") ?? "unknown";
    return {
      bytes,
      record: {
        backupId, bucket: this.config.bucket, objectKey, metaKey: backupMetaKey(objectKey),
        environment: this.config.environment, exportedAt: parsed.exportedAt,
        bytes: bytes.length, sha256: hash, plaintextSha256: parsed.plaintextSha256,
        tables: parsed.tables, rows: parsed.rows,
        stages: {
          download: { ok: true, at: new Date().toISOString(), detail: `${bytes.length} bytes fetched` },
          byte_match: { ok: true, at: new Date().toISOString(), detail: "sha256 verified" },
          decrypt_verify: { ok: true, at: new Date().toISOString(), detail: "AES-256-GCM authentication verified" },
        },
        verified: true,
      },
    };
  }

  /** List available backups under the environment prefix, joining metadata. */
  async listBackups(): Promise<SupabaseListedBackup[]> {
    const prefix = `${this.config.environment}/database/`;
    const objects = await this.listObjects(prefix);
    const out: SupabaseListedBackup[] = [];
    for (const o of objects) {
      if (!o.name.endsWith(".enc")) continue;
      const objectKey = o.name.startsWith(prefix) ? o.name : `${prefix}${o.name}`;
      const backupId = o.name.split("/").pop()!.replace(/\.enc$/, "");
      const metaKey = backupMetaKey(objectKey);
      let meta: Record<string, unknown> | null = null;
      try {
        meta = JSON.parse((await this.downloadObject(metaKey)).toString("utf8")) as Record<string, unknown>;
      } catch {
        meta = null; // orphan / incomplete upload — NOT a valid backup
      }
      const exportedAt = typeof meta?.exportedAt === "string" ? meta.exportedAt : (backupIdDate(backupId)?.toISOString() ?? null);
      out.push({
        backupId,
        objectKey,
        metaKey,
        bytes: meta && typeof meta.bytes === "number" ? meta.bytes : o.size,
        sha256: typeof meta?.sha256 === "string" ? meta.sha256 : null,
        exportedAt,
        verified: meta ? meta.verified === true : null,
        tables: typeof meta?.tables === "number" ? meta.tables : null,
        rows: typeof meta?.rows === "number" ? meta.rows : null,
        updatedAt: o.updatedAt,
        orphan: meta === null,
      });
    }
    out.sort((a, b) => (b.exportedAt ?? "").localeCompare(a.exportedAt ?? ""));
    return out;
  }

  /**
   * 14-day default retention (configurable). Safety rules:
   *  - only objects with a VERIFIED metadata record are valid backups
   *  - a backup is deleted only when its export timestamp is OUTSIDE the
   *    retention window (UTC epoch arithmetic — timezone-safe)
   *  - the newest verified backup is NEVER deleted (last restorable point)
   *  - if it is the ONLY recovery point, nothing is deleted at all
   *  - orphans (failed/incomplete uploads, no metadata) are swept only after
   *    the grace period — they are never treated as valid backups
   *  - every deletion is recorded and returned
   */
  async enforceRetention(now: Date = new Date()): Promise<RetentionReport> {
    const ranAt = now.toISOString();
    const windowMs = this.config.retentionDays * 86_400_000;
    const report: RetentionReport = {
      ranAt, retentionDays: this.config.retentionDays, windowStartMs: now.getTime() - windowMs,
      listed: 0, verifiedBackups: 0, orphans: 0, keptVerified: 0, deleted: [],
      protectedNewest: null, skippedOnlyRecoveryPoint: false,
      notes: [
        `retention window: ${this.config.retentionDays} days (UTC epoch arithmetic; no timezone drift)`,
        "the newest verified backup is never deleted — it is the last restorable recovery point",
        "orphans (artifacts without a verified metadata record) are not valid backups and are swept after the grace period",
      ],
    };
    const backups = await this.listBackups();
    report.listed = backups.length;
    const verified = backups.filter((b) => b.verified === true && b.orphan === false);
    report.verifiedBackups = verified.length;
    report.orphans = backups.length - verified.length;

    // never delete the newest verified backup (also the only recovery point)
    const newest = verified[0] ?? null;
    report.protectedNewest = newest?.objectKey ?? null;
    const onlyRecoveryPoint = verified.length <= 1;
    if (onlyRecoveryPoint && verified.length === 1) {
      report.skippedOnlyRecoveryPoint = true;
      report.notes.push(`only one verified recovery point exists (${newest!.objectKey}) — retention deletes nothing`);
    }

    for (const b of verified) {
      if (newest && b.objectKey === newest.objectKey) continue; // protected
      const exportedMs = b.exportedAt ? Date.parse(b.exportedAt) : Number.NaN;
      if (!Number.isFinite(exportedMs)) {
        report.notes.push(`unreadable export timestamp for ${b.objectKey} — kept (conservative)`);
        continue;
      }
      const ageMs = now.getTime() - exportedMs;
      if (ageMs >= windowMs) {
        // outside the retention window — delete (but never the only recovery point)
        await this.deleteObject(b.objectKey);
        await this.deleteObject(b.metaKey).catch(() => undefined);
        report.deleted.push({ objectKey: b.objectKey, backupId: b.backupId, reason: "EXPIRED", exportedAt: b.exportedAt, deletedAt: new Date().toISOString() });
      }
    }
    report.keptVerified = verified.length - report.deleted.filter((d) => d.reason === "EXPIRED").length;

    // orphan sweep (failed/incomplete uploads are NOT valid backups)
    for (const b of backups.filter((x) => x.orphan)) {
      const updatedMs = b.updatedAt ? Date.parse(b.updatedAt) : (b.exportedAt ? Date.parse(b.exportedAt) : Number.NaN);
      if (!Number.isFinite(updatedMs)) continue; // unknown age — keep (conservative)
      if (now.getTime() - updatedMs >= this.config.orphanGraceMs) {
        await this.deleteObject(b.objectKey);
        report.deleted.push({ objectKey: b.objectKey, backupId: b.backupId, reason: "ORPHAN_INCOMPLETE", exportedAt: b.exportedAt, deletedAt: new Date().toISOString() });
      }
    }
    return report;
  }
}
