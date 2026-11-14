/**
 * migrate-cli — applies pending migrations to the database at NEXUS_DB_PATH.
 * Usage: bun packages/db/src/migrate-cli.ts  (repo script: bun run migrate)
 */
import { NexusDb, migrate, migrationStatus } from "./index";

const path = process.env.NEXUS_DB_PATH ?? ":memory:";
const db = NexusDb.open(path);
const report = migrate(db);
console.log(JSON.stringify({
  path,
  applied: report.applied,
  skipped: report.skipped,
  status: migrationStatus(db),
}, null, 2));
db.close();
