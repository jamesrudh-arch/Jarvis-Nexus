import { NextResponse } from "next/server";
import ledgerDoc from "../../../../registry/ledger.json";

export const dynamic = "force-dynamic";

/**
 * Stage 2 Phase 5 V2 — engineering task ledger, sourced from the repository's
 * registry/ledger.json (product data in git, imported at build time). The
 * legacy write path (POST) is retired: ledger changes happen through the
 * engineering process (commits), not through the UI.
 */

interface LedgerTask {
  taskId: string;
  requirementIds: string[];
  scope: string;
  status: string;
  tests: string[];
  commit?: string;
}

export async function GET() {
  const tasks = (ledgerDoc as { tasks: LedgerTask[] }).tasks.map((t) => ({
    id: t.taskId,
    key: t.taskId,
    title: t.scope,
    state: t.status,
    priority: "P1",
    detail: `requirements: ${t.requirementIds.join(", ") || "—"}${t.commit ? ` · commit ${t.commit}` : ""}`,
    evidence: t.tests.join("; ") || null,
    updatedAt: (ledgerDoc as { generatedAt?: string }).generatedAt ?? "",
  }));
  return NextResponse.json({ tasks, source: "registry/ledger.json" });
}
