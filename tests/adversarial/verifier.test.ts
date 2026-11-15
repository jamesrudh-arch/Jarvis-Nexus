/**
 * STAGE 2 PHASE 9 — INDEPENDENT ADVERSARIAL VERIFICATION SUITE.
 *
 * This suite is the VERIFIER's tool, deliberately separate from the
 * implementation agent's own tests. It attacks the implementation with
 * vectors the implementation did not choose for itself and can REJECT the
 * work: a single mandatory failure here means the subsystem is REJECTED
 * regardless of the implementation suite's results.
 *
 * Verification dimensions (directive §9):
 *  V1 fabrication detection (source-level, no trust in test claims)
 *  V2 security-boundary attacks (bypass attempts the impl didn't publish)
 *  V3 API contract validation (envelope + version on every route)
 *  V4 evidence provenance (claimed artifacts exist and are non-empty)
 *  V5 regression landmines (historical defects must stay dead)
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "@nexus/api";

const TMP = `/tmp/nexus_adversarial_${Date.now()}`;
const OWNER_KEY = "adversarial-owner-key";

const app = createApp({
  dbPath: `${TMP}/nexus.db`,
  workspaceRoot: `${TMP}/workspaces`,
  env: { OWNER_KEY, NEXUS_ALLOW_ECHO: "true", NEXUS_BACKUP_INTERVAL_HOURS: "0", RATE_LIMIT_PER_MIN: "1000" } as Record<string, string>,
});

const req = (path: string, init: RequestInit = {}) =>
  app.app.request(new Request(`http://adv.test${path}`, init));

// ---------------------------------------------------------------------------
// V1 — FABRICATION DETECTION (source-level)
// ---------------------------------------------------------------------------
describe("V1 fabrication detection", () => {
  const PROD_SRC = ["apps/nexus-api/src/index.ts", "packages/model-fabric/src/index.ts", "packages/railway/src/client.ts"];

  test("no mock transports wired into production code paths", () => {
    for (const f of PROD_SRC) {
      const src = readFileSync(f, "utf8");
      // production source must not import mock helpers or stub transports
      expect(src.includes("createRailwayMock")).toBe(false);
      expect(src.includes("vi.mock")).toBe(false);
      expect(/fetchFn\s*[:=]\s*mock/i.test(src)).toBe(false);
    }
  });

  test("no hardcoded 'healthy' shortcuts in health components", () => {
    const src = readFileSync("apps/nexus-api/src/index.ts", "utf8");
    // every health registration must derive status from a real probe.
    // Balanced-brace capture (a lazy \}\); match truncates on nested returns).
    const registrations: string[] = [];
    let idx = 0;
    while (true) {
      const start = src.indexOf("health.register(", idx);
      if (start < 0) break;
      let depth = 0, i = start + "health.register(".length - 1;
      for (; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") { depth--; if (depth === 0) break; }
      }
      registrations.push(src.slice(start, i + 1));
      idx = i + 1;
    }
    expect(registrations.length).toBeGreaterThanOrEqual(6);
    for (const r of registrations) {
      // a registration whose status is a bare string literal is a fabrication
      expect(/status:\s*"healthy"\s*,/.test(r)).toBe(false);
    }
  });

  test("model fabric: echo is not a selectable provider without explicit opt-in", async () => {
    // ADR-007: echo off unless NEXUS_ALLOW_ECHO=true
    const fabricNoEcho = createApp({
      dbPath: `${TMP}/noecho.db`,
      workspaceRoot: `${TMP}/ws2`,
      env: { OWNER_KEY, NEXUS_BACKUP_INTERVAL_HOURS: "0" } as Record<string, string>,
    });
    const r = await fabricNoEcho.app.request(new Request("http://adv.test/models/providers"));
    const body = (await r.json()) as { data: string[] };
    expect(body.data).not.toContain("echo");
    fabricNoEcho.db.close();
  });

  test("rate-limit headers are real (Retry-After present on 429)", async () => {
    // dedicated instance with a TIGHT limit so this test cannot be masked by
    // the shared app's generous budget (verifier self-fix: isolated fixture)
    const tight = createApp({
      dbPath: `${TMP}/tight.db`,
      workspaceRoot: `${TMP}/ws-tight`,
      env: { OWNER_KEY, NEXUS_BACKUP_INTERVAL_HOURS: "0", RATE_LIMIT_PER_MIN: "5", AUTH_FAIL_LIMIT_PER_MIN: "3" } as Record<string, string>,
    });
    let got429: Response | null = null;
    for (let i = 0; i < 12 && !got429; i++) {
      const r = await tight.app.request(new Request("http://adv.test/health", { headers: { "X-Forwarded-For": "203.0.113.98" } }));
      if (r.status === 429) got429 = r;
    }
    tight.db.close();
    expect(got429).not.toBeNull();
    expect(Number(got429!.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// V2 — SECURITY-BOUNDARY ATTACKS
// ---------------------------------------------------------------------------
describe("V2 security boundary attacks", () => {
  test("auth bypass: owner key in query string is refused", async () => {
    const r = await req(`/mcp/audit?key=${encodeURIComponent(OWNER_KEY)}`);
    expect(r.status).toBe(401);
  });

  test("auth bypass: case-mangled authorization schemes are refused", async () => {
    for (const scheme of ["bearer", "BEARER", "Basic", "bearer "]) {
      const r = await req("/mcp/audit", { headers: { Authorization: `${scheme} ${OWNER_KEY}`, "X-Forwarded-For": "198.51.100.6" } });
      expect(r.status).toBe(401);
    }
  });

  test("auth bypass: whitespace-padded token is refused (constant-time compare not fooled)", async () => {
    const r = await req("/mcp/audit", { headers: { Authorization: `Bearer  ${OWNER_KEY} `, "X-Forwarded-For": "198.51.100.6" } });
    expect(r.status).toBe(401);
  });

  test("oversized payloads are rejected or safely bounded, never crash", async () => {
    const big = "x".repeat(2_000_000);
    const endpoints = ["/jarvis/objectives", "/world/advance", "/memory", "/railway/webhook"];
    for (const e of endpoints) {
      const r = await req(e, {
        method: "POST",
        headers: { Authorization: `Bearer ${OWNER_KEY}`, "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.7" },
        body: JSON.stringify({ objective: big, ticks: big, text: big, payload: big }),
      });
      // 400 validation / 413 size / 503 unconfigured-secret are all honest
      // non-crash outcomes; 500 is the failure this test guards against
      expect([200, 201, 202, 400, 413, 503]).toContain(r.status);
    }
  });

  test("malformed JSON bodies produce 4xx, never 500 and never silent side effects", async () => {
    for (const e of ["/jarvis/objectives", "/world/advance", "/railway/webhook"]) {
      const before = await req("/world/state", { headers: { "X-Forwarded-For": "198.51.100.31" } });
      const tickBefore = ((await before.json()) as { data: { world: { simulationTime: number } } }).data.world.simulationTime;
      const r = await req(e, {
        method: "POST",
        headers: { Authorization: `Bearer ${OWNER_KEY}`, "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.8" },
        body: "{not json at all",
      });
      expect([400, 503]).toContain(r.status);
      // no silent world mutation from garbage input (Phase 9 finding regression guard)
      if (e === "/world/advance") {
        const after = await req("/world/state", { headers: { "X-Forwarded-For": "198.51.100.31" } });
        const tickAfter = ((await after.json()) as { data: { world: { simulationTime: number } } }).data.world.simulationTime;
        expect(tickAfter).toBe(tickBefore);
      }
    }
  });

  test("path traversal in resident id is rejected safely", async () => {
    const r = await req("/world/residents/..%2F..%2Fetc%2Fpasswd");
    expect(r.status).toBe(404);
    const body = await r.json();
    expect(JSON.stringify(body)).not.toContain("root:");
  });

  test("webhook without secret is refused (401/503), never accepted", async () => {
    const r = await req("/railway/webhook", { method: "POST", body: "{}", headers: { "X-Forwarded-For": "198.51.100.9" } });
    expect([401, 503]).toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
// V3 — API CONTRACT VALIDATION (every route, honest envelope)
// ---------------------------------------------------------------------------
describe("V3 API contract validation", () => {
  const GET_ROUTES = ["/", "/health", "/health/detailed", "/jarvis/tasks", "/mcp/servers",
    "/metrics", "/models/catalog", "/models/providers", "/models/health", "/naei/agents",
    "/naei/tasks", "/world/events", "/world/residents", "/world/state", "/world/layout"];

  test("every public GET route answers 200 with a JSON envelope", async () => {
    for (const p of GET_ROUTES) {
      const r = await req(p, { headers: { "X-Forwarded-For": "198.51.100.20" } });
      expect(r.status).toBe(200);
      const body = (await r.json()) as Record<string, unknown>;
      expect(typeof body).toBe("object");
      expect(body.error).toBeUndefined();
    }
  });

  test("service identity declares the contract version", async () => {
    const r = await req("/");
    const body = (await r.json()) as { contractVersion: string; service: string };
    expect(body.service).toBe("NEXUS API");
    expect(body.contractVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("unknown routes 404 without stack traces", async () => {
    const r = await req("/definitely/not/a/route");
    expect(r.status).toBe(404);
    const text = await r.text();
    expect(text.length).toBeLessThan(500); // no stack trace / source leak
    expect(text).not.toMatch(/at\s+\w+\s+\(/);
  });

  test("protected routes consistently 401 without credentials", async () => {
    for (const p of ["/mcp/audit", "/memory/global"]) {
      const r = await req(p, { headers: { "X-Forwarded-For": "198.51.100.21" } });
      expect(r.status).toBe(401);
    }
    const v = await req("/models/verify", { method: "POST", headers: { "X-Forwarded-For": "198.51.100.21" } });
    expect(v.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// V4 — EVIDENCE PROVENANCE
// ---------------------------------------------------------------------------
describe("V4 evidence provenance", () => {
  // Stage 2.2 Workstream B: the evidence tree moved from gitignored download/
  // (wiped twice — Stage 2.1 finding F-COM-07, Stage 2.2 finding N-2.2-01) to
  // the GIT-TRACKED docs/stage2/ tree. Assertion strength is unchanged; only
  // the durable location changed. Evidence is honestly regenerated (dated,
  // never backdated); unrecoverable history is classified in the reports.
  test("stage 2 evidence directory exists with non-empty artifacts", () => {
    const dir = "docs/stage2/evidence";
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir).filter((f) => !f.startsWith("."));
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) {
      expect(statSync(join(dir, f)).size).toBeGreaterThan(0);
    }
  });

  test("stage 2 reports exist (each phase documented)", () => {
    const reports = [
      "docs/stage2/reports/PHASE0_BASELINE.md",
      "docs/stage2/reports/SECURITY_REMEDIATION.md",
      "docs/stage2/reports/RECOVERY_MANIFEST.md",
      "docs/stage2/reports/GIT_RECONCILIATION.md",
      "docs/stage2/reports/DEPLOYMENT_READINESS.md",
      "docs/stage2/reports/BACKUP_VERIFICATION.md",
      "docs/stage2/reports/VISUAL_APP_RESTORATION.md",
    ];
    for (const r of reports) {
      expect(existsSync(r)).toBe(true);
      expect(statSync(r).size).toBeGreaterThan(500);
    }
  });

  test("recovery point artifacts exist matching the manifest", () => {
    const manifest = JSON.parse(readFileSync("docs/stage2/reports/recovery_manifest.json", "utf8"));
    for (const a of manifest.artifacts) {
      expect(existsSync(a.path)).toBe(true);
      expect(statSync(a.path).size).toBeGreaterThan(1000);
    }
  });
});

// ---------------------------------------------------------------------------
// V5 — REGRESSION LANDMINES (historical defects must stay dead)
// ---------------------------------------------------------------------------
describe("V5 regression landmines", () => {
  test("metric cardinality stays bounded under path fuzzing (2026-11-14 defect)", async () => {
    for (let i = 0; i < 25; i++) {
      await req(`/fuzz-${i}-${Date.now()}`, { headers: { "X-Forwarded-For": "198.51.100.30" } });
    }
    const r = await req("/metrics");
    const body = (await r.json()) as { counters: Array<{ labels: Record<string, string> }> };
    const routes = new Set(body.counters.map((c) => c.labels.route));
    // fuzzed paths must collapse to "other" — the allowlist holds
    expect(routes.has("other")).toBe(true);
    const ALLOWED = ["health", "world", "jarvis", "naei", "mcp", "memory", "metrics", "models", "railway", "other"];
    for (const route of routes) {
      expect(ALLOWED.includes(route as string)).toBe(true);
    }
  });
});
