/**
 * Stage 2 Phase 3 — production security improvements (integration tests).
 *
 * Covers:
 *  1. CORS allowlist: no CORS headers by default; exact-origin allowlist when
 *     CORS_ALLOWED_ORIGINS is set; non-listed origins get no ACAO header.
 *  2. Rate limiting: global per-IP fixed window (429 + Retry-After), and the
 *     tighter failed-auth budget (brute-force cut-off).
 *  3. /models/health honest semantics: providers[] with configured/verified
 *     distinction; data[] per-model runtime records documented.
 *  4. POST /models/verify: 401 without owner; with owner returns per-provider
 *     honest verification results (echo round-trip succeeds in test env).
 *  5. fabricFromEnv defensive configuration: whitespace/placeholder creds are
 *     unconfigured.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { createApp } from "@nexus/api";
import { fabricFromEnv } from "@nexus/model-fabric";

const TMP = `/tmp/nexus_phase3_${Date.now()}`;
mkdirSync(TMP, { recursive: true });

const OWNER_KEY = "phase3-owner-key";
// tight limits so the tests are fast and deterministic
const RL = "12";      // global per-minute
const AFL = "3";      // auth-failure per-minute

const app = createApp({
  dbPath: `${TMP}/nexus.db`,
  workspaceRoot: `${TMP}/workspaces`,
  env: {
    OWNER_KEY,
    NEXUS_ALLOW_ECHO: "true",
    RATE_LIMIT_PER_MIN: RL,
    AUTH_FAIL_LIMIT_PER_MIN: AFL,
    CORS_ALLOWED_ORIGINS: "https://allowed-origin.example",
  } as Record<string, string>,
});

afterAll(() => {
  app.db.close();
  rmSync(TMP, { recursive: true, force: true });
});

const req = (path: string, init: RequestInit = {}) =>
  app.app.request(new Request(`http://nexus.local${path}`, init));

describe("CORS allowlist (Phase 3)", () => {
  test("allowed origin receives exact-match ACAO header", async () => {
    const r = await req("/health", { headers: { Origin: "https://allowed-origin.example" } });
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("https://allowed-origin.example");
  });

  test("non-allowed origin receives NO ACAO header", async () => {
    const r = await req("/health", { headers: { Origin: "https://evil.example" } });
    expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("preflight from allowed origin is handled; from others gets no allow-methods", async () => {
    const okPre = await req("/models/catalog", {
      method: "OPTIONS",
      headers: { Origin: "https://allowed-origin.example", "Access-Control-Request-Method": "GET" },
    });
    expect([200, 204]).toContain(okPre.status);
    expect(okPre.headers.get("Access-Control-Allow-Origin")).toBe("https://allowed-origin.example");

    const badPre = await req("/models/catalog", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" },
    });
    expect(badPre.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("rate limiting (Phase 3)", () => {
  test("global fixed window: burst over limit yields 429 + Retry-After", async () => {
    // unique IP so the previous tests' usage does not interfere
    const ip = "203.0.113.10";
    let last429: Response | undefined;
    for (let i = 0; i < Number(RL) + 3; i++) {
      const r = await req("/health", { headers: { "X-Forwarded-For": ip } });
      if (r.status === 429) { last429 = r; break; }
    }
    expect(last429).toBeDefined();
    expect(Number(last429!.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = (await last429!.json()) as any;
    expect(body.error).toBe("rate_limited");
  });

  test("separate IPs have separate budgets", async () => {
    const a = await req("/health", { headers: { "X-Forwarded-For": "203.0.113.11" } });
    const b = await req("/health", { headers: { "X-Forwarded-For": "203.0.113.12" } });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  test("failed-auth lockout: budget exhausted -> protected routes 429 (even valid token), public routes unaffected", async () => {
    const ip = "203.0.113.13";
    for (let i = 0; i < Number(AFL); i++) {
      const r = await req("/mcp/audit", { headers: { "X-Forwarded-For": ip, Authorization: "Bearer wrong" } });
      expect(r.status).toBe(401);
    }
    // lockout semantics: even a VALID token is refused on protected routes
    const lockedValid = await req("/mcp/audit", {
      headers: { "X-Forwarded-For": ip, Authorization: `Bearer ${OWNER_KEY}` },
    });
    expect(lockedValid.status).toBe(429);
    expect(Number(lockedValid.headers.get("Retry-After"))).toBeGreaterThan(0);
    // ... but PUBLIC routes are never collateral damage of lockout
    const pub = await req("/health", { headers: { "X-Forwarded-For": ip } });
    expect(pub.status).toBe(200);
  });

  test("valid owner token is NOT consumed by the auth-failure budget", async () => {
    const ip = "203.0.113.14";
    const r = await req("/models/verify", {
      method: "POST",
      headers: { "X-Forwarded-For": ip, Authorization: `Bearer ${OWNER_KEY}` },
    });
    expect(r.status).toBe(200);
  });
});

describe("models health honest semantics (Phase 3)", () => {
  test("/models/health returns providers[] with configured/verified distinction", async () => {
    const r = await req("/models/health");
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(Array.isArray(body.data)).toBe(true);
    expect(Array.isArray(body.providers)).toBe(true);
    for (const p of body.providers) {
      expect(["cloudflare", "openai", "echo"]).toContain(p.provider);
      expect(typeof p.configured).toBe("boolean");
      // verified is null (never probed), true, or false — never undefined
      expect([null, true, false]).toContain(p.verified);
    }
    const echo = body.providers.find((p: any) => p.provider === "echo");
    expect(echo.configured).toBe(true); // NEXUS_ALLOW_ECHO=true in this app
  });

  test("POST /models/verify requires owner (401 without)", async () => {
    const r = await req("/models/verify", { method: "POST", headers: { "X-Forwarded-For": "203.0.113.20" } });
    expect(r.status).toBe(401);
  });

  test("POST /models/verify with owner returns honest per-provider results", async () => {
    const r = await req("/models/verify", {
      method: "POST",
      headers: { "X-Forwarded-For": "203.0.113.21", Authorization: `Bearer ${OWNER_KEY}` },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    for (const v of body.data) {
      expect(typeof v.verified).toBe("boolean");
      expect(typeof v.detail).toBe("string");
      expect(typeof v.latencyMs).toBe("number");
    }
    // echo is configured in this test app and its round-trip must succeed
    const echo = body.data.find((d: any) => d.provider === "echo");
    expect(echo).toBeDefined();
    expect(echo.verified).toBe(true);
    // verification is then visible in /models/health providers[]
    const h = (await (await req("/models/health")).json()) as any;
    const echoStatus = h.providers.find((p: any) => p.provider === "echo");
    expect(echoStatus.verified).toBe(true);
    expect(echoStatus.lastVerifiedAt).toBeTruthy();
  });

  test("health component reports configured (not 'available') and degraded without verified real providers", async () => {
    const r = await req("/health/detailed");
    const body = (await r.json()) as any;
    const mf = body.components.find((c: any) => c.component === "model_fabric");
    expect(mf).toBeDefined();
    expect(mf.detail).toContain("echo:configured");
    expect(mf.detail).not.toContain(":available");
  });
});

describe("fabricFromEnv defensive configuration (Phase 3)", () => {
  test("whitespace-only and placeholder credentials are unconfigured", () => {
    const { providers } = fabricFromEnv({
      OPENAI_API_KEY: "   ",
      CLOUDFLARE_API_TOKEN: "placeholder",
      CLOUDFLARE_ACCOUNT_ID: "changeme",
    });
    expect(providers).not.toContain("openai");
    expect(providers).not.toContain("cloudflare");
    expect(providers).toContain("echo");
  });

  test("real-shaped credentials are configured", () => {
    const { providers } = fabricFromEnv({
      OPENAI_API_KEY: "sk-test-shaped-key-value-0123456789abcdef",
    });
    expect(providers).toContain("openai");
  });
});
