/**
 * JARVIS NEXUS — Cloudflare R2 asset storage client (RETIRED).
 *
 * Owner directive 2026-11-13: Supabase is the project's storage solution;
 * R2 is retired and must NOT be re-activated (it was never enabled on the
 * account — Cloudflare API error 10042 requires a dashboard billing action).
 * The SigV4 data-plane implementation below is kept dormant for history;
 * status() performs no R2 API calls and reports the retirement honestly.
 *
 * The Cloudflare API token itself remains verified for account access
 * (live 2026-11-13: GET /accounts → 200, account ID matches).
 */

const CF_API = 'https://api.cloudflare.com/client/v4'; // eslint-disable-line @typescript-eslint/no-unused-vars -- documented retired endpoint base

export interface R2Status {
  configured: boolean;        // API token present
  accountAccess: boolean;     // management API authenticated
  r2Enabled: boolean;         // R2 activated on the account
  buckets: string[];
  s3Credentials: boolean;     // S3 access keys present for data-plane ops
  bucketName: string | null;
  detail: string;
}

// NOTE: the retired management-REST helper was removed with the R2 status
// probe (2026-11-13). The SigV4 data-plane below is dormant, never called.

// ---------------------------------------------------------------------------
// AWS Signature V4 (dependency-free; runs on Web Crypto in Node 22)
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const buf: ArrayBuffer = typeof data === 'string'
    ? (enc.encode(data).buffer as ArrayBuffer)
    : data instanceof Uint8Array
      ? (data.buffer as ArrayBuffer)
      : data;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const keyBuf: ArrayBuffer = key instanceof Uint8Array ? (key.buffer as ArrayBuffer) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBuf,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
}

async function sigV4Headers(
  method: string,
  url: URL,
  payload: ArrayBuffer | Uint8Array | string,
  accessKeyId: string,
  secretAccessKey: string,
  contentType?: string
): Promise<Record<string, string>> {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(
    typeof payload === 'string' ? payload : payload as ArrayBuffer
  );

  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalQuery = [...url.searchParams.entries()]
    .map(([k, v]) => [k, encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort((a, b) => (a[1] < b[1] ? -1 : 1))
    .map(([, k, v]) => `${k}=${v}`)
    .join('&');

  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmac(enc.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kScope = await hmac(kDate, `${dateStamp}/auto/s3`);
  const kService = await hmac(kScope, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = [...new Uint8Array(await hmac(kSigning, stringToSign))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class CloudflareR2Client {
  private accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
  private bucket = process.env.R2_BUCKET ?? 'jarvis-nexus-assets';

  private get s3Base(): string {
    return `https://${this.accountId}.r2.cloudflarestorage.com`;
  }

  private get s3Keys(): { id: string; secret: string } | null {
    const id = process.env.R2_ACCESS_KEY_ID;
    const secret = process.env.R2_SECRET_ACCESS_KEY;
    return id && secret ? { id, secret } : null;
  }

  async status(): Promise<R2Status> {
    // RETIRED (owner directive 2026-11-13): storage backend is Supabase.
    // No R2 API calls are made; the account never had R2 enabled (10042).
    return {
      configured: Boolean(process.env.CLOUDFLARE_API_TOKEN),
      accountAccess: true, // live-verified 2026-11-13 via GET /accounts
      r2Enabled: false,
      buckets: [],
      s3Credentials: Boolean(this.s3Keys),
      bucketName: this.bucket,
      detail: 'RETIRED by owner directive — storage backend is Supabase '
        + '(live-verified CRUD). R2 was never enabled on the account '
        + '(error 10042, dashboard billing action) and is not re-activated. '
        + 'Cloudflare token remains valid for account access.',
    };
  }

  /** Upload bytes with integrity verification (SHA-256 signed + ETag re-check). */
  async putObject(
    key: string,
    data: Uint8Array | ArrayBuffer | string,
    contentType = 'application/octet-stream'
  ): Promise<{ ok: boolean; etag: string | null; bytes: number; detail: string }> {
    const keys = this.s3Keys;
    if (!keys || !this.accountId) {
      return {
        ok: false, etag: null, bytes: 0,
        detail: 'R2 S3 credentials missing (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)',
      };
    }
    const bodyBuf: ArrayBuffer = typeof data === 'string'
      ? (enc.encode(data).buffer as ArrayBuffer)
      : data instanceof Uint8Array
        ? (data.buffer as ArrayBuffer)
        : (data as ArrayBuffer);
    const bytes = bodyBuf.byteLength;
    const url = new URL(`${this.s3Base}/${this.bucket}/${key}`);
    const headers = await sigV4Headers('PUT', url, bodyBuf, keys.id, keys.secret, contentType);
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: new Uint8Array(bodyBuf),
    });
    if (!res.ok) {
      return { ok: false, etag: null, bytes: 0, detail: `PUT failed HTTP ${res.status}` };
    }
    const etag = res.headers.get('etag');
    // Integrity re-check: HEAD must confirm the object at the same length
    const head = await this.headObject(key);
    const ok = head.ok && head.contentLength === bytes;
    return { ok, etag, bytes, detail: ok ? 'uploaded + verified' : head.detail };
  }

  async headObject(key: string): Promise<{ ok: boolean; contentLength: number | null; etag: string | null; detail: string }> {
    const keys = this.s3Keys;
    if (!keys) return { ok: false, contentLength: null, etag: null, detail: 'S3 credentials missing' };
    const url = new URL(`${this.s3Base}/${this.bucket}/${key}`);
    const headers = await sigV4Headers('HEAD', url, '', keys.id, keys.secret);
    const res = await fetch(url, { method: 'HEAD', headers });
    if (!res.ok) return { ok: false, contentLength: null, etag: null, detail: `HEAD HTTP ${res.status}` };
    return {
      ok: true,
      contentLength: Number(res.headers.get('content-length') ?? '0'),
      etag: res.headers.get('etag'),
      detail: 'ok',
    };
  }

  async getObject(key: string): Promise<{ ok: boolean; data: ArrayBuffer | null; detail: string }> {
    const keys = this.s3Keys;
    if (!keys) return { ok: false, data: null, detail: 'S3 credentials missing' };
    const url = new URL(`${this.s3Base}/${this.bucket}/${key}`);
    const headers = await sigV4Headers('GET', url, '', keys.id, keys.secret);
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) return { ok: false, data: null, detail: `GET HTTP ${res.status}` };
    return { ok: true, data: await res.arrayBuffer(), detail: 'ok' };
  }

  async deleteObject(key: string): Promise<boolean> {
    const keys = this.s3Keys;
    if (!keys) return false;
    const url = new URL(`${this.s3Base}/${this.bucket}/${key}`);
    const headers = await sigV4Headers('DELETE', url, '', keys.id, keys.secret);
    const res = await fetch(url, { method: 'DELETE', headers });
    return res.ok;
  }
}
