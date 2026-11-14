/**
 * Read-only live Railway API validation probe (Phase 5).
 * - Never prints token values (only lengths/status codes).
 * - Only executes queries (no mutations).
 * Usage: bun scripts/railway_live_probe.ts
 */
const ENDPOINT = "https://backboard.railway.com/graphql/v2";

function pick(name: string): string | undefined {
  return process.env[name];
}

async function gql(
  query: string,
  variables: Record<string, unknown> = {},
  token: string,
): Promise<{ status: number; body: any; ms: number }> {
  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body, ms: Date.now() - started };
}

function classify(status: number, body: any): string {
  const errors: any[] = body?.errors ?? [];
  if (status === 401 || status === 403) return "AUTH_REJECTED";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  if (errors.length > 0) return `GRAPHQL_ERROR: ${String(errors[0]?.message ?? "").slice(0, 120)}`;
  if (body?.data) return "OK";
  return "UNEXPECTED";
}

async function main() {
  const token = pick("RAILWAY_API_TOKEN");
  const prev = pick("RAILWAY_API_TOKEN_PREVIOUS");
  const out: any = { endpoint: ENDPOINT, tokenPresent: Boolean(token), tokenLen: token?.length, prevTokenPresent: Boolean(prev), prevTokenLen: prev?.length, checks: [] };

  if (!token) { console.log(JSON.stringify({ ...out, fatal: "RAILWAY_API_TOKEN not set" }, null, 2)); process.exit(1); }

  // 1) Root query-field introspection — discover the real contract, assume nothing.
  const intro = await gql("{ __schema { queryType { fields { name } } } }", {}, token);
  const rootFields: string[] = (intro.body?.data?.__schema?.queryType?.fields ?? []).map((f: any) => f.name).sort();
  out.checks.push({ check: "introspection", httpStatus: intro.status, ms: intro.ms, classification: classify(intro.status, intro.body), rootQueryFields: rootFields });

  // 2) Auth + identity. Try `me`, then `workspaces` (workspace tokens may differ).
  for (const q of [
    "{ me { id name } }",
    "{ workspaces { id name } }",
  ]) {
    const r = await gql(q, {}, token);
    out.checks.push({ check: `identity:${q.slice(0, 24)}`, httpStatus: r.status, ms: r.ms, classification: classify(r.status, r.body), data: r.body?.data ?? r.body?.errors?.[0]?.message ?? null });
  }

  // 3) Previous token — expect rejection (rotation evidence). Never print value.
  if (prev) {
    const r = await gql("{ workspaces { id } }", {}, prev);
    out.checks.push({ check: "previous_token_status", httpStatus: r.status, ms: r.ms, classification: classify(r.status, r.body), note: "expect AUTH_REJECTED if rotated/revoked" });
  }

  // 4) Garbage token — authentication failure detection without secrets.
  const r2 = await gql("{ workspaces { id } }", {}, "rlwy_invalid_token_probe_0000000000000000000000");
  out.checks.push({ check: "invalid_token_probe", httpStatus: r2.status, ms: r2.ms, classification: classify(r2.status, r2.body) });

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(JSON.stringify({ fatal: String(e).slice(0, 300) })); process.exit(1); });
