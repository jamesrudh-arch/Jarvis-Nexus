import { timingSafeEqual } from 'node:crypto';

/**
 * Owner authentication for privileged API operations (Gate 0, production app).
 *
 * A request is owner-authenticated when it carries the server-side OWNER_KEY
 * secret either in the `X-Owner-Key` header (the established storage-route
 * contract) or as `Authorization: Bearer <OWNER_KEY>` (the FastAPI CORE
 * contract). Both are compared in constant time. When OWNER_KEY is not
 * configured the check DENIES BY DEFAULT — privileged operations stay locked
 * rather than silently open.
 *
 * This module is deliberately free of Next.js imports so it can be unit-tested
 * directly (node --test with native TS type-stripping).
 */

export interface OwnerAuthResult {
  ok: boolean;
  reason?: string;
}

/** Length-bounded constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    // Burn the same amount of work as the equal-length path, then fail.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** Extract the candidate owner key from request headers (X-Owner-Key or Bearer). */
export function ownerKeyFromRequest(req: Request): string | null {
  const header = req.headers.get('x-owner-key');
  if (header && header.trim()) return header.trim();
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }
  return null;
}

/**
 * Check owner authentication for a request.
 * NEVER include the expected or supplied key value in the reason — reasons are
 * safe to show in API responses and logs.
 */
export function checkOwnerKey(req: Request): OwnerAuthResult {
  const required = process.env.OWNER_KEY;
  if (!required) {
    return { ok: false, reason: 'OWNER_KEY not configured on the server — privileged operations are locked.' };
  }
  const supplied = ownerKeyFromRequest(req);
  if (!supplied) {
    return { ok: false, reason: 'Owner key required (X-Owner-Key header or Authorization: Bearer).' };
  }
  if (!safeEqual(supplied, required)) {
    return { ok: false, reason: 'Invalid owner key.' };
  }
  return { ok: true };
}
