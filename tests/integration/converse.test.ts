import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { createApp } from "@nexus/api";

/**
 * Integration: JARVIS conversation routes + the voice-first PWA surface
 * (Stage 3.1), through the real HTTP app.
 *
 * NEXUS_ALLOW_ECHO=true wires the deterministic echo adapter as the ONLY
 * provider (ADR-007: explicit test configuration) — the suite asserts the
 * conversation CONTRACT (persistence, auth, states, assets), not model prose.
 */
const TMP = `/tmp/nexus_converse_it_${Date.now()}`;
mkdirSync(TMP, { recursive: true });

const TEST_OWNER_KEY = "converse-integration-owner-key";

let app: ReturnType<typeof createApp>;
let port: number;
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  app = createApp({
    dbPath: `${TMP}/nexus.db`,
    workspaceRoot: `${TMP}/workspaces`,
    env: {
      OWNER_KEY: TEST_OWNER_KEY,
      NEXUS_ALLOW_ECHO: "true",
      NEXUS_BACKUP_INTERVAL_HOURS: "0", // no scheduled backups during the test
    },
  });
  port = 4100 + Math.floor(Math.random() * 100);
  server = Bun.serve({ port, fetch: app.app.fetch });
});

afterAll(() => {
  server.stop(true);
  app.stopBackupScheduler();
  app.db.close();
  rmSync(TMP, { recursive: true, force: true });
});

const base = () => `http://localhost:${port}`;
const owner = { Authorization: `Bearer ${TEST_OWNER_KEY}`, "Content-Type": "application/json" };

describe("JARVIS conversation routes", () => {
  test("unauthenticated converse is refused (model spend is owner-only)", async () => {
    const r = await fetch(`${base()}/jarvis/converse`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    expect(r.status).toBe(401);
  });

  test("malformed body is a 400, never silently coerced", async () => {
    const r = await fetch(`${base()}/jarvis/converse`, { method: "POST", headers: owner, body: "not json" });
    expect(r.status).toBe(400);
  });

  test("owner conversation: session created, both turns persisted, reply is non-degraded", async () => {
    const r = await fetch(`${base()}/jarvis/converse`, {
      method: "POST", headers: owner, body: JSON.stringify({ message: "Good morning JARVIS" }),
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as {
      data: {
        session: { id: string; state: string; title: string };
        reply: { content: string; meta: { degraded: boolean; provider: string } };
        userMessage: { content: string };
      };
    };
    expect(body.data.session.state).toBe("ACTIVE");
    expect(body.data.session.title).toContain("Good morning");
    expect(typeof body.data.reply.content).toBe("string");
    expect(body.data.reply.content.length).toBeGreaterThan(0);
    expect(body.data.reply.meta.degraded).toBe(false);
    expect(body.data.reply.meta.provider).toBe("echo"); // explicit test provider (ADR-007)

    // second turn continues the same session
    const r2 = await fetch(`${base()}/jarvis/converse`, {
      method: "POST", headers: owner,
      body: JSON.stringify({ sessionId: body.data.session.id, message: "What did I say?" }),
    });
    expect(r2.status).toBe(201);
    const b2 = (await r2.json()) as { data: { session: { id: string } } };
    expect(b2.data.session.id).toBe(body.data.session.id);

    // transcript carries all four turns
    const h = await fetch(`${base()}/jarvis/converse/history?sessionId=${body.data.session.id}`, { headers: owner });
    expect(h.status).toBe(200);
    const hb = (await h.json()) as { data: Array<{ role: string }> };
    expect(hb.data.length).toBe(4);
    expect(hb.data.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  test("sessions listing shows the session with message count", async () => {
    const r = await fetch(`${base()}/jarvis/converse/sessions`, { headers: owner });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { data: Array<{ id: string; messages: number; state: string }> };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0]!.messages).toBeGreaterThanOrEqual(2);
  });

  test("history for an unknown session is 404; unknown converse session is 404", async () => {
    const h = await fetch(`${base()}/jarvis/converse/history?sessionId=nexus_conv_nope`, { headers: owner });
    expect(h.status).toBe(404);
    const r = await fetch(`${base()}/jarvis/converse`, {
      method: "POST", headers: owner, body: JSON.stringify({ sessionId: "nexus_conv_nope", message: "hi" }),
    });
    expect(r.status).toBe(404);
  });

  test("session-state sets SLEEPING; the next converse wakes it with wokeFrom", async () => {
    const r = await fetch(`${base()}/jarvis/converse`, {
      method: "POST", headers: owner, body: JSON.stringify({ message: "Hello again" }),
    });
    const b = (await r.json()) as { data: { session: { id: string } } };
    const sid = b.data.session.id;

    const s = await fetch(`${base()}/jarvis/converse/session-state`, {
      method: "POST", headers: owner, body: JSON.stringify({ sessionId: sid, state: "SLEEPING" }),
    });
    expect(s.status).toBe(200);
    const sb = (await s.json()) as { data: { state: string } };
    expect(sb.data.state).toBe("SLEEPING");

    const w = await fetch(`${base()}/jarvis/converse`, {
      method: "POST", headers: owner, body: JSON.stringify({ sessionId: sid, message: "Wake up" }),
    });
    expect(w.status).toBe(201);
    const wb = (await w.json()) as { data: { reply: { meta: { wokeFrom?: string } }; session: { state: string } } };
    expect(wb.data.reply.meta.wokeFrom).toBe("SLEEPING");
    expect(wb.data.session.state).toBe("ACTIVE");
  });

  test("invalid session-state value is a 400", async () => {
    const r = await fetch(`${base()}/jarvis/converse/session-state`, {
      method: "POST", headers: owner, body: JSON.stringify({ sessionId: "x", state: "HIBERNATING" }),
    });
    expect(r.status).toBe(400);
  });

  test("conversation metrics are counted", async () => {
    const m = await fetch(`${base()}/metrics`);
    const body = (await m.json()) as { counters: Array<{ name: string; labels: Record<string, string>; count: number }> };
    const turns = body.counters.filter((c) => c.name === "conversation_turns_total");
    expect(turns.length).toBeGreaterThanOrEqual(1);
    expect(turns.reduce((n, c) => n + c.count, 0)).toBeGreaterThanOrEqual(4);
  });
});

describe("voice-first PWA surface (/app/)", () => {
  test("/app redirects to /app/", async () => {
    const r = await fetch(`${base()}/app`, { redirect: "manual" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/app/");
  });

  test("the app shell serves with HTML content type and no aggressive caching", async () => {
    const r = await fetch(`${base()}/app/`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(r.headers.get("cache-control")).toBe("no-cache");
    const html = await r.text();
    expect(html).toContain("JARVIS");
    expect(html).toContain("manifest.webmanifest");
    expect(html).toContain("apple-touch-icon");
  });

  test("static assets serve with correct types", async () => {
    const js = await fetch(`${base()}/app/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("text/javascript");
    const css = await fetch(`${base()}/app/style.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    const sw = await fetch(`${base()}/app/sw.js`);
    expect(sw.status).toBe(200);
    const mf = await fetch(`${base()}/app/manifest.webmanifest`);
    expect(mf.status).toBe(200);
    expect(mf.headers.get("content-type")).toContain("application/manifest+json");
    const manifest = (await mf.json()) as { start_url: string; icons: Array<{ src: string }> };
    expect(manifest.start_url).toBe("/app/");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    const icon = await fetch(`${base()}/app/icon-192.png`);
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toBe("image/png");
    expect((await icon.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  test("unknown /app paths 404 (explicit allowlist — no directory listing)", async () => {
    const r = await fetch(`${base()}/app/nothing-here.js`);
    expect(r.status).toBe(404);
    const trav = await fetch(`${base()}/app/..%2f..%2fpackage.json`);
    expect(trav.status).toBe(404);
  });

  test("the API root still serves its JSON contract and points at the app", async () => {
    const r = await fetch(`${base()}/`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { service: string; app: string };
    expect(body.service).toBe("NEXUS API");
    expect(body.app).toBe("/app/");
  });
});
