import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { residentsList } from "@/lib/nexus/state";
import { ensureBootstrapped } from "@/lib/nexus/boot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureBootstrapped(db);
    return NextResponse.json({ residents: await residentsList(db) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
