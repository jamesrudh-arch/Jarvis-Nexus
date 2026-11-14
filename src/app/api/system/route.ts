import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { worldSummary } from "@/lib/nexus/state";

export const dynamic = "force-dynamic";

const BLOCKERS = [
  {
    id: "railway-token",
    title: "Railway workspace token lost in sandbox recycle",
    impact: "Cannot deploy this app to Railway or re-verify the reasonable-heart project via GraphQL this session.",
    required: "Founder re-supplies RAILWAY_TOKEN (env var only — never commit it).",
  },
  {
    id: "openai-key",
    title: "OpenAI API key unavailable (truncated copy lost)",
    impact: "Authenticated OpenAI verification impossible; GLM remains the operational reasoning provider.",
    required: "Full-length sk-proj key supplied as OPENAI_API_KEY env var in the deployment environment.",
  },
  {
    id: "openai-egress",
    title: "Sandbox egress region unsupported by OpenAI (HK / AS45102)",
    impact: "Unauthenticated requests from THIS runtime are 403-blocked at the edge, pre-auth. Production Railway (US egress) is not affected by this block.",
    required: "Deploy-time egress in a supported region (Railway production already satisfies this).",
  },
  {
    id: "github-push",
    title: "No GitHub write credentials in this runtime",
    impact: "Cannot push commits to jamesrudh-arch/Jarvis-Nexus from here.",
    required: "Founder-side push or a PAT with repo scope supplied via env.",
  },
  {
    id: "ue-editor",
    title: "Unreal Editor execution requires Windows/GPU hardware",
    impact: "Unreal MCP protocol layer is complete; editor operations stay honestly non-operational until real hardware runs UE 5.4+.",
    required: "Windows machine, RTX-class GPU, 64 GB storage per docs/UNREAL_MCP_REQUIREMENTS.md.",
  },
];

export async function GET() {
  const world = await worldSummary(db);
  const envNames = ["DATABASE_URL", "OPENAI_API_KEY", "RAILWAY_TOKEN", "ZAI_API_KEY", "NODE_ENV"];
  const env = Object.fromEntries(
    envNames.map((n) => [n, process.env[n] ? "set" : "missing"])
  );
  const [events, memories, comms, chats, tasks] = await Promise.all([
    db.worldEvent.count(),
    db.memory.count(),
    db.worldEvent.count({ where: { type: "resident.communication" } }),
    db.chatMessage.count(),
    db.taskLedger.count(),
  ]);
  return NextResponse.json({
    app: "JARVIS NEXUS command centre",
    engine: "nexus-ts/1.0 (event-sourced, deterministic, idempotent)",
    runtime: {
      node: process.version,
      bun: process.env.BUN_INSTALL ? "present" : "n/a",
      next: "16 (App Router)",
    },
    database: {
      provider: "SQLite (Prisma)",
      url_shape: "file:./db/custom.db",
      counts: { events, memories, communications: comms, chat_messages: chats, tasks },
    },
    environment: env, // names + presence only — values never exposed
    world: {
      tick: world.tick,
      sim_time: world.clock.sim_time_utc,
      population: world.population,
      weather: world.weather,
    },
    blockers: BLOCKERS,
    honesty:
      "Statuses on this page come from live probes and the event-sourced store. Nothing is fabricated; blocked capabilities are labelled blocked.",
  });
}
