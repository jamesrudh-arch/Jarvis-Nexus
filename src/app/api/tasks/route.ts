import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID_STATES = new Set([
  "PLANNED", "IN_PROGRESS", "IMPLEMENTED", "INTEGRATION_PENDING", "TESTING",
  "VERIFIED", "DEPLOYED", "BLOCKED", "FAILED",
]);

export async function GET() {
  const tasks = await db.taskLedger.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ tasks });
}

/** POST { key, state, evidence?, detail? } — ledger updates are auditable. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const key = String(body.key ?? "");
    const state = String(body.state ?? "");
    if (!key || !VALID_STATES.has(state)) {
      return NextResponse.json({ error: "key + valid state required" }, { status: 400 });
    }
    const existing = await db.taskLedger.findUnique({ where: { key } });
    if (!existing) return NextResponse.json({ error: "task not found" }, { status: 404 });
    const updated = await db.taskLedger.update({
      where: { key },
      data: {
        state,
        evidence: body.evidence ? String(body.evidence).slice(0, 2000) : existing.evidence,
        detail: body.detail ? String(body.detail).slice(0, 2000) : existing.detail,
      },
    });
    await db.auditEvent.create({
      data: {
        kind: "ops",
        detail: `task ${key} state ${existing.state} → ${state}`,
      },
    });
    return NextResponse.json({ task: updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
