import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const existing = await db.memoryRecord.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ detail: 'Memory not found.' }, { status: 404 });
    // Hard guardrail: no silent promotion of hypothesis -> verified_fact
    if (
      existing.epistemicStatus === 'hypothesis' &&
      body.epistemic_status === 'verified_fact' &&
      !body.verified_by_owner
    ) {
      return NextResponse.json(
        { detail: 'Hypothesis cannot be promoted to verified fact without explicit owner verification.' },
        { status: 409 }
      );
    }
    await db.memoryRecord.update({
      where: { id },
      data: {
        ...(body.title ? { title: String(body.title).slice(0, 190) } : {}),
        ...(body.content ? { content: String(body.content).slice(0, 2000) } : {}),
        ...(body.epistemic_status ? { epistemicStatus: String(body.epistemic_status) } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    await db.memoryRecord.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
