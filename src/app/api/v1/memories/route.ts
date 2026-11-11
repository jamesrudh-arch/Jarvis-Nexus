import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed } from '@/lib/nexus/worldHub';

const VALID_CATEGORIES = new Set([
  'owner_fact', 'preference', 'conversation_context', 'commitment',
  'project', 'tool_history', 'agent_finding', 'source_research', 'scenario_media', 'sensitive',
]);
const VALID_STATUSES = new Set(['owner_stated', 'verified_fact', 'source_backed', 'hypothesis']);

export async function GET() {
  try {
    await ensureSeed();
    const rows = await db.memoryRecord.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(
      rows.map((m) => ({
        id: m.id, category: m.category, epistemic_status: m.epistemicStatus,
        title: m.title, content: m.content, is_sensitive: m.isSensitive,
        confidence: m.confidence, source_ref: m.sourceRef, project_tag: m.projectTag,
        created_at: m.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeed();
    const body = await req.json();
    const category = VALID_CATEGORIES.has(body.category) ? body.category : 'project';
    const epistemicStatus = VALID_STATUSES.has(body.epistemic_status) ? body.epistemic_status : 'owner_stated';
    if (!body.title || !body.content) {
      return NextResponse.json({ detail: 'Title and content are required.' }, { status: 400 });
    }
    // Epistemic guardrail: sensitive memories must never claim verified_fact on creation
    if (category === 'sensitive' && epistemicStatus === 'verified_fact') {
      return NextResponse.json(
        { detail: 'Sensitive records cannot be created as verified facts without explicit verification.' },
        { status: 409 }
      );
    }
    const created = await db.memoryRecord.create({
      data: {
        category,
        epistemicStatus,
        title: String(body.title).slice(0, 190),
        content: String(body.content).slice(0, 2000),
        isSensitive: category === 'sensitive',
        confidence: epistemicStatus === 'hypothesis' ? 0.7 : 1.0,
        sourceRef: body.source_ref ? String(body.source_ref).slice(0, 300) : 'Owner entry',
      },
    });
    return NextResponse.json({ id: created.id, ok: true });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
