import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/nexus/brain';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const audioBase64 = String(body.audio_base64 || '');
    if (!audioBase64) {
      return NextResponse.json({ detail: 'No audio provided.' }, { status: 400 });
    }
    const text = await transcribeAudio(audioBase64);
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
