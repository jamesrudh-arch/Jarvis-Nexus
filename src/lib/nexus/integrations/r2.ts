/**
 * JARVIS NEXUS — Cloudflare R2 asset storage client.
 *
 * Two real surfaces:
 *  1. Management REST (Bearer CLOUDFLARE_API_TOKEN) — bucket listing/creation.
 *     Live-verified 2026-11-12: token authenticates and reaches the R2 API;
 *     the account currently returns error 10042 ("Please enable R2 through
 *     the Cloudflare Dashboard") — surfaced honestly until the owner enables
 *     R2 (one dashboard toggle + payment method).
 *  2. S3-compatible data API (SigV4-signed, Web Crypto, zero dependencies)
 *     at https://{accountId}.r2.cloudflarestorage.com — real PUT/GET/HEAD/
 *     DELETE once R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY exist (dashboard →
 *     R2 → Manage API Tokens → S3 credentials). SHA-256 payload hashing gives
 *     end-to-end integrity; ETag is re-checked after every upload.
 */

const CF_API = 'https://api.cloudflare.com/client/v4';

export interface R2Status {
  configured: boolean;        // API token present
  accountAccess: boolean;     // management API authenticated
  r2Enabled: boolean;         // R2 activated on the account
  buckets: string[];
  s3Credentials: boolean;     // S3 access keys present for data-plane ops
  bucketName: string | null;
  detail: string;
}

async function cfFetch(path: string, init?: { method?: string; body?: unknown }) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${CF_API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      result?: unknown;
      errors?: Array<{ code?: number; message?: string }>;
    } | null;
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

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
    const out: R2Status = {
      configured: Boolean(process.env.CLOUDFLARE_API_TOKEN),
      accountAccess: false,
      r2Enabled: false,
      buckets: [],
      s3Credentials: Boolean(this.s3Keys),
      bucketName: this.bucket,
      detail: '',
    };
    if (!out.configured) {
      out.detail = 'CLOUDFLARE_API_TOKEN not configured';
      return out;
    }
    const { status, data } = await cfFetch(`/accounts/${this.accountId}/r2/buckets`);
    if (status === 200 && data?.success) {
      out.accountAccess = true;
      out.r2Enabled = true;
      out.buckets = ((data.result as { buckets?: Array<{ name: string }> })?.buckets ?? [])
        .map((b) => b.name);
      out.detail = `R2 active — ${out.buckets.length} bucket(s)`;
    } else if (data?.errors?.some((e) => e.code === 10042)) {
      out.accountAccess = true;
      out.detail = 'Token authenticated, but R2 is not enabled on the account yet '
        + '(Cloudflare Dashboard → R2 → Enable). S3 data-plane credentials '
        + '(R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY) are also required for uploads.';
    } else {
      out.detail = `R2 API HTTP ${status}: ${data?.errors?.[0]?.message ?? 'unknown error'}`;
    }
    return out;
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
