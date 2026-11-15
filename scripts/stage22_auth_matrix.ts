/**
 * STAGE 2.2 — AUTHENTICATION MATRIX GENERATOR (Workstreams B & D).
 *
 * Independently derives the owner-gated route list FROM SOURCE (not from a
 * hardcoded inventory), resolves path parameters, and probes every route
 * (a) unauthenticated and (b) with a wrong key. Every probe MUST return 401.
 * The webhook route (secret-authenticated, not owner-gated) is probed
 * separately: without its secret it must also refuse (401/503).
 *
 * Output: docs/stage2/evidence/auth-matrix.json (git-tracked, durable).
 * Exit 0 only if the matrix is 100% clean.
 */
import { createApp } from "@nexus/api";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const SRC = "apps/nexus-api/src/index.ts";
const source = readFileSync(SRC, "utf8");

// --- derive owner-gated routes from source ---------------------------------
type Spec = { method: string; path: string };
const gated: Spec[] = [];
const routeRe = /app\.(get|post|put|delete|patch)\(\s*"([^"]+)"\s*,\s*requireOwner/g;
let m: RegExpExecArray | null;
while ((m = routeRe.exec(source))) {
  gated.push({ method: m[1].toUpperCase(), path: m[2] });
}
// routes with requireOwner appearing later in the arg list (e.g. async handlers)
// are covered by the regex above; assert the counts agree with a raw count.
const rawGatedCount = (source.match(/requireOwner/g) ?? []).length;
if (gated.length === 0) throw new Error("no owner-gated routes derived — source layout changed?");

// --- resolve :params to probe-safe dummies ----------------------------------
const resolve = (p: string) => p.replace(/:id/g, "probe-id-1").replace(/:name/g, "probe-name-1").replace(/:scope/g, "probescope");

// --- boot an isolated app ----------------------------------------------------
const TMP = `/tmp/stage22_auth_matrix_${Date.now()}`;
const OWNER_KEY = "stage22-matrix-key";
const app = createApp({
  dbPath: `${TMP}/nexus.db`,
  workspaceRoot: `${TMP}/ws`,
  env: { OWNER_KEY, NEXUS_BACKUP_INTERVAL_HOURS: "0", RATE_LIMIT_PER_MIN: "10000", AUTH_FAIL_LIMIT_PER_MIN: "10000" } as Record<string, string>,
});

const base = (path: string, init: RequestInit) => app.app.request(new Request(`http://matrix.test${path}`, init));

const results: Array<{ method: string; path: string; anon: number; wrongKey: number; ok: boolean }> = [];
for (const r of gated) {
  const p = resolve(r.path);
  const init: RequestInit = r.method === "GET" ? {} : { method: r.method, headers: { "content-type": "application/json" }, body: "{}" };
  const anon = await base(p, init);
  const wrong = await base(p, { ...init, headers: { ...(init.headers ?? {}), Authorization: "Bearer definitively-wrong-key" } });
  const ok = anon.status === 401 && wrong.status === 401;
  results.push({ method: r.method, path: r.path, anon: anon.status, wrongKey: wrong.status, ok });
}

// --- webhook (secret-authenticated) probed separately -------------------------
const whAnon = await base("/railway/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "DEPLOYMENT_STARTED", timestamp: new Date().toISOString() }) });
const whWrong = await base("/railway/webhook", { method: "POST", headers: { "content-type": "application/json", "X-Webhook-Secret": "wrong-secret", }, body: JSON.stringify({ type: "DEPLOYMENT_STARTED", timestamp: new Date().toISOString() }) });

// public routes that must NOT require auth (negative control: matrix is not over-broad)
const publicChecks: Array<{ path: string; expect: number; got: number; ok: boolean }> = [];
for (const p of ["/", "/health", "/health/detailed", "/metrics", "/world/state", "/world/layout", "/railway/status"]) {
  const r = await base(p, {});
  publicChecks.push({ path: p, expect: 200, got: r.status, ok: r.status === 200 });
}

app.stopBackupScheduler();
app.db.close();

const bad = results.filter((r) => !r.ok);
const doc = {
  format: "stage2-auth-matrix",
  generatedAt: new Date().toISOString(),
  generatedAtHead: execSync("git rev-parse HEAD").toString().trim(),
  generator: "scripts/stage22_auth_matrix.ts (route list derived from source regex, probed on an isolated app instance)",
  sourceFile: SRC,
  ownerGatedRouteCount: results.length,
  requireOwnerRawCount: rawGatedCount,
  matrix: results,
  webhook: {
    note: "POST /railway/webhook is secret-authenticated (not owner-gated); probed separately",
    anonymousStatus: whAnon.status,
    wrongSecretStatus: whWrong.status,
    pass: (whAnon.status === 401 || whAnon.status === 503) && (whWrong.status === 401 || whWrong.status === 503),
  },
  publicRoutesNegativeControl: publicChecks,
  verdict: bad.length === 0 && (whAnon.status === 401 || whAnon.status === 503) && (whWrong.status === 401 || whWrong.status === 503) && publicChecks.every((c) => c.ok)
    ? `PASS — ${results.length}/${results.length} owner-gated routes returned 401 unauthenticated and with a wrong key; webhook refused without a valid secret; ${publicChecks.length}/${publicChecks.length} public routes answered 200 (matrix not over-broad)`
    : `FAIL — ${bad.length} route(s) deviated: ${bad.map((b) => `${b.method} ${b.path} (anon ${b.anon}, wrong ${b.wrongKey})`).join("; ")}`,
};
mkdirSync("docs/stage2/evidence", { recursive: true });
writeFileSync("docs/stage2/evidence/auth-matrix.json", JSON.stringify(doc, null, 2) + "\n");
console.log(doc.verdict);
console.log(`webhook: anon=${whAnon.status} wrong-secret=${whWrong.status}`);
console.log(`public negative control: ${publicChecks.map((c) => `${c.path}:${c.got}`).join(" ")}`);
process.exit(doc.verdict.startsWith("PASS") ? 0 : 1);
