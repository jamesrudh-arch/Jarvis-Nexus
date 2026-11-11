import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed } from '@/lib/nexus/worldHub';

export async function GET() {
  try {
    await ensureSeed();
    const rows = await db.scenarioDefinition.findMany();
    return NextResponse.json({
      scenarios: rows.map((s) => ({
        id: s.id, title: s.title, classification: s.classification, summary: s.summary,
        duration_sec: s.durationSec, variables: JSON.parse(s.variablesJson || '[]'),
        branches: JSON.parse(s.branchesJson || '[]'), timeline: JSON.parse(s.timelineJson || '[]'),
        actors_props: JSON.parse(s.actorsPropsJson || '{}'),
        evidence_notes: JSON.parse(s.evidenceNotesJson || '[]'),
      })),
    });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
