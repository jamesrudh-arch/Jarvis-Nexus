import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/nexus/brain';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';
import { getSwitchMap, requireSwitchOn } from '@/lib/nexus/switchGate';

/**
 * POST /api/v1/asr — speech-to-text (microphone capture).
 * Part 13 enforcement: the Microphone switch must be ON. OFF → 403 before any
 * audio is processed ("No audio capture").
 */
export async function POST(req: NextRequest) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
  try {
    const switchMap = await getSwitchMap();
    const micDenied = requireSwitchOn(switchMap, 'microphone');
    if (micDenied) return micDenied;
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
