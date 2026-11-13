import { NextRequest, NextResponse } from 'next/server';
import {
  SupabaseClient,
  STORAGE_FILE_LIMIT_BYTES,
  STORAGE_QUOTA_LIMIT_BYTES,
} from '@/lib/nexus/integrations/supabase';
import { sanitizeStorageKey } from '@/lib/nexus/tools';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/v1/storage — owner's cloud object storage (Supabase backend).
 *
 *   GET             → status: backend, buckets, usage, file inventory (metadata only)
 *   GET  ?key=…     → download an object          (X-Owner-Key required)
 *   PUT  ?key=…     → upload raw body ≤ 10 MiB    (X-Owner-Key required)
 *   DELETE ?key=…   → delete an object            (X-Owner-Key required)
 *
 * Mutations/downloads require the X-Owner-Key header to match the server-side
 * OWNER_KEY secret (deny-by-default when OWNER_KEY is unset). All privileged
 * Supabase credentials stay server-side; responses never echo them.
 */

const supabase = new SupabaseClient();

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  try {
    if (!key) {
      // Public metadata surface (no object contents, no credentials)
      const status = await supabase.status();
      const files = status.storageConnected ? await supabase.listObjects('', 200) : null;
      return NextResponse.json({
        backend: 'supabase',
        connected: status.storageConnected,
        buckets: status.buckets,
        app_bucket: status.appBucket,
        usage_bytes: status.usageBytes,
        quota_limit_bytes: STORAGE_QUOTA_LIMIT_BYTES,
        file_size_limit_bytes: STORAGE_FILE_LIMIT_BYTES,
        files: files ?? [],
        detail: status.detail,
      });
    }
    const denied = requireOwnerKey(req);
    if (denied) return denied;
    const clean = sanitizeStorageKey(key);
    if (!clean) return NextResponse.json({ detail: 'Invalid key.' }, { status: 400 });
    const res = await supabase.getObject(clean);
    if (!res.ok || res.data === null) {
      return NextResponse.json({ detail: `Object not found (${res.detail}).` }, { status: 404 });
    }
    return new NextResponse(res.data, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(res.data.byteLength) },
    });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = requireOwnerKey(req);
  if (denied) return denied;
  const key = req.nextUrl.searchParams.get('key');
  const clean = sanitizeStorageKey(key);
  if (!clean) return NextResponse.json({ detail: 'Invalid key (relative path, [A-Za-z0-9._-/], ≤ 128 chars).' }, { status: 400 });
  try {
    const body = new Uint8Array(await req.arrayBuffer());
    if (body.byteLength === 0) return NextResponse.json({ detail: 'Empty body.' }, { status: 400 });
    if (body.byteLength > STORAGE_FILE_LIMIT_BYTES) {
      return NextResponse.json({ detail: `File exceeds ${STORAGE_FILE_LIMIT_BYTES} byte limit.` }, { status: 413 });
    }
    const contentType = req.headers.get('content-type') || 'application/octet-stream';
    const res = await supabase.putObject(clean, body, contentType);
    if (!res.ok) return NextResponse.json({ detail: res.detail }, { status: 502 });
    return NextResponse.json({
      key: clean,
      bytes: res.bytes,
      verified: res.verified,
      detail: res.detail,
    });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = requireOwnerKey(req);
  if (denied) return denied;
  const key = req.nextUrl.searchParams.get('key');
  const clean = sanitizeStorageKey(key);
  if (!clean) return NextResponse.json({ detail: 'Invalid key.' }, { status: 400 });
  const res = await supabase.deleteObject(clean);
  if (!res.ok) return NextResponse.json({ detail: res.detail }, { status: 502 });
  return NextResponse.json({ key: clean, detail: 'deleted' });
}
