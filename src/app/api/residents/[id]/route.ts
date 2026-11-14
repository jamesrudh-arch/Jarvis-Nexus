import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { residentDetail } from "@/lib/nexus/state";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const detail = await residentDetail(db, id);
    if (!detail) return NextResponse.json({ error: "resident not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
