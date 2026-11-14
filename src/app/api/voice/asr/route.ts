import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST { audio_base64 } — real ASR via z-ai-web-dev-sdk (server side). */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const audio = String(body.audio_base64 ?? "");
    if (!audio) return NextResponse.json({ error: "audio_base64 required" }, { status: 400 });
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const result = (await Promise.race([
      zai.audio.asr.create({ file_base64: audio }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("asr timeout")), 30000)),
    ])) as { text?: string };
    return NextResponse.json({ text: result.text ?? "" });
  } catch (e) {
    return NextResponse.json({ error: `asr unavailable: ${(e as Error).message}` }, { status: 503 });
  }
}
