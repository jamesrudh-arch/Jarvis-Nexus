import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { layoutPayload } from "@/lib/nexus/state";
import { ensureBootstrapped } from "@/lib/nexus/boot";

export const dynamic = "force-dynamic";

/** Deterministic city layout (roads + buildings) for the 3D world view. */
export async function GET() {
  try {
    await ensureBootstrapped(db);
    return NextResponse.json(await layoutPayload(db));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
