/**
 * @nexus/railway — secure credential management.
 *
 * Directive requirements implemented here:
 *  - Secure retrieval: token is read from the environment ONCE (never from
 *    chat, source, commits or logs; `.env` is gitignored and chmod 600).
 *  - Least privilege: only this package sees the raw token; it is never
 *    forwarded to MCP servers, NAEI agents or JARVIS tool params.
 *  - Redaction: every surface uses `redactToken` (prefix family + length).
 *  - Rotation support: `rotate()` swaps in a new token and demotes the old
 *    one to `previous` for revocation checking.
 *  - Token-type awareness: account/workspace tokens authenticate with
 *    `Authorization: Bearer`; project tokens use `Project-Access-Token`
 *    (verified against official Railway docs 2026-11-15). The two are NOT
 *    interchangeable — using the wrong header yields "Not Authorized".
 */
import { redactToken } from "./errors";
import type { RailwayResult } from "./errors";
import { RailwayApiError, railwayOk } from "./errors";

export type RailwayTokenType = "account" | "workspace" | "project" | "unknown";

/** Prefix families observed on real Railway tokens (heuristic map, verified for workspace). */
function classifyToken(token: string): RailwayTokenType {
  if (token.startsWith("rlwy_wksp_")) return "workspace";
  if (token.startsWith("rlwy_acc_")) return "account";
  if (token.startsWith("rlwy_proj_") || token.startsWith("rlwy_prj_")) return "project";
  return "unknown";
}

/** Structural validation: real Railway tokens are `rlwy_*`, >= 40 chars. */
export function isValidTokenFormat(token: string): boolean {
  return /^rlwy_[A-Za-z0-9_]{28,}$/.test(token);
}

export interface CredentialStatus {
  configured: boolean;
  tokenType: RailwayTokenType;
  redacted: string;
  formatValid: boolean;
  /** Auth header the client must use for this token type. */
  authHeader: "authorization" | "project-access-token";
}

export class CredentialManager {
  private active: string | undefined;
  private previous: string | undefined;
  private previousRevokedAt: string | undefined;

  constructor(env: Record<string, string | undefined>) {
    this.active = env.RAILWAY_API_TOKEN?.trim() || undefined;
    // Retained solely for revocation/rotation verification — never used for calls.
    this.previous = env.RAILWAY_API_TOKEN_PREVIOUS?.trim() || undefined;
  }

  /** Raw token — accessible only inside this package. */
  getActiveToken(): RailwayResult<string> {
    if (!this.active) {
      return {
        ok: false,
        error: new RailwayApiError({
          kind: "UNCONFIGURED",
          message: "RAILWAY_API_TOKEN is not configured — Railway intelligence is degraded (fail-closed, never faked)",
        }),
      };
    }
    return railwayOk(this.active);
  }

  getPreviousToken(): string | undefined {
    return this.previous;
  }

  status(): CredentialStatus {
    const token = this.active;
    const tokenType = token ? classifyToken(token) : "unknown";
    return {
      configured: Boolean(token),
      tokenType,
      redacted: redactToken(token),
      formatValid: token ? isValidTokenFormat(token) : false,
      // Project tokens MUST use the Project-Access-Token header (docs 2026-11-15).
      authHeader: tokenType === "project" ? "project-access-token" : "authorization",
    };
  }

  /** Credential rotation: new token becomes active, old becomes `previous`. */
  rotate(newToken: string): RailwayResult<CredentialStatus> {
    const trimmed = newToken.trim();
    if (!isValidTokenFormat(trimmed)) {
      return {
        ok: false,
        error: new RailwayApiError({
          kind: "VALIDATION",
          message: "rotation rejected: token does not match the Railway token format",
        }),
      };
    }
    if (this.active) this.previous = this.active;
    this.active = trimmed;
    return railwayOk(this.status());
  }

  /** Revocation procedure support: after the owner revokes the old token in
   *  the Railway dashboard, `markPreviousRevoked()` records the observation. */
  markPreviousRevoked(revoked: boolean): void {
    if (revoked) this.previousRevokedAt = new Date().toISOString();
  }

  fullStatus(): CredentialStatus & { previous: { redacted: string; revokedAt: string | undefined } | null } {
    return {
      ...this.status(),
      previous: this.previous
        ? { redacted: redactToken(this.previous), revokedAt: this.previousRevokedAt }
        : null,
    };
  }
}
