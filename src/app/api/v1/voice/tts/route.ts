import { NextResponse } from 'next/server';
import { synthesizeVoice } from '@/lib/nexus/brain';

/**
 * POST /api/v1/voice/tts
 * Lightweight narration synthesis for scenario timeline cues (no full brain
 * round-trip — just her voice). Body: { text: string, emotion?: string }
 * Returns { audio: string(base64 wav), mime: string } or {} when synthesis
 * is unavailable (the client falls back to browser speech).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text : '';
    if (!text.trim()) {
      return NextResponse.json({ detail: 'text is required' }, { status: 400 });
    }
    const emotion = typeof body?.emotion === 'string' ? body.emotion : 'neutral';
    const voice = await synthesizeVoice(text.slice(0, 600), emotion);
    return NextResponse.json(voice ?? {});
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
