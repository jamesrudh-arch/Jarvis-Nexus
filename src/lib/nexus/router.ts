/**
 * Multi-model orchestration router (PART III §9) — capability-aware
 * provider selection with honest failover semantics.
 *
 * In this sandbox exactly one provider is operational per category
 * (GLM/zai SDK — verified live; OpenAI is edge-blocked from this egress,
 * documented). The router makes that choice EXPLICIT and auditable:
 * every routing decision is written to the AuditEvent table, and a
 * provider is never labelled operational unless its endpoint was tested.
 *
 * Failover policy (honest — no silent substitution with a lesser model):
 * if the chosen provider fails (rate window, timeout, network), the
 * request fails with a clear error. Downgrading to a pretend answer is
 * never an option. When more providers become available (keys re-supplied
 * in the deployment environment), registering them here extends routing
 * without touching the callers.
 */
import type { PrismaClient } from "@prisma/client";

export type Category = "reasoning" | "vision" | "stt" | "tts";

export interface ProviderCandidate {
  name: string;
  adapter: "zai-sdk";
  note: string;
}

/** Capability registry — candidates in priority order per category. */
export const CAPABILITY_REGISTRY: Record<Category, ProviderCandidate[]> = {
  reasoning: [
    { name: "glm", adapter: "zai-sdk", note: "operational — live probes verified (chat, cognition, this runtime)" },
    { name: "openai", adapter: "zai-sdk", note: "BLOCKED from this egress (HK/Alibaba, pre-auth 403) — registered, not selectable until keys + supported egress exist" },
  ],
  vision: [
    { name: "glm-4v", adapter: "zai-sdk", note: "operational — multimodal image input via zai SDK (reference-image study)" },
  ],
  stt: [
    { name: "zai-asr", adapter: "zai-sdk", note: "operational — /api/voice/asr" },
  ],
  tts: [
    { name: "zai-tts", adapter: "zai-sdk", note: "operational — /api/voice/tts; piper exists as a local Python-side voice for the lab" },
  ],
};

export interface RoutingDecision {
  category: Category;
  chosen: string;
  candidates: ProviderCandidate[];
  skipped: Array<{ name: string; reason: string }>;
}

/**
 * Select the provider for a category. Unavailable/unverified candidates are
 * reported as skipped with reasons — never silently chosen.
 */
export function route(category: Category): RoutingDecision {
  const candidates = CAPABILITY_REGISTRY[category];
  const skipped: Array<{ name: string; reason: string }> = [];
  let chosen = "none";
  for (const c of candidates) {
    if (c.note.startsWith("BLOCKED") || c.note.startsWith("UNTESTED")) {
      skipped.push({ name: c.name, reason: c.note });
      continue;
    }
    chosen = c.name; // first selectable candidate wins (priority order)
    break;
  }
  return { category, chosen, candidates, skipped };
}

/** Persist a routing decision to the audit log (never contains payloads). */
export async function recordRouting(
  db: PrismaClient,
  category: Category,
  provider: string,
  outcome: "selected" | "ok" | "failed",
  detail: string
): Promise<void> {
  await db.auditEvent
    .create({
      data: {
        kind: "provider",
        detail: `route:${category}→${provider} [${outcome}] ${detail}`.slice(0, 500),
      },
    })
    .catch(() => {
      /* auditing must never break the request path */
    });
}
