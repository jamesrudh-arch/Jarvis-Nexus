/**
 * Seed the engineering task ledger from the shared module.
 * Run: bunx tsx scripts/seed-ledger.ts
 */
import { PrismaClient } from "@prisma/client";
import { join } from "path";
import { seedLedger, LEDGER_SEED } from "../src/lib/nexus/ledger-seed";

const db = new PrismaClient({
  datasources: { db: { url: `file:${join(process.cwd(), "db", "custom.db")}` } },
});

async function main() {
  const n = await seedLedger(db);
  console.log(`ledger seeded: ${n}/${LEDGER_SEED.length} tasks`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
