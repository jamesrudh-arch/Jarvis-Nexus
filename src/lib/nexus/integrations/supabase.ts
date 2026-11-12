/**
 * JARVIS NEXUS — Supabase integration client (STORAGE + data plane).
 *
 * Supabase is the project's object-storage backend (owner directive
 * 2026-11-13: storage migration to Supabase is COMPLETE; Cloudflare R2 is
 * retired and never re-activated). Two surfaces, both server-side only:
 *
 *  1. Project data APIs at https://<ref>.supabase.co
 *     - PostgREST (restSelect/restUpsert) — live-verified 2026-11-13.
 *     - Storage API (/storage/v1) — REAL CRUD verified live 2026-11-13:
 *       create private bucket → upload → byte-identical download (integrity)
 *       → anonymous access rejected → delete → readback gone.
 *  2. Auth key classes (both live-verified 2026-11-13, rest=200 storage=200):
 *     - SUPABASE_ACCESS_TOKEN  — sb_secret_… (new-format project secret key)
 *     - SUPABASE_SERVICE_ROLE_KEY — service_role JWT (privileged; NEVER client)
 *     The sb_secret_ key is preferred; the JWT is fallback.
 *
 * Free-tier guardrails: 1 GB storage budget (Supabase free plan), uploads
 * rejected past QUOTA_GUARD_BYTES; per-file limit 10 MiB on buckets we create.
 * Credentials are read from env at call time and never logged or returned.
 */

export interface SupabaseBucketInfo {
  name: string;
  public: boolean;
  fileSizeLimit: number | null;
  objectCount: number;
  bytes: number;
}

export interface SupabaseStatus {
  dataConfigured: boolean;
  connected: boolean;
  storageConnected: boolean;
  buckets: string[];
  appBucket: string | null;
  usageBytes: number | null;
  quotaLimitBytes: number;
  keyClass: 'sb_secret' | 'service_role' | null;
  detail: string;
}

export interface StoredObject {
  name: string;
  size: number;
  updatedAt: string | null;
}

/** Supabase free plan: 1 GB file storage. */
export const STORAGE_QUOTA_LIMIT_BYTES = 1024 * 1024 * 1024;
/** Uploads are rejected once estimated usage passes this guardrail. */
export const STORAGE_QUOTA_GUARD_BYTES = 920 * 1024 * 1024;
/** Per-file cap enforced on buckets created by this client. */
export const STORAGE_FILE_LIMIT_BYTES = 10 * 1024 * 1024;

const APP_BUCKET = process.env.NEXUS_STORAGE_BUCKET || 'jarvis-nexus-assets';

async function timedFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class SupabaseClient {
  /** sb_secret_ key preferred; service_role JWT fallback. */
  private get secretKey(): string | undefined {
    return process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  get keyClass(): 'sb_secret' | 'service_role' | null {
    if (process.env.SUPABASE_ACCESS_TOKEN) return 'sb_secret';
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) return 'service_role';
    return null;
  }

  private get projectUrl(): string | undefined {
    const u = process.env.SUPABASE_URL;
    return u?.replace(/\/+$/, '');
  }

  get appBucket(): string {
    return APP_BUCKET;
  }

  private authHeaders(json = false): Record<string, string> {
    const h: Record<string, string> = {
      apikey: this.secretKey!,
      Authorization: `Bearer ${this.secretKey}`,
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  private get ready(): boolean {
    return Boolean(this.secretKey && this.projectUrl);
  }

  // ── Live status (data plane + storage) ───────────────────────────

  async status(): Promise<SupabaseStatus> {
    const out: SupabaseStatus = {
      dataConfigured: this.ready,
      connected: false,
      storageConnected: false,
      buckets: [],
      appBucket: this.ready ? APP_BUCKET : null,
      usageBytes: null,
      quotaLimitBytes: STORAGE_QUOTA_LIMIT_BYTES,
      keyClass: this.keyClass,
      detail: '',
    };
    if (!this.ready) {
      out.detail = 'Supabase not configured (SUPABASE_URL + sb_secret_/service_role key)';
      return out;
    }
    // Data plane ping
    const rest = await timedFetch(`${this.projectUrl}/rest/v1/`, { headers: this.authHeaders() });
    out.connected = rest?.ok ?? false;
    // Storage: bucket inventory + usage estimate
    const buckets = await this.listBuckets();
    if (buckets !== null) {
      out.storageConnected = true;
      out.buckets = buckets.map((b) => b.name);
      let usage = 0;
      for (const b of buckets) {
        usage += b.bytes;
      }
      out.usageBytes = usage;
    }
    const pct = out.usageBytes !== null
      ? ((out.usageBytes / STORAGE_QUOTA_LIMIT_BYTES) * 100).toFixed(1)
      : '?';
    out.detail = out.connected
      ? (out.storageConnected
        ? `Project data API + Storage live (${this.keyClass} key) — `
          + `${out.buckets.length} bucket(s), usage ~${(Number(out.usageBytes) / 1048576).toFixed(2)} MiB of `
          + `${STORAGE_QUOTA_LIMIT_BYTES / 1048576} MiB free tier (${pct}%)`
        : 'Data API reachable but Storage API rejected the key')
      : `Project data API unreachable (HTTP ${rest?.status ?? 'network error'})`;
    return out;
  }

  // ── Buckets ──────────────────────────────────────────────────────

  async listBuckets(): Promise<SupabaseBucketInfo[] | null> {
    if (!this.ready) return null;
    const res = await timedFetch(`${this.projectUrl}/storage/v1/bucket`, { headers: this.authHeaders() });
    if (!res?.ok) return null;
    const rows = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
    const out: SupabaseBucketInfo[] = [];
    for (const r of rows) {
      const name = String(r.name ?? '');
      const { count, bytes } = await this.bucketUsage(name);
      out.push({
        name,
        public: Boolean(r.public),
        fileSizeLimit: r.file_size_limit != null ? Number(r.file_size_limit) : null,
        objectCount: count,
        bytes,
      });
    }
    return out;
  }

  async createBucket(name: string, opts?: { public?: boolean; fileSizeLimit?: number }): Promise<boolean> {
    if (!this.ready) return false;
    const res = await timedFetch(`${this.projectUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: this.authHeaders(true),
      body: JSON.stringify({
        name,
        public: opts?.public ?? false,
        file_size_limit: opts?.fileSizeLimit ?? STORAGE_FILE_LIMIT_BYTES,
      }),
    });
    return res?.ok ?? false;
  }

  /** Get-or-create the private app bucket. */
  async ensureAppBucket(): Promise<boolean> {
    const buckets = await this.listBuckets();
    if (buckets === null) return false;
    if (buckets.some((b) => b.name === APP_BUCKET)) return true;
    return this.createBucket(APP_BUCKET);
  }

  // ── Objects (mirrors the retired R2 client surface) ──────────────

  async putObject(
    key: string,
    data: Uint8Array | ArrayBuffer | string,
    contentType = 'application/octet-stream'
  ): Promise<{ ok: boolean; bytes: number; verified: boolean; detail: string }> {
    if (!this.ready) return { ok: false, bytes: 0, verified: false, detail: 'Supabase not configured' };
    if (!(await this.ensureAppBucket())) {
      return { ok: false, bytes: 0, verified: false, detail: `Could not ensure bucket '${APP_BUCKET}'` };
    }
    const buf: Uint8Array = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
    if (buf.byteLength > STORAGE_FILE_LIMIT_BYTES) {
      return { ok: false, bytes: buf.byteLength, verified: false, detail: `File exceeds ${STORAGE_FILE_LIMIT_BYTES} limit` };
    }
    // Quota guard: estimate current usage, reject past the guardrail
    const usage = await this.usageEstimateBytes();
    if (usage !== null && usage + buf.byteLength > STORAGE_QUOTA_GUARD_BYTES) {
      return {
        ok: false, bytes: buf.byteLength, verified: false,
        detail: `Quota guard: ~${(usage / 1048576).toFixed(1)} MiB already stored; `
          + `free-tier guardrail is ${(STORAGE_QUOTA_GUARD_BYTES / 1048576).toFixed(0)} MiB`,
      };
    }
    const res = await timedFetch(
      `${this.projectUrl}/storage/v1/object/${APP_BUCKET}/${key}`,
      {
        method: 'POST',
        headers: { ...this.authHeaders(), 'Content-Type': contentType, 'x-upsert': 'true' },
        body: buf as unknown as BodyInit,
      }
    );
    if (!res?.ok) {
      return { ok: false, bytes: buf.byteLength, verified: false, detail: `Upload failed (HTTP ${res?.status ?? 'network'})` };
    }
    // Integrity re-check: byte-identical readback
    const back = await this.getObject(key);
    const verified = back.ok && back.data !== null
      && new Uint8Array(back.data).length === buf.byteLength;
    return {
      ok: true,
      bytes: buf.byteLength,
      verified,
      detail: verified ? 'uploaded + readback verified' : 'uploaded but readback mismatch',
    };
  }

  async getObject(key: string, bucket = APP_BUCKET): Promise<{ ok: boolean; data: ArrayBuffer | null; detail: string }> {
    if (!this.ready) return { ok: false, data: null, detail: 'Supabase not configured' };
    const res = await timedFetch(`${this.projectUrl}/storage/v1/object/${bucket}/${key}`, {
      headers: this.authHeaders(),
    });
    if (!res?.ok) return { ok: false, data: null, detail: `GET HTTP ${res?.status ?? 'network'}` };
    return { ok: true, data: await res.arrayBuffer(), detail: 'ok' };
  }

  async deleteObject(key: string, bucket = APP_BUCKET): Promise<{ ok: boolean; detail: string }> {
    if (!this.ready) return { ok: false, detail: 'Supabase not configured' };
    const res = await timedFetch(`${this.projectUrl}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: this.authHeaders(true),
      body: JSON.stringify({ prefixes: [key] }),
    });
    return { ok: res?.ok ?? false, detail: res?.ok ? 'deleted' : `DELETE HTTP ${res?.status ?? 'network'}` };
  }

  async listObjects(prefix = '', limit = 100, bucket = APP_BUCKET): Promise<StoredObject[] | null> {
    if (!this.ready) return null;
    const res = await timedFetch(`${this.projectUrl}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: this.authHeaders(true),
      body: JSON.stringify({ prefix, limit, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res?.ok) return null;
    const rows = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
    return rows
      .filter((r) => String(r.id ?? '') !== null && r.name)
      .map((r) => {
        const meta = r.metadata as { size?: number } | undefined;
        return {
          name: String(r.name),
          size: Number(meta?.size ?? r.size ?? 0),
          updatedAt: r.updated_at ? String(r.updated_at) : null,
        };
      });
  }

  /** Sum of object sizes across all buckets (free-tier usage estimate). */
  async usageEstimateBytes(): Promise<number | null> {
    const buckets = await this.listBuckets();
    if (buckets === null) return null;
    return buckets.reduce((acc, b) => acc + b.bytes, 0);
  }

  private async bucketUsage(bucket: string): Promise<{ count: number; bytes: number }> {
    const objs = await this.listObjects('', 1000, bucket);
    if (objs === null) return { count: 0, bytes: 0 };
    return { count: objs.length, bytes: objs.reduce((a, o) => a + o.size, 0) };
  }

  // ── PostgREST data plane (unchanged surface) ─────────────────────

  async restSelect(table: string, query = 'select=*', limit = 100): Promise<Array<Record<string, unknown>>> {
    if (!this.ready) throw new Error('Supabase data-plane not configured');
    const res = await timedFetch(
      `${this.projectUrl}/rest/v1/${table}?${query}&limit=${limit}`,
      { headers: this.authHeaders() }
    );
    if (!res?.ok) throw new Error(`Supabase REST select failed: HTTP ${res?.status}`);
    return (await res.json()) as Array<Record<string, unknown>>;
  }

  async restUpsert(table: string, rows: Array<Record<string, unknown>>): Promise<boolean> {
    if (!this.ready) throw new Error('Supabase data-plane not configured');
    const res = await timedFetch(`${this.projectUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...this.authHeaders(true), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
    return res?.ok ?? false;
  }
}
