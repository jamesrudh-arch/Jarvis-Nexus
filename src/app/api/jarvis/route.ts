import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWorldContext } from "@/lib/nexus/state";
import { ensureBootstrapped } from "@/lib/nexus/boot";
import { ensureIdentity, getIdentity, type JarvisIdentity } from "@/lib/nexus/identity";
import { findJarvis } from "@/lib/nexus/jarvis";
import { LongTermMemory } from "@/lib/nexus/memory";

export const dynamic = "force-dynamic";

/**
 * GET — JARVIS's persistent profile: versioned identity (from the event
 * log), her live resident state in the world (action/location/room/wallet),
 * salience-ranked memories, relationships and conversation count.
 */
export async function GET() {
  try {
    await ensureBootstrapped(db);
    const { store, layout, tick } = await getWorldContext(db);
    const identity = (await getIdentity(store)) ?? (await ensureIdentity(store, tick));
    const jarvis = await findJarvis(store);
    if (!jarvis) {
      return NextResponse.json({ error: "JARVIS presence not established" }, { status: 503 });
    }
    const ltm = new LongTermMemory(store);
    const mems = await ltm.memories(jarvis.resident_id, tick, 8);
    const rels = await ltm.relationships(tick);
    const conversations = await db.chatMessage.count();
    return NextResponse.json({
      identity: identity as JarvisIdentity,
      presence: {
        resident_id: jarvis.resident_id,
        action: jarvis.action,
        at_building: jarvis.at_building,
        at_building_name: layout.buildingName(jarvis.at_building),
        room: jarvis.room_id ? (layout.room(jarvis.room_id)?.name ?? null) : null,
        home: layout.buildingName(jarvis.home_id),
        work: layout.buildingName(jarvis.work_id),
        venue: layout.buildingName(jarvis.venue_id),
        wallet: jarvis.wallet ?? null,
        pos: jarvis.pos,
        needs: jarvis.needs,
      },
      memories: mems,
      relationships: (rels[jarvis.resident_id] ?? []).slice(0, 10),
      conversations,
      autobiography: await ltm.autobiography(
        jarvis.resident_id,
        jarvis as unknown as Record<string, unknown>,
        tick
      ),
      seed_note: `identity survives restarts and provider changes — stored in the world event log (jarvis.identity_established, v${identity.version})`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
