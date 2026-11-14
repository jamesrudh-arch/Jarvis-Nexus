/**
 * Railway credential management unit tests (no network).
 */
import { describe, expect, test } from "bun:test";
import { CredentialManager, isValidTokenFormat } from "@nexus/railway";

const WS = "rlwy_wksp_mocktoken_mocktoken_mocktoken1234";
const PROJ = "rlwy_proj_mocktoken_mocktoken_mocktoken123";

describe("railway credentials", () => {
  test("format validation accepts real-shaped tokens and rejects junk", () => {
    expect(isValidTokenFormat(WS)).toBe(true);
    expect(isValidTokenFormat(PROJ)).toBe(true);
    expect(isValidTokenFormat("ghp_notarailwaytoken000000000000000")).toBe(false);
    expect(isValidTokenFormat("rlwy_short")).toBe(false);
    expect(isValidTokenFormat("")).toBe(false);
  });

  test("token type detection: workspace vs project", () => {
    const ws = new CredentialManager({ RAILWAY_API_TOKEN: WS });
    expect(ws.status().tokenType).toBe("workspace");
    expect(ws.status().authHeader).toBe("authorization");
    const proj = new CredentialManager({ RAILWAY_API_TOKEN: PROJ });
    expect(proj.status().tokenType).toBe("project");
    expect(proj.status().authHeader).toBe("project-access-token");
  });

  test("redaction exposes prefix family + length only, never the value", () => {
    const c = new CredentialManager({ RAILWAY_API_TOKEN: WS });
    const redacted = c.status().redacted;
    expect(redacted.includes(WS)).toBe(false);
    expect(redacted.startsWith("rlwy_wksp")).toBe(true);
    expect(redacted.includes("len=43")).toBe(true);
  });

  test("rotation: valid new token becomes active, old demoted to previous", () => {
    const c = new CredentialManager({ RAILWAY_API_TOKEN: WS });
    const r = c.rotate("rlwy_wksp_rotated_rotated_rotated_0000001");
    expect(r.ok).toBe(true);
    const active = c.getActiveToken();
    expect(active.ok).toBe(true);
    if (active.ok) expect(active.value).not.toBe(WS);
    expect(c.getPreviousToken()).toBe(WS);
    expect(c.fullStatus().previous?.redacted.includes("rlwy_wksp")).toBe(true);
  });

  test("rotation rejects malformed tokens", () => {
    const c = new CredentialManager({ RAILWAY_API_TOKEN: WS });
    const r = c.rotate("not-a-token");
    expect(r.ok).toBe(false);
    const active = c.getActiveToken();
    if (active.ok) expect(active.value).toBe(WS); // unchanged
  });

  test("unconfigured status is explicit and never healthy-looking", () => {
    const c = new CredentialManager({});
    expect(c.status().configured).toBe(false);
    const missing = c.getActiveToken();
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.kind).toBe("UNCONFIGURED");
  });
});
