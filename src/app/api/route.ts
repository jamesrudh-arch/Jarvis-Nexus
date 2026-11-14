import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Service identity for the visual application's API surface. */
export async function GET() {
  return NextResponse.json({
    service: "JARVIS NEXUS Visual Application",
    role: "thin adapter over the authoritative NEXUS API (single source of truth)",
    endpoints: ["/api/world", "/api/layout", "/api/residents", "/api/chat", "/api/jarvis", "/api/tasks", "/api/providers", "/api/system", "/api/lab", "/api/voice/tts", "/api/voice/asr"],
  });
}
