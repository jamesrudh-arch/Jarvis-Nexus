/**
 * Appends the V2 engineering-ledger tasks (definitive-directive session)
 * with their verified evidence. Idempotent by task key.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: `file:${process.cwd()}/db/custom.db` } } });

const TASKS = [
  {
    key: "v2-jarvis-identity",
    title: "JARVIS persistent identity subsystem (versioned, provider-independent)",
    state: "VERIFIED",
    priority: "P0",
    detail: "event-sourced profile (jarvis.identity_established) grounding every conversation; survives restarts by construction",
    evidence: "test-v2 D2/D6 PASS (V2_VERIFICATION.txt); /api/jarvis live; chat reports identity v1 + memories used",
  },
  {
    key: "v2-jarvis-presence",
    title: "JARVIS as world resident — Sanctum home + resident entity",
    state: "VERIFIED",
    priority: "P0",
    detail: "she moves/eats/socialises through the same engine as the 24 residents; no salary (operator); wallet 120",
    evidence: "test-v2 D1/D3/D4/D5 PASS; screenshots 02/05/06 (cyan marker, Sanctum interior with her present, profile panel)",
  },
  {
    key: "v2-economy",
    title: "Functional economy — 37 businesses, salaries, purchases, B2B restocks, grants",
    state: "VERIFIED",
    priority: "P0",
    detail: "conservation laws hold from the event log alone; negative outcomes (salary_missed, purchase_skipped) recorded, never hidden",
    evidence: "test-v2 A2–A6 PASS (wallet + till conservation); dashboard live transaction feed incl. B2B restock",
  },
  {
    key: "v2-interiors",
    title: "Building interiors — 52 rooms + 112 objects, enter-building mode",
    state: "VERIFIED",
    priority: "P1",
    detail: "Sanctum/civic hall/food venues/shops enterable in 3D (dollhouse mode); residents placed in semantic rooms; shells labelled honestly",
    evidence: "test-v2 C1–C3 PASS; screenshots 04/05/07; API caught Cyra Ironquill eating indoors at Galedor House · Floor",
  },
  {
    key: "v2-router",
    title: "Multi-model capability router with audit trail",
    state: "VERIFIED",
    priority: "P1",
    detail: "explicit routing decisions (AuditEvent); blocked providers reported as skipped; honest 503 on rate windows — no fabricated replies",
    evidence: "AuditEvent rows in db; live 429 windows this session returned honest errors; register round-4 entry",
  },
  {
    key: "v2-recovery",
    title: "Sandbox-recycle recovery #2 (python stack + piper + bpy)",
    state: "VERIFIED",
    priority: "P0",
    detail: "second recycle destroyed deps again; recovered via documented reproducible process; baseline preserved",
    evidence: "final_regression.sh: 184/184 PASS after recovery",
  },
  {
    key: "v2-deploy",
    title: "Deploy V2 product to Railway production",
    state: "BLOCKED",
    priority: "P0",
    detail: "deploy blocked on Railway workspace token + GitHub push path (destroyed by sandbox recycle) — founder action required",
    evidence: "SOURCE_OF_TRUTH.md §7 blockers; production (founder app) verified HTTP 200, untouched",
  },
];

async function main() {
  let added = 0;
  for (const t of TASKS) {
    const exists = await db.taskLedger.findUnique({ where: { key: t.key } });
    if (exists) continue;
    await db.taskLedger.create({ data: t });
    added += 1;
  }
  const total = await db.taskLedger.count();
  console.log(`ledger: +${added} V2 tasks -> ${total} total`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
