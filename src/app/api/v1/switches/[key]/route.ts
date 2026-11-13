import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed, serializeWorld } from '@/lib/nexus/worldHub';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';
import { applyMasterOffCascade } from '@/lib/nexus/switchGate';

/**
 * PATCH /api/v1/switches/[key] — the owner switches control plane.
 *
 * Control-plane carve-out (Phase 1, Part 13): this route is owner-key guarded
 * but NOT master-gated — when Master is OFF, "everything except health and
 * login" is denied, and this is the surface the owner uses to bring the
 * system back. Setting Master OFF runs the cascade (microphone + camera
 * released, running agents paused, world to standby), mirroring the FastAPI
 * CORE semantics.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const denied = await requireOwnerKey(req, { skipMasterGate: true });
  if (denied) return denied;
  try {
    await ensureSeed();
    const { key } = await ctx.params;
    const body = await req.json();
    const existing = await db.ownerSwitch.findUnique({ where: { switchKey: key } });
    if (!existing) {
      return NextResponse.json({ detail: `Unknown switch: ${key}` }, { status: 404 });
    }
    const enable = Boolean(body.enabled);
    await db.ownerSwitch.update({
      where: { switchKey: key },
      data: { enabled: enable },
    });

    // Master-OFF cascade (mirrors the FastAPI CORE effects).
    const effects: string[] = [];
    if (key === 'master' && !enable) {
      const cascaded = await applyMasterOffCascade();
      effects.push(...cascaded);
    }

    await db.securityAuditEvent.create({
      data: {
        severity: key === 'master' && !enable ? 'warning' : 'info',
        category: 'owner_switch',
        message: `Owner switch "${existing.label}" set to ${enable ? 'ON' : 'OFF'} by Owner. Effects: ${
          effects.length ? effects.join(', ') : 'immediate gate update'
        }.`,
        source: 'OwnerConsole',
        resolved: true,
      },
    });
    const world = await serializeWorld();
    return NextResponse.json({ world, effects });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
