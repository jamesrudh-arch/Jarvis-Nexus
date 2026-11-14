import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ProbeResult {
  name: string;
  kind: string;
  status: "operational" | "degraded" | "blocked" | "unverified" | "offline";
  detail: string;
  latency_ms: number | null;
  evidence: string;
}

async function timedFetch(url: string, init?: RequestInit, timeoutMs = 10000) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "jarvis-nexus/2.0", ...(init?.headers ?? {}) },
    });
    const body = await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, latency: Date.now() - t0, body: body.slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, latency: Date.now() - t0, body: (e as Error).message };
  }
}

/** Live, honest provider probes. No fabricated statuses. */
export async function GET() {
  const probes: ProbeResult[] = [];

  // 1) GLM via z-ai SDK — a real tiny completion
  const glmT0 = Date.now();
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [{ role: "user", content: "Reply with the single word: ALIVE" }],
        thinking: { type: "disabled" },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000)),
    ])) as { choices?: Array<{ message?: { content?: string } }> };
    const text = completion.choices?.[0]?.message?.content ?? "";
    probes.push({
      name: "GLM (z-ai-sdk)",
      kind: "reasoning",
      status: /ALIVE/i.test(text) ? "operational" : "degraded",
      detail: text ? `probe replied: ${text.slice(0, 60)}` : "empty reply",
      latency_ms: Date.now() - glmT0,
      evidence: "live chat completion via server SDK",
    });
  } catch (e) {
    probes.push({
      name: "GLM (z-ai-sdk)",
      kind: "reasoning",
      status: "degraded",
      detail: `probe failed: ${(e as Error).message} (rate windows are real — retries respected)`,
      latency_ms: Date.now() - glmT0,
      evidence: "live probe, honest failure",
    });
  }

  // 2) OpenAI — unauthenticated baseline (network-level evidence)
  const oai = await timedFetch("https://api.openai.com/v1/models", { method: "GET" });
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  const geoBlocked = oai.status === 403 && /unsupported_country/i.test(oai.body);
  probes.push({
    name: "OpenAI",
    kind: "reasoning",
    status: geoBlocked ? "blocked" : hasKey ? "unverified" : "blocked",
    detail: hasKey
      ? `key present; unauthenticated baseline HTTP ${oai.status}`
      : `no key in environment; unauthenticated baseline HTTP ${oai.status} ${
          geoBlocked ? "— pre-auth edge geo-block (egress region unsupported)" : ""
        }`,
    latency_ms: oai.latency,
    evidence: `GET api.openai.com/v1/models → ${oai.status}${geoBlocked ? " unsupported_country_region_territory" : ""}`,
  });

  // 3) Railway production (public health endpoint — no credentials needed)
  const prod = await timedFetch("https://jarvis-nexus-production.up.railway.app/", { method: "GET" }, 15000);
  probes.push({
    name: "Railway production",
    kind: "infra",
    status: prod.ok ? "operational" : "degraded",
    detail: `jarvis-nexus-production.up.railway.app → HTTP ${prod.status}`,
    latency_ms: prod.latency,
    evidence: "public HTTP probe",
  });

  // 4) Egress route (what the outside world sees of THIS runtime)
  const eg = await timedFetch("https://ipinfo.io/json", { method: "GET" }, 8000);
  let egress: Record<string, unknown> = { note: "geolocation probe failed" };
  try {
    egress = JSON.parse(eg.body);
  } catch {
    /* keep fallback */
  }

  // persist honest statuses
  for (const p of probes) {
    await db.providerStatus.upsert({
      where: { name: p.name },
      create: {
        name: p.name, kind: p.kind, status: p.status, detail: p.detail,
        lastCheckedAt: new Date(), latencyMs: p.latency_ms,
      },
      update: {
        kind: p.kind, status: p.status, detail: p.detail,
        lastCheckedAt: new Date(), latencyMs: p.latency_ms,
      },
    });
  }

  const registry = await db.providerStatus.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({
    probes,
    egress: {
      ip: (egress as Record<string, string>).ip ?? null,
      city: (egress as Record<string, string>).city ?? null,
      country: (egress as Record<string, string>).country ?? null,
      org: (egress as Record<string, string>).org ?? null,
      note: "server-side egress geolocation (what OpenAI et al. actually see)",
    },
    persisted: registry,
  });
}
