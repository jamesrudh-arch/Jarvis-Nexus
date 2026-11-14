/**
 * Server-side client for the authoritative NEXUS API (Hono backend).
 *
 * Stage 2 Phase 5 V2: the backend is the SINGLE SOURCE OF TRUTH. The visual
 * application's API routes are thin adapters over this client — no duplicate
 * client-side simulation state.
 *
 * Security: OWNER_KEY lives ONLY in server env (never NEXT_PUBLIC_*, never
 * sent to the browser). Public reads need no key; consequential writes are
 * owner-authenticated here, server-to-server.
 */

const API_URL = (process.env.NEXUS_API_URL ?? "https://jarvis-nexus-production.up.railway.app").replace(/\/$/, "");
const OWNER_KEY = process.env.OWNER_KEY ?? "";

export class BackendError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { owner?: boolean } = {}): Promise<T> {
  const { owner, ...rest } = init;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Correlation-Id": crypto.randomUUID(),
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (owner) {
    if (!OWNER_KEY) {
      throw new BackendError("owner key not configured on the visual-app server (OWNER_KEY env)", 503);
    }
    headers.Authorization = `Bearer ${OWNER_KEY}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (body as { error?: string | { message?: string } }).error;
    const detail = typeof message === "string" ? message : message?.message ?? `HTTP ${res.status}`;
    throw new BackendError(detail, res.status);
  }
  return body as T;
}

export const backend = {
  get: <T>(path: string) => call<T>(path),
  post: <T>(path: string, body?: unknown, opts: { owner?: boolean } = {}) =>
    call<T>(path, { method: "POST", body: JSON.stringify(body ?? {}), owner: opts.owner }),
  apiUrl: API_URL,
};

/** Backend response envelope: most routes return { data: ... }. */
export interface Envelope<T> { data: T }
