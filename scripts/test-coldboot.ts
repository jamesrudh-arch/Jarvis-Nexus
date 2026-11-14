/** Cold-boot proof: fresh DB file → ensureBootstrapped → full world. */
import { PrismaClient } from "@prisma/client";
import { rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { ensureBootstrapped } from "../src/lib/nexus/boot";
import { worldSummary } from "../src/lib/nexus/state";

async function main() {
  rmSync("db/coldboot-test.db", { force: true });
  execSync("bunx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: `file:${process.cwd()}/db/coldboot-test.db` },
    stdio: "pipe",
  });
  const db = new PrismaClient({
    datasources: { db: { url: `file:${process.cwd()}/db/coldboot-test.db` } },
  });
  const t0 = Date.now();
  await ensureBootstrapped(db);
  const w = await worldSummary(db);
  console.log(
    `cold-boot: tick ${w.tick}, pop ${w.population}, events ${w.events}, ` +
      `memories ${w.memories}, comms ${w.communications}, ` +
      `weather ${w.weather}, local ${w.clock.local_time} (${((Date.now() - t0) / 1000).toFixed(1)}s)`
  );
  console.log(
    `economy: ${w.economy?.businesses} businesses, ${w.economy?.transactions} tx, ` +
      `${w.economy?.salaries_paid} salaries; interiors: ${w.interiors?.rooms} rooms; ` +
      `jarvis: ${w.jarvis?.action} at ${w.jarvis?.at_building}`
  );
  const tasks = await db.taskLedger.count();
  console.log(`ledger tasks: ${tasks}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
