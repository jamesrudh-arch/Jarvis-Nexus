import { NextResponse } from "next/server";
import { backend, BackendError, type Envelope } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Stage 2 Phase 5 V2 — JARVIS conversation through the AUTHORITATIVE backend
 * orchestrator (POST /jarvis/objectives, owner-authenticated server-side).
 * The orchestrator interprets, reasons with live context, plans, executes
 * tools (memory, world, MCP) and evaluates — its summary is the reply.
 * Chat history is derived from the backend task repository (single source).
 */

interface BackendJarvisTask {
  id: string;
  objective: string;
  origin: string;
  state: string;
  interpretation?: { intent: string; constraints: string[]; successCriteria: string[] };
  plan?: Array<{ stepId: string; description: string }>;
  stepResults?: Array<{ stepId: string; status: string }>;
  evaluation?: { objectiveMet: boolean; summary: string; unmetCriteria: string[] };
  createdAt: string;
  updatedAt: string;
}

function replyOf(task: BackendJarvisTask): string {
  if (task.evaluation?.summary) return task.evaluation.summary;
  // honest state reporting — never a fabricated success
  const done = (task.stepResults ?? []).filter((s) => s.status === "COMPLETED").length;
  const total = (task.stepResults ?? task.plan ?? []).length;
  return `[orchestrator] task ${task.state.toLowerCase()} — ${done}/${total} steps completed (see JARVIS view for the full trace).`;
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body.message ?? "").slice(0, 4000);
    if (!message.trim()) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    const r = await backend.post<Envelope<{ data?: BackendJarvisTask } & Record<string, unknown>>>(
      "/jarvis/objectives", { objective: message, origin: "user" }, { owner: true },
    );
    // the API returns { data: run, error? } at the top level for objectives
    const run = (r.data ?? r) as unknown as { data?: BackendJarvisTask; id?: string; state?: string };
    const task = (run.data ?? run) as BackendJarvisTask;
    return NextResponse.json({
      reply: replyOf(task),
      provider: "nexus-orchestrator",
      model: "backend-fabric",
      latency_ms: Date.now() - started,
      tokens: null,
      grounded: true,
      task_id: task.id,
      state: task.state,
      objective_met: task.evaluation?.objectiveMet ?? null,
    });
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message, grounded: false }, { status });
  }
}

export async function GET() {
  try {
    const r = await backend.get<Envelope<BackendJarvisTask[]>>("/jarvis/tasks");
    const messages = r.data
      .filter((t) => t.origin === "user")
      .slice(-40)
      .flatMap((t) => [
        { id: `${t.id}-q`, role: "user", content: t.objective, createdAt: t.createdAt },
        { id: `${t.id}-a`, role: "assistant", content: replyOf(t), provider: "nexus-orchestrator", createdAt: t.updatedAt },
      ]);
    return NextResponse.json({ messages, source: "nexus-api task repository" });
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

export async function DELETE() {
  // History lives in the authoritative backend store — this surface does not
  // delete it. Honest no-op with explanation (the UI clears its local view).
  return NextResponse.json({ cleared: false, note: "conversation history is persisted in the backend JARVIS task repository (single source of truth)" });
}
