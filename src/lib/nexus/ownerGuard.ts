import { NextRequest, NextResponse } from 'next/server';
import { checkOwnerKey } from './ownerAuth';
import {
  authFailuresExceeded,
  authRetryAfterSec,
  clientIpFromRequest,
  consumeGeneralRequest,
  registerAuthFailure,
} from './rateLimit';

/**
 * Route-handler guard: the single enforcement point for privileged routes.
 * Returns a response when the request must be DENIED, or null when allowed.
 * ASYNC — call sites read `const denied = await requireOwnerKey(req);`.
 *
 * Enforcement layers (Phase 1, Part 13 + Part 14):
 *
 *   1. RATE LIMIT — 5 authentication failures / 60 s / IP → 429 (mirrors the
 *      FastAPI CORE policy), plus a general 240 req / 60 s / IP abuse cap.
 *   2. OWNER KEY — X-Owner-Key or Bearer, constant-time, deny-by-default.
 *      Failures write SecurityAuditEvent records (route + IP only — never key
 *      material) and count toward the rate limiter.
 *   3. MASTER SWITCH — read fresh from the database on every request. When
 *      master is OFF every privileged route is denied (Part 13: "Everything
 *      except health and login denied") EXCEPT the control plane (the
 *      switches routes and the owner-key verification endpoint), which must
 *      stay reachable so the owner can always switch the system back on.
 *      Denials are audited.
 *
 * Usage:
 *
 *   const denied = await requireOwnerKey(req);                    // full guard
 *   const denied = await requireOwnerKey(req, { skipMasterGate: true }); // control plane
 */
export interface GuardOptions {
  /** Control-plane routes (switches, auth/verify) stay reachable when master is OFF. */
  skipMasterGate?: boolean;
}

function routePath(req: NextRequest | Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return 'unknown-route';
  }
}

async function auditDeny(category: string, message: string, severity: 'info' | 'warning' | 'error'): Promise<void> {
  // Audit writes must never break the guard; if the database is unavailable
  // the denial itself still stands (fail-closed on the switch read below).
  try {
    const { db } = await import('@/lib/db');
    await db.securityAuditEvent.create({
      data: { severity, category, message, source: 'OwnerGuard', resolved: true },
    });
  } catch {
    /* audit best-effort; denial already decided */
  }
}

export async function requireOwnerKey(
  req: NextRequest | Request,
  opts: GuardOptions = {},
): Promise<NextResponse | null> {
  const ip = clientIpFromRequest(req);
  const path = routePath(req);

  // --- layer 1: auth-failure rate limit (429) --------------------------------
  if (authFailuresExceeded(ip)) {
    const retry = authRetryAfterSec(ip);
    return NextResponse.json(
      { detail: `Too many failed owner-key attempts. Retry after ${retry}s.`, auth_required: 'owner_key' },
      { status: 429, headers: { 'Retry-After': String(retry), 'X-Auth-Required': 'owner-key' } },
    );
  }
  // --- layer 1b: general abuse cap (429) --------------------------------------
  if (!consumeGeneralRequest(ip)) {
    void auditDeny('rate_limit', `General rate limit exceeded for ${ip} on ${path}.`, 'warning');
    return NextResponse.json(
      { detail: 'Rate limit exceeded. Slow down.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  // --- layer 2: owner key (403) -----------------------------------------------
  const auth = checkOwnerKey(req);
  if (!auth.ok) {
    registerAuthFailure(ip);
    void auditDeny('auth_denied', `Owner key denied on ${path} from ${ip} (${auth.reason ?? 'invalid'}).`, 'warning');
    return NextResponse.json(
      { detail: auth.reason ?? 'Owner authentication required.', auth_required: 'owner_key' },
      { status: 403, headers: { 'X-Auth-Required': 'owner-key' } },
    );
  }

  // --- layer 3: master switch (403) — fresh read every request ----------------
  if (!opts.skipMasterGate) {
    try {
      const { db } = await import('@/lib/db');
      const master = await db.ownerSwitch.findUnique({ where: { switchKey: 'master' } });
      if (master && !master.enabled) {
        void auditDeny('master_off', `Privileged route ${path} denied: Master switch is OFF.`, 'warning');
        return NextResponse.json(
          {
            detail: 'Master switch is OFF. Only health, switch control and owner verification remain available.',
            switch: 'master',
            switch_enabled: false,
          },
          { status: 403, headers: { 'X-Switch-Required': 'master' } },
        );
      }
    } catch (err) {
      // Fail closed: if the switch state cannot be read, deny.
      void auditDeny('master_gate_error', `Master gate could not read switch state on ${path}: ${(err as Error).message}.`, 'error');
      return NextResponse.json(
        { detail: 'Cannot verify Master switch state — request denied (fail closed).' },
        { status: 503 },
      );
    }
  }

  return null;
}
