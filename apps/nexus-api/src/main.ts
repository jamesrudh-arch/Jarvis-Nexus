/**
 * NEXUS API entrypoint — binds the HTTP service.
 */
import { createApp } from "./index";

const dbPath = process.env.NEXUS_DB_PATH ?? "/home/z/my-project/data/nexus.db";
const workspaceRoot = process.env.NEXUS_WORKSPACE_ROOT ?? "/home/z/my-project/data/workspaces";

const nexus = createApp({ dbPath, workspaceRoot, env: process.env });

const port = Number(process.env.PORT ?? 3000);
Bun.serve({
  port,
  fetch: nexus.app.fetch,
});

console.log(JSON.stringify({
  ts: new Date().toISOString(),
  level: "info",
  component: "nexus-api",
  message: `NEXUS API listening on :${port}`,
  dbPath,
}));

// restart recovery: resume interrupted JARVIS + NAEI tasks (directive §21)
Promise.allSettled([
  nexus.orchestrator.recoverInterrupted(),
  nexus.naei.recoverInterrupted(),
]).then(([jarvis, naei]) => {
  console.log(JSON.stringify({
    component: "recovery",
    jarvisTasksResumed: jarvis.status === "fulfilled" ? jarvis.value.length : "error",
    naeiTasksRequeued: naei.status === "fulfilled" ? naei.value.length : "error",
  }));
});
