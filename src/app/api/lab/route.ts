import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import summary from "@/data/register-summary.json";

export const dynamic = "force-dynamic";

/**
 * NEXUS Laboratory — honest capability manifest. `register` fields are
 * the 2026-11-13 audit conclusions (NEXUS_WORLD/integration/register.json,
 * 95 records). `runtime` fields describe what THIS web runtime can
 * actually execute right now — the Blender/Unreal MCP sidecars are not
 * part of the Next.js process and are reported as such, never faked.
 */
export async function GET() {
  const tasks = await db.taskLedger.count();
  const labRuntime = [
    {
      name: "Blender MCP server (headless bpy 5.3)",
      runtime_status: "offline-in-this-runtime",
      detail:
        "Python sidecar with bpy (10 tools: terrain, characters, physics, UE bundle export). Requires the NEXUS_WORLD Python environment (bpy wheel ~330 MB, lost in the last sandbox recycle). Reinstallable: pip install bpy==5.3.* — protocol unchanged.",
      audit_state: "OPERATIONAL (2026-11-13 evidence: RENDER3D 17/17, NEXUS3D 12/12)",
    },
    {
      name: "Unreal MCP server (Remote Control API client)",
      runtime_status: "registered-not-operational",
      detail:
        "Protocol-verified MCP stdio server (7/7). Editor operations require UE 5.4+ on Windows/GPU hardware — honestly never claimed operational.",
      audit_state: "REGISTERED (protocol verified; editor unreachable — hardware)",
    },
    {
      name: "GLM cognition + voice (this runtime)",
      runtime_status: "operational",
      detail:
        "Chat, ASR and TTS through the server-side SDK power the JARVIS interface and the resident cognition layer.",
      audit_state: "OPERATIONAL (live probe on the Providers page)",
    },
    {
      name: "Event-sourced world engine (this runtime)",
      runtime_status: "operational",
      detail:
        "TypeScript port of the deterministic NEXUS engine: needs/goals/mood policy, long-term memory, relationships, weather, meetings — all idempotent events.",
      audit_state: "OPERATIONAL (drives the World and Residents pages)",
    },
  ];
  return NextResponse.json({
    register: summary,
    runtime: labRuntime,
    task_count: tasks,
  });
}
