/**
 * Railway authorization unit tests — the L1-L4 permission model.
 * Invariants: agents never granted; single-use scoped grants; expiry;
 * read-only mode blocks everything; every decision audited.
 */
import { describe, expect, test } from "bun:test";
import { NexusDb, migrate } from "@nexus/db";
import { AuthorizationService, RailwayAuditLog, RailwayStateRepo, OPERATIONS } from "@nexus/railway";

function makeService(readOnly: boolean, now: () => number = () => FIXED_NOW) {
  const db = NexusDb.open(":memory:");
  migrate(db);
  const audit = new RailwayAuditLog(db);
  const state = new RailwayStateRepo(db);
  const service = new AuthorizationService({ audit, state, now }, { readOnly });
  return { service, audit, state, db, close: () => db.close() };
}

const FIXED_NOW = Date.parse("2026-11-15T12:00:00Z");

describe("railway authorization (L1-L4 permission model)", () => {
  test("operation registry covers the directive's protected operation classes", () => {
    const ids = OPERATIONS.map((o) => o.id);
    for (const expected of [
      "railway.deployment.restart", "railway.deployment.redeploy", "railway.deployment.rollback",
      "railway.deployment.remove", "railway.service.redeploy", "railway.variable.upsert",
      "railway.volume.backup.restore", "railway.domain.create", "railway.project.delete",
      "railway.usage.limit.remove",
    ]) {
      expect(ids.includes(expected)).toBe(true);
    }
    // destructive ops are L4
    expect(OPERATIONS.find((o) => o.id === "railway.deployment.remove")!.level).toBe("L4");
    expect(OPERATIONS.find((o) => o.id === "railway.volume.backup.restore")!.level).toBe("L4");
    // env var mutation is registered but NOT executable in v1 (honestly declared)
    expect(OPERATIONS.find((o) => o.id === "railway.variable.upsert")!.executable).toBe(false);
  });

  test("AGENT principals are NEVER granted — an agent's approval is not owner authorization", () => {
    const { service, audit, close } = makeService(false);
    const decision = service.requestAuthorization({
      operationId: "railway.deployment.restart",
      resourceIds: ["dep-1"], scope: "restart failed deployment",
      principal: { type: "agent", id: "jarvis" },
    });
    expect(decision.granted).toBe(false);
    expect(decision.reason).toContain("agent principals can never be granted");
    // the denial is audited
    const denials = audit.query({ category: "authorized_operation" });
    expect(denials.length).toBe(1);
    expect(denials[0]!.outcome).toBe("rejected");
    close();
  });

  test("non-owner user principals are denied", () => {
    const { service, close } = makeService(false);
    const decision = service.requestAuthorization({
      operationId: "railway.deployment.restart", resourceIds: ["dep-1"], scope: "x",
      principal: { type: "user", id: "someone-else" },
    });
    expect(decision.granted).toBe(false);
    close();
  });

  test("READ-ONLY mode (default) refuses every mutation even for the owner", () => {
    const { service, close } = makeService(true);
    const decision = service.requestAuthorization({
      operationId: "railway.deployment.restart", resourceIds: ["dep-1"], scope: "restart",
      principal: { type: "user", id: "owner" },
    });
    expect(decision.granted).toBe(false);
    expect(decision.reason).toContain("READ-ONLY");
    close();
  });

  test("owner grant is issued, single-use, scoped and expiring", () => {
    let now = FIXED_NOW;
    const { service, close } = makeService(false, () => now);
    const decision = service.requestAuthorization({
      operationId: "railway.deployment.rollback", resourceIds: ["dep-1", "dep-2"],
      scope: "rollback to last successful deployment", justification: "recovery plan nexus_plan_1",
      principal: { type: "user", id: "owner" },
    });
    expect(decision.granted).toBe(true);
    expect(decision.grantId).toBeDefined();

    // consume with the right op + resources
    const grantId = decision.grantId!;
    const consumed = service.consumeGrant(grantId, "railway.deployment.rollback", ["dep-1", "dep-2"]);
    expect(consumed.ok).toBe(true);

    // single-use: second consumption rejected
    const again = service.consumeGrant(grantId, "railway.deployment.rollback", ["dep-1", "dep-2"]);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toContain("single-use");

    // scope: a grant for dep-1 does not cover dep-9
    const other = service.requestAuthorization({
      operationId: "railway.deployment.rollback", resourceIds: ["dep-1"], scope: "x",
      principal: { type: "user", id: "owner" },
    });
    expect(other.granted).toBe(true);
    const wrongResource = service.consumeGrant(other.grantId!, "railway.deployment.rollback", ["dep-9"]);
    expect(wrongResource.ok).toBe(false);

    // expiry after 15 minutes
    const third = service.requestAuthorization({
      operationId: "railway.deployment.rollback", resourceIds: ["dep-3"], scope: "x",
      principal: { type: "user", id: "owner" },
    });
    expect(third.granted).toBe(true);
    now = FIXED_NOW + 16 * 60 * 1000; // 16 minutes later
    const expired = service.consumeGrant(third.grantId!, "railway.deployment.rollback", ["dep-3"]);
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error.message).toContain("expired");
    close();
  });

  test("non-executable registered operations are denied with an honest reason", () => {
    const { service, close } = makeService(false);
    const decision = service.requestAuthorization({
      operationId: "railway.variable.upsert", resourceIds: ["svc-1"], scope: "set FOO",
      principal: { type: "user", id: "owner" },
    });
    expect(decision.granted).toBe(false);
    expect(decision.reason).toContain("not executable in this version");
    close();
  });
});
