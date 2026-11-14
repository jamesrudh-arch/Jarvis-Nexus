import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST { text, voice? } — real TTS via z-ai-web-dev-sdk; returns base64 audio. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? "").slice(0, 2000);
    if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const result = (await Promise.race([
      zai.audio.tts.create({ input: text, response_format: "mp3" }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("tts timeout")), 30000)),
    ])) as { audio?: string; data?: string };
    const audio = result.audio ?? result.data;
    if (!audio) throw new Error("no audio in response");
    return NextResponse.json({ audio_base64: audio, format: "mp3" });
  } catch (e) {
    return NextResponse.json({ error: `tts unavailable: ${(e as Error).message}` }, { status: 503 });
  }
}
