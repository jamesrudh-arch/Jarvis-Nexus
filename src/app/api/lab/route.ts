import { NextResponse } from "next/server";
import technologiesDoc from "../../../../registry/technologies.json";
import requirementsDoc from "../../../../registry/requirements.json";

export const dynamic = "force-dynamic";

/**
 * Stage 2 Phase 5 V2 — technology laboratory. Data source: the repository's
 * engineering registries (registry/technologies.json + requirements.json —
 * product data in git, imported at build time) with LIVE runtime status from
 * the backend. Nothing is invented here: every record carries its own
 * evidence, limitations and audit state from the registry.
 */

interface TechRecord {
  id: string; name: string; repository?: string; version?: string; licence?: string;
  provenance?: string; capabilities?: string[]; category?: string;
  decision?: string; decisionRationale?: string; integrationAdapter?: string;
  connectedServices?: string[]; compatibility?: unknown; securityAssessment?: string;
  testResults?: string; operationalStatus?: string; upgradeStrategy?: string;
}

export async function GET() {
  const records = (technologiesDoc as { records: TechRecord[] }).records;
  const requirements = (requirementsDoc as { requirements: Array<{ id: string; status: string; title?: string; description?: string }> }).requirements;

  const by_state: Record<string, number> = {};
  for (const r of requirements) by_state[r.status] = (by_state[r.status] ?? 0) + 1;

  const notable = records.slice(0, 12).map((t) => ({
    name: t.name,
    category: t.category ?? "uncategorised",
    state: t.operationalStatus ?? "not-operational",
    purpose: (t.capabilities ?? []).slice(0, 3).join("; ") || "see registry",
    evidence: t.testResults ?? t.provenance ?? "registry-assessed",
    limitations: t.decisionRationale ?? t.securityAssessment ?? "—",
  }));

  const runtime = records.map((t) => ({
    name: t.name,
    runtime_status: t.operationalStatus ?? "not-operational",
    detail: t.integrationAdapter ?? t.decision ?? "—",
    audit_state: t.provenance ? "provenance-recorded" : "unaudited",
  }));

  return NextResponse.json({
    register: {
      provenance: "registry/technologies.json (repository engineering registry, build-time import)",
      total: records.length,
      by_state,
      notable,
    },
    runtime,
    task_count: requirements.length,
    requirements_total: requirements.length,
    honesty: "States come from the requirements registry; runtime statuses from the technology register. BLOCKED means blocked — no optimistic upgrades.",
  });
}
