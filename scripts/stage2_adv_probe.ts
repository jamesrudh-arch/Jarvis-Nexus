import { createApp } from "@nexus/api";
const app = createApp({ dbPath: "/tmp/advdbg/db.sqlite", workspaceRoot: "/tmp/advdbg/ws",
  env: { OWNER_KEY: "k", NEXUS_ALLOW_ECHO: "true", NEXUS_BACKUP_INTERVAL_HOURS: "0" } as Record<string, string> });
const big = "x".repeat(2_000_000);
for (const e of ["/jarvis/objectives", "/world/advance", "/memory", "/railway/webhook"]) {
  const r = await app.app.request(new Request(`http://t${e}`, { method: "POST",
    headers: { Authorization: "Bearer k", "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.77" },
    body: JSON.stringify({ objective: big, ticks: big, text: big, payload: big }) }));
  console.log(e, "->", r.status, (await r.text()).slice(0, 120).replace(/\n/g, " "));
}
for (const e of ["/jarvis/objectives", "/world/advance", "/railway/webhook"]) {
  const r = await app.app.request(new Request(`http://t${e}`, { method: "POST",
    headers: { Authorization: "Bearer k", "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.78" },
    body: "{not json" }));
  console.log("malformed", e, "->", r.status, (await r.text()).slice(0, 100).replace(/\n/g, " "));
}
