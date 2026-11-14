/**
 * @nexus/railway — error classification + secret redaction.
 *
 * Railway's public API error semantics (verified against official docs and
 * live behaviour, 2026-11-15):
 *  - HTTP 200 + `errors[]`  -> request executed but something failed
 *                              (INCLUDING authorization failures: "Not Authorized")
 *  - HTTP 400               -> query could not be parsed/validated (contract mismatch)
 *  - HTTP 429               -> rate limit exceeded (Retry-After header)
 *  - network throw          -> transport failure (retryable)
 *
 * No error representation ever embeds credential material.
 */

export type RailwayErrorKind =
  | "AUTH"            // credential rejected, missing, or wrong token type for the query
  | "RATE_LIMIT"      // HTTP 429 / budget floor reached
  | "TIMEOUT"         // request aborted at timeoutMs
  | "NETWORK"         // transport failure (DNS, connection, TLS)
  | "HTTP"            // unexpected HTTP status (5xx, 4xx other than classified)
  | "GRAPHQL"         // HTTP 200 with errors[] (non-auth)
  | "CONTRACT"        // schema drift: field/type rejected by the live schema
  | "BUDGET"          // client-side rate-budget protection refused the call
  | "PERMISSION"      // operation denied by the authorization layer
  | "READ_ONLY"       // mutation refused because read-only mode is active
  | "UNCONFIGURED"    // RAILWAY_API_TOKEN absent — capability degraded, never faked
  | "VALIDATION"      // malformed input (webhook payload, request body)
  | "NOT_FOUND";      // referenced resource absent

const RETRYABLE: ReadonlySet<RailwayErrorKind> = new Set(["TIMEOUT", "NETWORK", "RATE_LIMIT"]);

export class RailwayApiError extends Error {
  readonly kind: RailwayErrorKind;
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly traceId?: string;
  readonly detail?: unknown;

  constructor(init: {
    kind: RailwayErrorKind;
    message: string;
    httpStatus?: number;
    traceId?: string;
    detail?: unknown;
    retryable?: boolean;
  }) {
    super(init.message);
    this.name = "RailwayApiError";
    this.kind = init.kind;
    this.httpStatus = init.httpStatus;
    this.traceId = init.traceId;
    this.detail = init.detail;
    this.retryable = init.retryable ?? RETRYABLE.has(init.kind);
  }

  /** Redacted, structured representation — safe for logs, audit and API responses. */
  toJSON(): Record<string, unknown> {
    return {
      kind: this.kind,
      message: redactSecrets(this.message),
      httpStatus: this.httpStatus,
      traceId: this.traceId,
    };
  }
}

/** Replace anything that looks like a Railway token with a length-only marker. */
export function redactSecrets(text: string): string {
  return text.replace(/rlwy_[A-Za-z0-9_]+/g, "rlwy_<redacted>").replace(/Bearer\s+\S+/g, "Bearer <redacted>");
}

/** Redacted token descriptor: prefix family + length only. Never the value. */
export function redactToken(token: string | undefined): string {
  if (!token) return "<absent>";
  const family = token.slice(0, 9); // "rlwy_wksp" | "rlwy_acc" | ...
  return `${family}<redacted:len=${token.length}>`;
}

export type RailwayResult<T> = { ok: true; value: T } | { ok: false; error: RailwayApiError };
export const railwayOk = <T>(value: T): RailwayResult<T> => ({ ok: true, value });
export const railwayErr = (e: RailwayApiError): RailwayResult<never> => ({ ok: false, error: e });
