import { NextRequest, NextResponse } from 'next/server';
import { checkOwnerKey } from './ownerAuth';

/**
 * Route-handler guard: returns a 403 response when the request is NOT
 * owner-authenticated, or null when it is. Usage at the top of every
 * privileged handler:
 *
 *   const denied = requireOwnerKey(req);
 *   if (denied) return denied;
 *
 * The rejection carries `X-Auth-Required: owner-key` so the browser client can
 * distinguish "unlock needed" (show the owner-key panel) from other failures.
 */
export function requireOwnerKey(req: NextRequest | Request): NextResponse | null {
  const auth = checkOwnerKey(req);
  if (auth.ok) return null;
  return NextResponse.json(
    { detail: auth.reason ?? 'Owner authentication required.', auth_required: 'owner_key' },
    { status: 403, headers: { 'X-Auth-Required': 'owner-key' } },
  );
}
