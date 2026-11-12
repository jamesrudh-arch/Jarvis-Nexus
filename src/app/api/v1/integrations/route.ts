import { NextResponse } from 'next/server';
import { getIntegrationSnapshot } from '@/lib/nexus/integrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/integrations — live connection status of every external
 * service (GitHub, Kaggle ×6, Cloudflare R2, Supabase, Railway, Epic EOS).
 * Responses contain connection state and identities ONLY — never credentials.
 */
export async function GET() {
  try {
    const snap = await getIntegrationSnapshot();
    return NextResponse.json(snap);
  } catch (err) {
    return NextResponse.json(
      { error: `Integration status failed: ${(err as Error).message}` },
      { status: 503 }
    );
  }
}

/** POST /api/v1/integrations {action:"verify"} — force a fresh live check. */
export async function POST(request: Request) {
  let body: { action?: string } = {};
  try { body = await request.json(); } catch { /* empty body */ }
  if (body.action !== 'verify') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  }
  const snap = await getIntegrationSnapshot(true);
  return NextResponse.json(snap);
}
