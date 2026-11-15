/**
 * STAGE 2.4B — END-TO-END VERIFICATION MATRIX (local, remediated tree).
 *
 * Replicates every case from the Stage 2.4A matrix (same IDs, same expected
 * semantics) against the Stage 2.4B remediation, and adds the new cases the
 * remediation introduces:
 *   SEC-12  lockout expiry recovery (THE F-2.4A-01 fix, live through HTTP)
 *   SEC-13  global auth-fail backstop (identity rotation bounded)
 *   DR-01   encrypted on-volume artifact
 *   DR-02   verified encrypted off-volume copy
 *   DR-03   encrypted restore round-trip through the real route
 *   DR-04   no-key fail-visible skip (off-volume refused + alert)
 *
 * Deterministic time: the app instance runs on an injectable clock (nowFn);
 * rate-limit/lockout windows are advanced by ticking the clock, never by
 * sleeping. Every case records id / category / expected / actual / pass.
 *
 * Usage: bun scripts/stage24b/e2e_matrix.ts
 */
import { mkdirSync, rmSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createApp } from "@nexus/api";
import { webhookPayload } from "../../tests/helpers/railway-mocks";

const TMP = `/tmp/stage24b_matrix_${Date.now()}`;
const OWNER_KEY = "matrix-owner-key-stage24b";
const WEBHOOK_SECRET = "matrix-webhook-secret-v1";
const KEY_HEX = randomBytes(32).toString("hex"); // runtime test key
const OFFSITE = `${TMP}/offsite`;
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

let fakeNow = 1_736_100_000_000;
const tick = (ms: number) => { fakeNow += ms; };

const app = createApp({
  dbPath: `${TMP}/nexus.db`,
  workspaceRoot: `${TMP}/ws`,
  env: {
    OWNER_KEY,
    NEXUS_ALLOW_ECHO: "true",
    NEXUS_BACKUP_INTERVAL_HOURS: "0",
    NEXUS_BACKUP_RETENTION: "3",
    NEXUS_BACKUP_OFFSITE_DIR: OFFSITE,
    NEXUS_BACKUP_ENCRYPTION_KEY: KEY_HEX,
    RATE_LIMIT_PER_MIN: "240",
    AUTH_FAIL_LIMIT_PER_MIN: "60",
    AUTH_FAIL_GLOBAL_LIMIT_PER_MIN: "300",
    RAILWAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CORS_ALLOWED_ORIGINS: "https://allowed.example",
  } as Record<string, string>,
  nowFn: () => fakeNow,
});
const server = Bun.serve({ port: 0, fetch: app.app.fetch });
const base = `http://localhost:${server.port}`;

const H = (ip: string | null, extra: Record<string, string> = {}) => {
  const h: Record<string, string> = { ...extra };
  if (ip) h["X-Forwarded-For"] = ip;
  return h;
};
const owner = (ip: string | null = null) => H(ip, { Authorization: `Bearer ${OWNER_KEY}`, "content-type": "application/json" });
const j = async (r: Response) => (await r.json()) as any;
const call = (p: string, init: RequestInit = {}) => fetch(`${base}${p}`, init);

const results: Array<{ id: string; category: string; expected: string; actual: unknown; pass: boolean }> = [];
const record = (id: string, category: string, expected: string, actual: unknown, pass: boolean) => {
  results.push({ id, category, expected, actual: JSON.parse(JSON.stringify(actual)), pass });
};

const t0 = Date.now();

// ---- APP -------------------------------------------------------------------
{
  const r = await call("/health");
  record("APP-01", "application", "ready + /health 200", { status: r.status, overall: (await j(r)).overall }, r.status === 200);
  const r2 = await call("/");
  const b2 = await j(r2);
  record("APP-02", "application", "200 service JSON incl railway subsystem", { status: r2.status, service: b2.service, subsystems: Object.keys(b2.subsystems ?? b2).slice(0, 12) }, r2.status === 200 && b2.service === "NEXUS API");
  const r3 = await call("/health/detailed");
  const b3 = await j(r3);
  record("APP-03", "application", "200, 6 components", { status: r3.status, components: b3.components?.length }, r3.status === 200 && b3.components?.length === 6);
  const r4 = await call("/metrics");
  const b4 = await j(r4);
  record("APP-04", "application", "200 + counters", { status: r4.status, counters: Array.isArray(b4.counters) }, r4.status === 200 && Array.isArray(b4.counters));
  const publicRoutes = ["/", "/health", "/health/detailed", "/jarvis/tasks", "/mcp/servers", "/metrics",
    "/models/catalog", "/models/providers", "/models/health", "/naei/agents", "/naei/tasks",
    "/world/events", "/world/residents", "/world/state", "/world/layout"];
  const codes: Record<string, number> = {};
  for (const p of publicRoutes) codes[p] = (await call(p)).status;
  record("APP-05", "application", "all public routes 2xx", codes, Object.values(codes).every((c) => c >= 200 && c < 300));
  const r6 = await call("/definitely/not/a/route");
  record("APP-06", "application", "404", { status: r6.status, bodyLen: (await r6.text()).length }, r6.status === 404);
  const r7 = await call("/world/advance", { method: "POST", headers: owner("198.51.100.1"), body: "{not json" });
  record("APP-07", "application", "malformed JSON 400", { status: r7.status }, r7.status === 400);
}

// ---- AUTH ------------------------------------------------------------------
{
  const r1 = await call("/jarvis/objectives", { method: "POST", headers: H("198.51.100.2"), body: JSON.stringify({ objective: "x", origin: "user" }) });
  record("AUTH-01", "authentication", "anon consequential 401", { status: r1.status }, r1.status === 401);
  const r2 = await call("/jarvis/objectives", { method: "POST", headers: owner("198.51.100.3"), body: JSON.stringify({ objective: "matrix objective", origin: "user" }) });
  record("AUTH-02", "authentication", "valid key 201", { status: r2.status }, r2.status === 201);
  const r3 = await call("/jarvis/objectives", { method: "POST", headers: H("198.51.100.4", { Authorization: "Bearer wrong" }), body: JSON.stringify({ objective: "x", origin: "user" }) });
  record("AUTH-03", "authentication", "invalid key 401", { status: r3.status }, r3.status === 401);
  const r4 = await call("/jarvis/objectives", { method: "POST", headers: H("198.51.100.5", { Authorization: `bearer ${OWNER_KEY}` }), body: JSON.stringify({ objective: "x", origin: "user" }) });
  record("AUTH-04", "authentication", "case-mangled scheme 401", { status: r4.status }, r4.status === 401);
  const r5 = await call(`/mcp/audit?key=${encodeURIComponent(OWNER_KEY)}`);
  record("AUTH-05", "authentication", "key in query string NOT accepted", { status: r5.status }, r5.status === 401);
  // owner-gated GET routes only; /railway/status is public-by-design (statuses,
  // not topology) and GET /railway/monitor does not exist (POST-only, gated)
  const railAnon = ["/railway/discovery", "/railway/usage", "/railway/credentials/status",
    "/railway/events", "/railway/audit", "/railway/backups", "/railway/reconciliation", "/railway/operations"];
  const codes: Record<string, number> = {};
  for (const p of railAnon) codes[p] = (await call(p)).status;
  record("AUTH-06", "authentication", "all /railway/* owner-gated 401 anon", codes, Object.values(codes).every((c) => c === 401));
}

// ---- SEC (headers, webhook, backup route safety) -----------------------------
{
  const r1 = await call("/health", { headers: { Origin: "https://allowed.example" } });
  record("SEC-01", "security", "allowed origin echoed", { acao: r1.headers.get("Access-Control-Allow-Origin") }, r1.headers.get("Access-Control-Allow-Origin") === "https://allowed.example");
  const r2 = await call("/health", { headers: { Origin: "https://evil.example" } });
  record("SEC-02", "security", "disallowed origin no ACAO", { acao: r2.headers.get("Access-Control-Allow-Origin") }, r2.headers.get("Access-Control-Allow-Origin") === null);
  const r3 = await call("/models/catalog", { method: "OPTIONS", headers: { Origin: "https://allowed.example", "Access-Control-Request-Method": "GET" } });
  record("SEC-03", "security", "preflight 200/204 + echo", { status: r3.status, acao: r3.headers.get("Access-Control-Allow-Origin") }, [200, 204].includes(r3.status) && r3.headers.get("Access-Control-Allow-Origin") === "https://allowed.example");
  const r3b = await call("/models/catalog", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" } });
  record("SEC-03b", "security", "preflight bad origin no ACAO", { acao: r3b.headers.get("Access-Control-Allow-Origin") }, r3b.headers.get("Access-Control-Allow-Origin") === null);

  const wGoodShape = webhookPayload({ timestamp: "2020-01-01T00:00:00.000Z" });
  const r4 = await call("/railway/webhook", { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": "wrong-secret" }, body: wGoodShape });
  record("SEC-04", "security", "webhook bad secret 401", { status: r4.status }, r4.status === 401);
  const r5 = await call("/railway/webhook", { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": WEBHOOK_SECRET }, body: JSON.stringify({ type: "Deployment.failed" }) });
  record("SEC-05", "security", "webhook invalid payload 400", { status: r5.status }, r5.status === 400);
  const r6 = await call("/railway/webhook", { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": WEBHOOK_SECRET }, body: webhookPayload({ timestamp: "2020-01-01T00:00:00.000Z" }) });
  record("SEC-06", "security", "stale timestamp (replay) 401", { status: r6.status }, r6.status === 401);
  const r7 = await call("/railway/backup/export/..%2F..%2Fetc%2Fpasswd/download", { headers: owner("198.51.100.10") });
  record("SEC-07", "security", "traversal filename 400", { status: r7.status }, r7.status === 400);
  const r8 = await call("/railway/backup/restore", { method: "POST", headers: owner("198.51.100.11"), body: JSON.stringify({ file: "../etc/passwd" }) });
  record("SEC-08", "security", "restore bad filename 400", { status: r8.status }, r8.status === 400);
}

// ---- DB (+ DR chain from the same export) -----------------------------------
let exportedFile = "";
let exportedName = "";
{
  const r1 = await call("/health/detailed");
  const b1 = await j(r1);
  const dbDetail = b1.components.find((c: any) => c.component === "database")?.detail;
  record("DB-01", "database", "migrations 3 applied", { detail: dbDetail }, /migrations applied: 3/.test(String(dbDetail)));
  const r2 = await call("/world/state");
  const b2 = await j(r2);
  record("DB-02", "database", "world state served", { status: r2.status, world: b2.data?.world?.name }, r2.status === 200 && b2.data?.world?.name === "NEXUS Prime");
  const before = (await j(await call("/world/state"))).data.world.simulationTime;
  await call("/world/advance", { method: "POST", headers: owner("198.51.100.20"), body: JSON.stringify({ ticks: 3 }) });
  const after = (await j(await call("/world/state"))).data.world.simulationTime;
  record("DB-03", "database", "write + read-back", { before, after, increased: after > before }, after > before);
  const r4 = await call("/railway/backup/export", { method: "POST", headers: owner("198.51.100.21") });
  const b4 = await j(r4);
  exportedFile = b4.data.file;
  exportedName = exportedFile.split("/").pop();
  record("DB-04", "database", "backup export verified", { status: r4.status, rowsMatched: b4.data.verification.rowsMatched, encrypted: b4.data.encrypted }, r4.status === 201 && b4.data.verification.rowsMatched === true);
}

// ---- DR (new in Stage 2.4B) --------------------------------------------------
{
  const head = readFileSync(exportedFile).subarray(0, 320).toString("utf8");
  const listing = app.listLogicalBackups();
  record("DR-01", "disaster-recovery", "encrypted on-volume artifact", { encryptedMarker: head.includes("nexus-logical-backup-encrypted"), listingEncrypted: listing.history[0]?.encrypted, canaryLeak: readFileSync(exportedFile).toString("utf8").includes("matrix objective") }, head.includes("nexus-logical-backup-encrypted") && listing.history[0]?.encrypted === true && !readFileSync(exportedFile).toString("utf8").includes("matrix objective"));
  const offVol = join(OFFSITE, exportedName);
  const offOk = existsSync(offVol) && sha(readFileSync(offVol)) === sha(readFileSync(exportedFile));
  record("DR-02", "disaster-recovery", "verified encrypted off-volume copy", { offVolumeFile: offVol, byteIdentical: offOk, offsiteCopied: listing.rpo.offVolume.enabled }, offOk && listing.rpo.offVolume.enabled === true);
  const r3 = await call("/railway/backup/restore", { method: "POST", headers: owner("198.51.100.22"), body: JSON.stringify({ file: exportedName }) });
  const b3 = await j(r3);
  record("DR-03", "disaster-recovery", "encrypted restore round-trip through the real route", { status: r3.status, encrypted: b3.data?.encrypted, restored: b3.data?.report?.restored, contentAllMatch: b3.data?.report?.perTable?.every((p: any) => p.contentMatch) }, r3.status === 200 && b3.data?.encrypted === true && b3.data?.report?.restored === true);
}
{
  // DR-04: a second instance WITHOUT a key — off-volume refused, alert visible
  const OFFSITE2 = `${TMP}/offsite-nokey`;
  const app2 = createApp({
    dbPath: `${TMP}/nokey/nexus.db`,
    workspaceRoot: `${TMP}/nokey/ws`,
    env: { OWNER_KEY, NEXUS_ALLOW_ECHO: "true", NEXUS_BACKUP_INTERVAL_HOURS: "0", RATE_LIMIT_PER_MIN: "240", NEXUS_BACKUP_RETENTION: "3", NEXUS_BACKUP_OFFSITE_DIR: OFFSITE2 } as Record<string, string>,
  });
  const srv2 = Bun.serve({ port: 0, fetch: app2.app.fetch });
  const r = await fetch(`http://localhost:${srv2.port}/railway/backup/export`, { method: "POST", headers: { Authorization: `Bearer ${OWNER_KEY}` } });
  const b = await j(r);
  const s = app2.listLogicalBackups();
  const offEmpty = !existsSync(OFFSITE2) || readdirSync(OFFSITE2).filter((f) => f.endsWith(".json")).length === 0; // never created at all is even stronger
  record("DR-04", "disaster-recovery", "no-key fail-visible skip (off-volume refused + alert)", {
    status: r.status, onVolumeOk: b.data.ok, onVolumeEncrypted: b.data.encrypted, offsiteCopied: b.data.offsite.copied,
    offsiteError: b.data.offsite.error, offsiteDirEmpty: offEmpty,
    alertVisible: s.alerts.some((a) => a.code === "OFFSITE_SKIPPED_NO_KEY"),
    rpoHonest: s.rpo.offVolume.enabled === false,
  }, r.status === 201 && b.data.ok === true && b.data.offsite.copied === false && offEmpty && s.alerts.some((a) => a.code === "OFFSITE_SKIPPED_NO_KEY") && s.rpo.offVolume.enabled === false);
  srv2.stop(true);
  app2.stopBackupScheduler();
  app2.db.close();
}

// ---- SEC 09-13 (rate limiting + lockout, live through HTTP) ------------------
{
  tick(61_000); // clean window for the flood identity
  const ip = "203.0.113.201";
  let first429 = -1;
  let retryAfter: string | null = null;
  const counts = { "200": 0, "429": 0 };
  for (let i = 1; i <= 241; i++) {
    const r = await call("/health", { headers: H(ip) });
    const k = String(r.status) === "200" ? "200" : String(r.status) === "429" ? "429" : String(r.status);
    counts[k as "200" | "429"] = (counts[k as "200" | "429"] ?? 0) + 1;
    if (r.status === 429 && first429 < 0) { first429 = i; retryAfter = r.headers.get("Retry-After"); break; }
  }
  record("SEC-09", "security", "429 + Retry-After at 241st request", { first429, retryAfter, counts }, first429 === 241 && Number(retryAfter) > 0);

  tick(61_000);
  const ip2 = "203.0.113.202";
  let s61 = 0;
  for (let i = 1; i <= 61; i++) {
    const r = await call("/mcp/audit", { headers: H(ip2, { Authorization: "Bearer wrong" }) });
    if (i === 61) s61 = r.status;
  }
  const lockedValid = (await call("/mcp/audit", { headers: H(ip2, { Authorization: `Bearer ${OWNER_KEY}` }) })).status;
  const otherIp = (await call("/mcp/audit", { headers: H("203.0.113.203", { Authorization: `Bearer ${OWNER_KEY}` }) })).status;
  record("SEC-10", "security", "61st fail 429; valid key locked; other IP unaffected", { s61, lockedValid, otherIp }, s61 === 429 && lockedValid === 429 && otherIp === 200);
  const pub = (await call("/health", { headers: H(ip2) })).status;
  record("SEC-11", "security", "health readable while locked", { pub }, pub === 200);

  tick(60_000); // THE FIX: the window expires — no restart, no real wait
  const recovered = (await call("/mcp/audit", { headers: H(ip2, { Authorization: `Bearer ${OWNER_KEY}` }) })).status;
  const honest401 = (await call("/mcp/audit", { headers: H(ip2, { Authorization: "Bearer wrong" }) })).status;
  record("SEC-12", "security", "valid credential works after expiry WITHOUT restart (F-2.4A-01 fix)", { recovered, honest401 }, recovered === 200 && honest401 === 401);

  tick(61_000);
  const identities = ["203.0.113.211", "203.0.113.212", "203.0.113.213", "203.0.113.214", "203.0.113.215", "203.0.113.216"];
  for (const id of identities) for (let i = 0; i < 50; i++) await call("/mcp/audit", { headers: H(id, { Authorization: "Bearer wrong" }) });
  // 300 total failures across 6 rotating identities — global budget exactly exhausted
  const freshIdentityValid = await call("/mcp/audit", { headers: H("203.0.113.220", { Authorization: `Bearer ${OWNER_KEY}` }) });
  const scope = freshIdentityValid.headers.get("x-lockout-scope");
  tick(60_000);
  const afterWindow = (await call("/mcp/audit", { headers: H("203.0.113.220", { Authorization: `Bearer ${OWNER_KEY}` }) })).status;
  record("SEC-13", "security", "global backstop: identity rotation cannot exceed the shared budget", { freshIdentityValidStatus: freshIdentityValid.status, scope, retryAfter: freshIdentityValid.headers.get("Retry-After"), afterWindow, pubStill: (await call("/health", { headers: H("203.0.113.220") })).status }, freshIdentityValid.status === 429 && scope === "global" && afterWindow === 200);
}

const summary = { pass: results.filter((r) => r.pass).length, fail: results.filter((r) => !r.pass).length, total: results.length };
const out = {
  startedAt: new Date(t0).toISOString(),
  finishedAt: new Date().toISOString(),
  base,
  branch: "stage2.4b-remediation (post-fix)",
  summary,
  results,
};

server.stop(true);
app.stopBackupScheduler();
app.db.close();
rmSync(TMP, { recursive: true, force: true });

console.log(JSON.stringify(out, null, 2));
process.exit(summary.fail === 0 ? 0 : 1);
