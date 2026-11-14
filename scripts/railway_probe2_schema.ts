/**
 * Read-only Railway API probe #2 (Phase 5):
 *  1. Full schema introspection -> saved as versioned contract snapshot (1 request).
 *  2. Real project discovery (1 request).
 *  3. Platform status (1 request).
 *  4. Auth-failure classification for previous + garbage tokens using a VALID query (2 requests).
 * Total: 5 requests (rate-limit frugal). Never prints token values.
 * Usage: bun scripts/railway_probe2_schema.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";

const ENDPOINT = "https://backboard.railway.com/graphql/v2";
const token = process.env.RAILWAY_API_TOKEN;
const prev = process.env.RAILWAY_API_TOKEN_PREVIOUS;
if (!token) { console.error("RAILWAY_API_TOKEN missing"); process.exit(1); }

const TYPE_REF = "type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } }";
const FULL_INTROSPECTION = `query Introspection {
  __schema {
    types {
      kind name
      fields(includeDeprecated: true) { name isDeprecated deprecationReason args { name ${TYPE_REF} } ${TYPE_REF} }
      inputFields { name ${TYPE_REF} }
      interfaces { kind name }
      enumValues(includeDeprecated: true) { name isDeprecated }
      possibleTypes { kind name }
    }
  }
}`;

interface GqlResult { status: number; body: any; ms: number; headers: Record<string, string | null> }

async function gql(query: string, variables: Record<string, unknown> = {}, tok: string): Promise<GqlResult> {
  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body: any = await res.json().catch(() => null);
  return {
    status: res.status, body, ms: Date.now() - started,
    headers: {
      rateLimitPolicy: res.headers.get("ratelimit-policy"),
      limit: res.headers.get("x-ratelimit-limit"),
      remaining: res.headers.get("x-ratelimit-remaining"),
      reset: res.headers.get("x-ratelimit-reset"),
    },
  };
}

function errorsOf(r: GqlResult): string[] {
  return (r.body?.errors ?? []).map((e: any) => String(e?.message ?? e).slice(0, 160));
}

async function main() {
  const out: any = { checks: [] };

  // 1) Full schema introspection — the real contract, assume nothing.
  const intro = await gql(FULL_INTROSPECTION, {}, token);
  const types: any[] = intro.body?.data?.__schema?.types ?? [];
  const objectTypes = types.filter((t) => t.kind === "OBJECT" && !t.name?.startsWith("__")).length;
  const mutations = types.find((t) => t.name === "Mutation")?.fields?.map((f: any) => f.name) ?? [];
  const queries = types.find((t) => t.name === "Query")?.fields?.map((f: any) => f.name) ?? [];
  out.checks.push({ check: "full_introspection", httpStatus: intro.status, ms: intro.ms, rate: intro.headers, objectTypes, queryCount: queries.length, mutationCount: mutations.length, errors: errorsOf(intro) });
  if (types.length > 0) {
    mkdirSync("data/railway", { recursive: true });
    writeFileSync("data/railway/schema_full_snapshot.json", JSON.stringify({ capturedAt: new Date().toISOString(), endpoint: ENDPOINT, schema: intro.body.data.__schema }, null, 1));
    out.checks[0].savedTo = "data/railway/schema_full_snapshot.json";
  }

  // 2) Real project discovery.
  const projects = await gql("{ projects { edges { node { id name } pageInfo { hasNextPage } } } }", {}, token);
  out.checks.push({ check: "projects", httpStatus: projects.status, ms: projects.ms, rate: projects.headers, errors: errorsOf(projects), data: projects.body?.data ?? null });

  // 3) Platform status.
  const platform = await gql("{ platformStatus { status components { name status } } }", {}, token);
  out.checks.push({ check: "platformStatus", httpStatus: platform.status, ms: platform.ms, rate: platform.headers, errors: errorsOf(platform), data: platform.body?.data ?? null });

  // 4) Auth-failure classification with a VALID query (the earlier probe used a
  //    non-existent field, which validated before authorizing — lesson learned).
  const VALID = "{ projects { edges { node { id } } } }";
  if (prev) {
    const p = await gql(VALID, {}, prev);
    out.checks.push({ check: "previous_token", httpStatus: p.status, ms: p.ms, classification: p.status === 200 && (p.body?.data ?? null) !== null ? "STILL_VALID (rotation incomplete — security finding)" : "REJECTED", errors: errorsOf(p) });
  }
  const g = await gql(VALID, {}, "rlwy_invalid_token_probe_0000000000000000000000");
  out.checks.push({ check: "garbage_token", httpStatus: g.status, classification: g.status === 401 || g.status === 403 || ((g.body?.errors ?? []).length > 0 && !g.body?.data?.projects) ? "REJECTED" : "UNEXPECTED", errors: errorsOf(g) });

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(JSON.stringify({ fatal: String(e).slice(0, 400) })); process.exit(1); });
