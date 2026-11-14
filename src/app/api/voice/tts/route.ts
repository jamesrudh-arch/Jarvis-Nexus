import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Stage 2 — server-side TTS slot. The legacy z-ai-web-dev-sdk adapter is not
 * available in this runtime (module absent); the provider-independent voice
 * architecture lands in Phase 7. Until then this endpoint fails HONESTLY
 * (503) and the client falls back to the browser's speechSynthesis engine
 * (Web Speech API — supported on iOS Safari for on-device TTS).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").slice(0, 2000);
  if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  return NextResponse.json(
    {
      error: "server TTS provider not configured (Phase 7 voice architecture pending)",
      fallback: "browser speechSynthesis (Web Speech API)",
    },
    { status: 503 },
  );
}
