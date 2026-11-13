import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/nexus/brain';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

export async function POST(req: NextRequest) {
  const denied = requireOwnerKey(req);
  if (denied) return denied;
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
