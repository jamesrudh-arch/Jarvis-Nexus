/**
 * STAGE 2.4B / F-2.4A-01 — authentication-lockout defect reproduction probe.
 *
 * Purpose: independently reproduce the Stage 2.4A finding against the tree as
 * it stood (identical to main @ 6a788348 before the fix), and re-run the SAME
 * scenario after the remediation to prove the defect is no longer
 * reproducible.
 *
 * Scenario (mirrors docs/stage2.4a/evidence/authfail-lockout-expiry.json):
 *   1. 60 invalid owner-auth attempts from one client identity -> all 401.
 *   2. 61st attempt with a wrong key -> 429 (lockout activates). Valid key is
 *      also refused (fail-closed by design).
 *   3. Public routes stay available during lockout (never collateral).
 *   4. Wait 70 s (real time; window is 60 s) -> valid key MUST work again.
 *      PRE-FIX expectation: still 429 (the defect: the lockout never expires).
 *      POST-FIX expectation: 200/401-style normal processing returns.
 *   5. A fresh app instance on the same DB (process-restart stand-in) starts
 *      unlocked — demonstrating that recovery historically required a restart.
 *
 * The probe is deliberately time-real for the 70 s wait: this is the exact
 * condition Stage 2.4A measured, reproduced without any clock trickery. The
 * fast deterministic regression suite lives in
 * tests/integration/auth-lockout.test.ts (injectable clock, no sleeps).
 *
 * Usage: bun scripts/stage24b/repro_f24a01.ts [--label pre-fix|post-fix]
 */
import { mkdirSync, rmSync } from "node:fs";
import { createApp } from "@nexus/api";

const label = process.argv.includes("--label")
  ? process.argv[process.argv.indexOf("--label") + 1] ?? "run"
  : "run";

const TMP = `/tmp/stage24b_repro_${Date.now()}`;
const OWNER_KEY = "repro-owner-key-stage24b";
const IP = "10.24.42.10"; // same identity as the Stage 2.4A evidence capture
const env: Record<string, string> = {
  OWNER_KEY,
  NEXUS_BACKUP_INTERVAL_HOURS: "0", // scheduler off: this probe is about auth
  RATE_LIMIT_PER_MIN: "10000", // keep the global limiter out of the way
  AUTH_FAIL_LIMIT_PER_MIN: "60", // the production default, as in 2.4A
};

const mkApp = () => createApp({ dbPath: `${TMP}/nexus.db`, workspaceRoot: `${TMP}/ws`, env });
const req = (app: ReturnType<typeof mkApp>, p: string, init: RequestInit = {}) =>
  app.app.request(new Request(`http://repro.test${p}`, init));

const H = { "X-Forwarded-For": IP };
const wrong = { ...H, Authorization: "Bearer wrong-key" };
const valid = { ...H, Authorization: `Bearer ${OWNER_KEY}` };

const out: Record<string, unknown> = {
  probe: "F-2.4A-01 reproduction",
  label,
  startedAt: new Date().toISOString(),
  identity: IP,
  authFailLimit: 60,
  windowMs: 60_000,
  waitMs: 70_000,
};

mkdirSync(TMP, { recursive: true });
const app = mkApp();

// 1. sixty invalid attempts
let first60All401 = true;
for (let i = 0; i < 60; i++) {
  const r = await req(app, "/mcp/audit", { headers: wrong });
  if (r.status !== 401) { first60All401 = false; out.unexpectedAt = i + 1; out.unexpectedStatus = r.status; break; }
}
out.first60All401 = first60All401;

// 2. lockout activation
out.attempt61WrongKey = (await req(app, "/mcp/audit", { headers: wrong })).status;
out.validKeyWhileLocked = (await req(app, "/mcp/audit", { headers: valid })).status;
out.publicHealthWhileLocked = (await req(app, "/health", { headers: H })).status;
out.retryAfterWhileLocked = Number((await req(app, "/mcp/audit", { headers: valid })).headers.get("Retry-After") ?? 0);

// 3. the real 70 s wait — window is 60 s; a correct implementation MUST have
//    released the lockout by now. (Real time on purpose; see header comment.)
const t0 = Date.now();
await new Promise((r) => setTimeout(r, 70_000));
out.waitedMs = Date.now() - t0;
out.after70sValidKey = (await req(app, "/mcp/audit", { headers: valid })).status;
out.after70sWrongKey = (await req(app, "/mcp/audit", { headers: wrong })).status;
out.after70sPublicHealth = (await req(app, "/health", { headers: H })).status;

// 4. fresh instance on the same DB = restart stand-in
const app2 = mkApp();
out.freshInstanceValidKey = (await req(app2, "/mcp/audit", { headers: valid })).status;
app2.stopBackupScheduler();
app2.db.close();

app.stopBackupScheduler();
app.db.close();
rmSync(TMP, { recursive: true, force: true });

out.finishedAt = new Date().toISOString();
out.verdict = out.after70sValidKey === 429
  ? "DEFECT REPRODUCED: valid credential still refused (429) after the 60 s window + 10 s margin"
  : "DEFECT NOT REPRODUCED: valid credential accepted after window expiry";

console.log(JSON.stringify(out, null, 2));
process.exit(0);
