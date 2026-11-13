import { NextResponse } from 'next/server';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

/**
 * GET /api/v1/auth/verify — owner-key verification ("login").
 *
 * Purpose (Phase 1, Part 13): when the Master switch is OFF, everything is
 * denied "except health and login". This endpoint IS that login surface: it
 * verifies the owner key WITHOUT the master gate, so the OwnerGate panel can
 * authenticate and reach the switches control plane to bring the system back
 * up. It returns no data beyond the verification result.
 */
export async function GET(req: Request) {
  const denied = await requireOwnerKey(req, { skipMasterGate: true });
  if (denied) return denied;
  return NextResponse.json({ ok: true, verified_at: new Date().toISOString() });
}
