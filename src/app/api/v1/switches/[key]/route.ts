import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed, serializeWorld } from '@/lib/nexus/worldHub';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const denied = requireOwnerKey(req);
  if (denied) return denied;
  try {
    await ensureSeed();
    const { key } = await ctx.params;
    const body = await req.json();
    const existing = await db.ownerSwitch.findUnique({ where: { switchKey: key } });
    if (!existing) {
      return NextResponse.json({ detail: `Unknown switch: ${key}` }, { status: 404 });
    }
    await db.ownerSwitch.update({
      where: { switchKey: key },
      data: { enabled: Boolean(body.enabled) },
    });
    await db.securityAuditEvent.create({
      data: {
        severity: key === 'master' && !body.enabled ? 'warning' : 'info',
        category: 'owner_switch',
        message: `Owner switch "${existing.label}" set to ${body.enabled ? 'ON' : 'OFF'} by Owner.`,
        source: 'OwnerConsole',
        resolved: true,
      },
    });
    const world = await serializeWorld();
    return NextResponse.json({ world });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
