/**
 * STAGE 2.4B / F-2.4A-02 — X-Forwarded-For edge-behaviour probe (READ-ONLY).
 *
 * Question: does the Railway edge OVERWRITE the client-supplied
 * X-Forwarded-For (official docs) or APPEND to it (community reports)?
 * Under APPEND, the app's clientIpOf() takes the FIRST XFF entry, which the
 * CLIENT controls — rate-limit identity becomes spoofable. Stage 2.4A
 * documented the contradiction but could not test it; this probe settles it
 * empirically against the live edge (the edge is code-independent, so probing
 * the current deployment answers the question for any future deployment
 * behind the same edge).
 *
 * Method (public routes only — zero auth-fail budget consumed; the global
 * per-identity limiter EXPIRES CORRECTLY on both old and new code, so the
 * probe is self-healing within 60 s and leaves no lasting state):
 *   A. 245 GETs /health with XFF: 9.9.9.9 — exhausts whichever identity the
 *      app assigns (expected 429 from ~#241 under the 240/min default)
 *   B. 2 GETs with XFF: 8.8.8.8 — a FRESH fake identity
 *   C. 2 GETs with NO XFF — the sandbox's real edge-assigned identity
 *
 * Interpretation:
 *   B=200 & C=200 -> edge APPENDS (identity spoofable; F-2.4A-02 REAL)
 *   B=429 | C=429 -> edge OVERWRITES (not spoofable in practice; closed)
 *   A never 429s  -> see the OUTCOME note below
 *
 * ACTUAL OUTCOME (2026-11-15, this session): phase A returned 245/245 HTTP
 * 200 — but source inspection of the DEPLOYED code (41092a33) shows it
 * contains NO rate limiter and NO XFF consumer at all (grep: 0 hits for
 * clientIpOf / X-Forwarded / RATE_LIMIT in apps/nexus-api/src/index.ts at
 * that commit). The global limiter and auth-fail lockout exist only in the
 * candidate. There is therefore NO XFF-dependent behaviour deployed today,
 * and the append-vs-overwrite question is UNANSWERABLE against the current
 * deployment in principle — it can only be settled empirically AFTER the
 * candidate is deployed (runbook V-08). No edge behaviour is claimed here;
 * F-2.4A-02 remains UNVERIFIED with the Stage 2.4B global auth-fail backstop
 * as the operative structural mitigation (bounds total failed-auth
 * throughput at 300/min regardless of what the edge does).
 *
 * Total impact: ~250 read-only GETs to /health over ~40 s (all 200), zero
 * lasting state. The run incidentally re-verified the production baseline
 * (healthy, migrations applied: 2 — the old code, as expected).
 */
const BASE = "https://jarvis-nexus-production.up.railway.app";

const get = async (path: string, xff?: string): Promise<{ status: number; retryAfter: string | null; body: string }> => {
  const headers: Record<string, string> = {};
  if (xff !== undefined) headers["X-Forwarded-For"] = xff;
  const r = await fetch(`${BASE}${path}`, { headers });
  return { status: r.status, retryAfter: r.headers.get("Retry-After"), body: (await r.text()).slice(0, 120) };
};

const out: Record<string, unknown> = {
  probe: "F-2.4A-02 XFF edge behaviour",
  startedAt: new Date().toISOString(),
  target: BASE,
  note: "read-only; public routes only; self-healing within 60 s",
};

// control: no XFF, single request
const control = await get("/health");
out.control = { status: control.status };

// Phase A: exhaust the identity budget via a fake XFF
const A_XFF = "9.9.9.9";
let a429At = -1;
let aStatuses = { "200": 0, "429": 0, other: 0 } as Record<string, number>;
let a429RetryAfter: string | null = null;
for (let i = 1; i <= 245; i++) {
  const r = await get("/health", A_XFF);
  const key = String(r.status) === "200" ? "200" : String(r.status) === "429" ? "429" : "other";
  aStatuses[key] = (aStatuses[key] ?? 0) + 1;
  if (r.status === 429 && a429At < 0) { a429At = i; a429RetryAfter = r.retryAfter; }
  if (r.status === 429 && i > 241) break; // exhausted; no need for the rest
}
out.phaseA = { xff: A_XFF, requests: 245, statuses: aStatuses, first429At: a429At, retryAfter: a429RetryAfter };

if (a429At < 0) {
  // Corrected interpretation (2026-11-15): the deployed code (41092a33) has
  // NO rate limiter and NO XFF consumer — 245/245 HTTP 200 is the expected
  // behaviour of that code, and the append-vs-overwrite question cannot be
  // answered against it in principle. Post-deploy runbook V-08 settles it.
  out.verdict = "NOT ANSWERABLE AGAINST THE CURRENT DEPLOYMENT: the live code (41092a33) has no rate limiter and no XFF consumer (source-verified); no edge behaviour is claimed — F-2.4A-02 stays UNVERIFIED, bounded by the Stage 2.4B global auth-fail backstop, settled empirically by runbook V-08 after deploy";
} else {
  // Phase B: a FRESH fake identity
  const b1 = await get("/health", "8.8.8.8");
  const b2 = await get("/health", "8.8.8.8");
  out.phaseB = { xff: "8.8.8.8", statuses: [b1.status, b2.status], retryAfter: b1.retryAfter };
  // Phase C: no XFF at all (the edge-assigned real identity)
  const c1 = await get("/health");
  const c2 = await get("/health");
  out.phaseC = { xff: null, statuses: [c1.status, c2.status], retryAfter: c1.retryAfter };

  const appendHolds = b1.status === 200 && b2.status === 200 && c1.status === 200 && c2.status === 200;
  const overwriteHolds = b1.status === 429 || b2.status === 429 || c1.status === 429 || c2.status === 429;
  out.verdict = appendHolds
    ? "APPEND: the edge preserves the client-supplied XFF first entry — rate-limit identity IS spoofable (F-2.4A-02 confirmed real; the Stage 2.4B global auth-fail backstop is the operative bound)"
    : overwriteHolds
      ? "OVERWRITE: the edge replaces client-supplied XFF — rate-limit identity is NOT spoofable in practice (F-2.4A-02 closed with evidence)"
      : "MIXED/UNEXPECTED: see phases B and C";
}

out.finishedAt = new Date().toISOString();
console.log(JSON.stringify(out, null, 2));
