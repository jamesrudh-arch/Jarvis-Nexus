import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed } from '@/lib/nexus/worldHub';

export async function GET() {
  try {
    await ensureSeed();
    const rows = await db.ownerSwitch.findMany();
    return NextResponse.json({
      switches: rows.map((s) => ({
        switch_key: s.switchKey,
        label: s.label,
        enabled: s.enabled,
        description: s.description,
        enforcement_scope: s.enforcementScope,
      })),
    });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
