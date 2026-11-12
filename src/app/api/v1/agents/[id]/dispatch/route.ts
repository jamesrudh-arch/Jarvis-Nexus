import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed } from '@/lib/nexus/worldHub';
import { runLlm } from '@/lib/nexus/providers/registry';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await ensureSeed();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const objective = String(body.objective || 'Execute live sanctuary integrity and parameter verification.');
    const agent = await db.specialistAgent.findUnique({ where: { id } });
    if (!agent) return NextResponse.json({ detail: 'Agent not found.' }, { status: 404 });

    const switches = await db.ownerSwitch.findMany();
    const autonomy = switches.find((s) => s.switchKey === 'autonomy')?.enabled ?? false;
    if (!autonomy) {
      return NextResponse.json(
        { detail: 'Authorised Autonomy switch is OFF. Specialist dispatch requires owner authorisation.' },
        { status: 403 }
      );
    }

    await db.specialistAgent.update({ where: { id }, data: { status: 'running', currentTask: objective } });

    // Real bounded analysis via the NEXUS inference route (no fabricated outputs)
    let output = '';
    try {
      const outcome = await runLlm({
        messages: [
          {
            role: 'assistant',
            content: `You are the ${agent.name} specialist agent inside JARVIS NEXUS. ${agent.roleSummary} Permission boundary: ${agent.permissionBoundary}. Answer in 2-3 sentences, technical, factual, no filler. If the data is unavailable to you, say so plainly.`,
          },
          { role: 'user', content: objective },
        ],
      });
      output = outcome?.content || '';
    } catch {
      output = 'Inference route unavailable for this dispatch — reporting honestly rather than fabricating a result.';
    }

    await db.specialistAgent.update({
      where: { id },
      data: { status: 'idle', currentTask: null, lastOutput: output.slice(0, 1200) },
    });
    return NextResponse.json({ status: 'completed', output: output.slice(0, 1200) });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
