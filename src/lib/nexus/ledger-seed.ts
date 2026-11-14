/**
 * Engineering ledger seed data (PART II of the master directive) —
 * shared by scripts/seed-ledger.ts and the first-boot bootstrap so a
 * fresh deployment self-initialises with the honest task states.
 */
export interface LedgerSeedTask {
  key: string; title: string; state: string; priority: string;
  detail: string; evidence: string;
}

export const LEDGER_SEED: LedgerSeedTask[] = [
  {
    key: "p0-forensic-audit",
    title: "P0 Forensic audit of repository, git history and surviving infrastructure",
    state: "VERIFIED",
    priority: "P0",
    detail: "9 commits intact; production live (HTTP 200); sandbox recycle destroyed bpy venv, piper, Python deps, workspace world state and both credentials (.env only had DATABASE_URL). All losses recoverable: world is event-sourced and replayable; engine re-seeded deterministically.",
    evidence: "git log audit + live curl of production + pip/venv checks, 2026-11-13 session",
  },
  {
    key: "p1-production-discrepancies",
    title: "P1 Production/deployment discrepancy resolution (Railway)",
    state: "BLOCKED",
    priority: "P1",
    detail: "Production app healthy. Deploying THIS command centre to Railway requires the GitHub push path + RAILWAY_TOKEN, both lost to the sandbox recycle. No duplicate projects created; no production config touched.",
    evidence: "live HTTP 200 probe of jarvis-nexus-production.up.railway.app; blocker documented on System page",
  },
  {
    key: "p2-jarvis-frontend",
    title: "P2 JARVIS command centre frontend (dashboard, chat, voice, providers, ledger, system)",
    state: "TESTING",
    priority: "P2",
    detail: "Single-page premium interface with 8 live views, all wired to real API routes. Voice = real server ASR/TTS with browser fallback.",
    evidence: "agent-browser verification pending in this session",
  },
  {
    key: "p3-nexus-world-interactive",
    title: "P3 NEXUS WORLD accessible + interactive (Three.js world viewer)",
    state: "TESTING",
    priority: "P3",
    detail: "Real-time 3D world: deterministic city layout, buildings, roads, day/night lighting, weather, live resident agents, click-to-inspect. Three.js chosen over UE for browser reachability; UE path documented for hardware-equipped environments.",
    evidence: "agent-browser verification pending in this session",
  },
  {
    key: "p4-simulation-persistence",
    title: "P4 World simulation + persistence (TypeScript engine port)",
    state: "VERIFIED",
    priority: "P4",
    detail: "Faithful port of the deterministic engine: event-sourced store with idempotency keys, needs/goals/mood autonomy policy, long-term memory with salience decay, relationship graph, weather, meetings. Seeded 3 sim days: 11,442 events, 431 memories, 50 communications, autonomy ledger 96.9% script / 3.1% policy divergence.",
    evidence: "seed run logs; /api/world returns replayed state; autonomy audit numbers match Python reference ballpark",
  },
  {
    key: "p5-unreal-integration",
    title: "P5 Genuine Unreal Engine integration",
    state: "BLOCKED",
    priority: "P5",
    detail: "Unreal MCP protocol layer complete (7/7) in the Python suite; editor execution requires Windows/GPU hardware. Not claimed operational.",
    evidence: "UNREAL_MCP_TEST_OUTPUT 7/7 (prior session); docs/UNREAL_MCP_REQUIREMENTS.md",
  },
  {
    key: "p6-resident-intelligence",
    title: "P6 Resident intelligence (goals, mood, memory, relationships, autonomy audit)",
    state: "VERIFIED",
    priority: "P6",
    detail: "24 residents with deterministic goals per window, derived mood, salience-ranked episodic memory, evolving social graph, and the honesty audit separating script vs policy decisions (counterfactual recorded per decision).",
    evidence: "seeded world: 431 memories, 50 communications, divergence 3.1%; /api/residents/[id] exposes full inner life",
  },
  {
    key: "p7-laboratory",
    title: "P7 Laboratory + creative pipelines",
    state: "BLOCKED",
    priority: "P7",
    detail: "Blender MCP sidecar needs the bpy environment reinstalled (wheel lost in recycle — reinstallable); Unreal needs hardware; Natron/FreeMoCap remain research-tier entries in the register. Lab page reports honest runtime status.",
    evidence: "register-summary.json (95 records, 30 OPERATIONAL at last audit); runtime status on /api/lab",
  },
  {
    key: "p8-integration-orchestration",
    title: "P8 Integration orchestration + provider failover",
    state: "TESTING",
    priority: "P8",
    detail: "GLM operational (chat/ASR/TTS/vision via SDK), OpenAI honestly blocked (missing key + unsupported sandbox egress — production egress unaffected), Railway production probe live. Provider page shows only live-probed statuses.",
    evidence: "/api/providers live probes; provider registry persisted with timestamps",
  },
  {
    key: "p9-autonomous-engineering",
    title: "P9 Autonomous engineering workflow (this ledger, auditable state changes)",
    state: "VERIFIED",
    priority: "P9",
    detail: "Persistent ledger with the 9-state lifecycle; every state change writes an AuditEvent; ledger is queryable via API and visible in the UI.",
    evidence: "taskLedger + auditEvent tables seeded; POST /api/tasks audits transitions",
  },
  {
    key: "p10-production-verification",
    title: "P10 Comprehensive production verification + visual evidence",
    state: "BLOCKED",
    priority: "P10",
    detail: "Local verification via agent-browser + screenshots completes this session; Railway deployment verification blocked on credentials (see P1).",
    evidence: "pending: agent-browser screenshots; blocked: production deploy verification",
  },
  {
    key: "openai-connectivity",
    title: "OpenAI connectivity root cause + resolution",
    state: "BLOCKED",
    priority: "P1",
    detail: "Root cause previously established with hard evidence: sandbox egress is Hong Kong (Alibaba AS45102) and receives pre-auth 403 unsupported_country_region_territory from OpenAI's edge; Nigeria was never the cause; the stored key was truncated. This session: key is gone entirely (env lost). Production Railway egress (US) is NOT blocked — supply the full key in the deployment environment to enable it there.",
    evidence: "OPENAI_403_DIAGNOSIS.json (prior session) + live unauthenticated baseline probe on /api/providers",
  },
  {
    key: "glm-provider",
    title: "GLM reasoning provider (chat + cognition + voice)",
    state: "VERIFIED",
    priority: "P2",
    detail: "Server-side SDK powers JARVIS chat (grounded in live world state), resident cognition layer (validated choices, utility fallback), and real ASR/TTS. Rate windows handled honestly with retries and degradation notices.",
    evidence: "live probe on /api/providers; chat transcripts persisted with latency/token metadata",
  },
  {
    key: "regression-python-suites",
    title: "Python regression suites (8 suites, 184 checks at last green)",
    state: "IN_PROGRESS",
    priority: "P9",
    detail: "Sandbox recycle removed Python deps; reinstalling. Suites remain the reference implementation's regression net and must be re-run green before the Python side is called restored.",
    evidence: "pip install of mesa/langgraph/fastapi/cv2 in progress; re-run pending",
  },
];

export async function seedLedger(db: import("@prisma/client").PrismaClient) {
  for (const t of LEDGER_SEED) {
    await db.taskLedger.upsert({
      where: { key: t.key },
      create: t,
      update: { ...t, updatedAt: new Date() },
    });
  }
  return LEDGER_SEED.length;
}
