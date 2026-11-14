import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Stage 2 — server-side ASR slot. Provider-independent voice input (STT)
 * lands in Phase 7; until then this endpoint fails HONESTLY (503) and the
 * client uses the browser's SpeechRecognition (Web Speech API — supported on
 * iOS Safari) where available.
 */
export async function POST(req: Request) {
  let bytes = 0;
  try {
    const buf = await req.arrayBuffer();
    bytes = buf.byteLength;
  } catch { /* body optional */ }
  return NextResponse.json(
    {
      error: "server ASR provider not configured (Phase 7 voice architecture pending)",
      fallback: "browser SpeechRecognition (Web Speech API)",
      received_bytes: bytes,
    },
    { status: 503 },
  );
}
