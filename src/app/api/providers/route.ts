import { NextResponse } from "next/server";
import { backend, BackendError, type Envelope } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Stage 2 Phase 5 V2 — provider status from the AUTHORITATIVE backend model
 * fabric (GET /models/health with its honest configured/verified semantics,
 * plus catalog and provider list). POST (owner, server-side key) runs the
 * live verification round-trips on the backend (POST /models/verify).
 */

interface ProviderStatus {
  provider: string; configured: boolean; models: number;
  totalCalls: number; totalFailures: number; lastError: string | null;
  verified: boolean | null; lastVerifiedAt: string | null;
}
interface ModelDescriptor { id: string; provider: string; model: string }

export async function GET() {
  try {
    const [health, providers, catalog] = await Promise.all([
      backend.get<{ data: unknown[]; providers: ProviderStatus[]; semantics: string }>("/models/health"),
      backend.get<Envelope<string[]>>("/models/providers"),
      backend.get<Envelope<ModelDescriptor[]>>("/models/catalog"),
    ]);
    return NextResponse.json({
      providers: providers.data,
      provider_status: health.providers,
      per_model: health.data,
      catalog_size: catalog.data.length,
      semantics: health.semantics,
      honesty: "configured ≠ verified. Run verification (POST) for live round-trip evidence.",
    });
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

export async function POST() {
  try {
    const r = await backend.post<Envelope<Array<{ provider: string; verified: boolean; detail: string; latencyMs: number }>>>(
      "/models/verify", {}, { owner: true },
    );
    return NextResponse.json({ verification: r.data, source: "nexus-api live round-trips" });
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
