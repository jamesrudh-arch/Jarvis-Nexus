/**
 * Railway audit log unit tests — hash-chained, tamper-evident, append-only.
 */
import { describe, expect, test } from "bun:test";
import { NexusDb, migrate } from "@nexus/db";
import { RailwayAuditLog } from "@nexus/railway";

function makeLog() {
  const db = NexusDb.open(":memory:");
  migrate(db);
  return { log: new RailwayAuditLog(db), db, close: () => db.close() };
}

describe("railway audit log (tamper-evident)", () => {
  test("records carry ids, timestamps, categories, severity, evidence, principal, outcome", () => {
    const { log, close } = makeLog();
    const rec = log.record({
      category: "authorized_operation", severity: "info", component: "railway.authorization",
      outcome: "success", resource: "dep-1", principal: "user:owner",
      evidence: { operationId: "railway.deployment.restart", grantId: "g-1" },
    });
    expect(rec.id.startsWith("nexus_aud_")).toBe(true);
    expect(rec.hash).toHaveLength(64);
    expect(rec.prevHash).toBeNull(); // genesis
    const second = log.record({
      category: "verification_outcome", severity: "info", component: "railway.recovery",
      outcome: "success", evidence: { verified: true },
    });
    expect(second.prevHash).toBe(rec.hash); // chained
    close();
  });

  test("chain verification passes on honest history", () => {
    const { log, close } = makeLog();
    for (let i = 0; i < 5; i++) {
      log.record({ category: "webhook", severity: "info", component: "railway.webhook", outcome: "success", evidence: { i } });
    }
    const v = log.verify();
    expect(v.valid).toBe(true);
    expect(v.checked).toBe(5);
    close();
  });

  test("TAMPERING with a record's content is detected (hash mismatch)", () => {
    const { log, db, close } = makeLog();
    log.record({ category: "authorized_operation", severity: "info", component: "c", outcome: "success", evidence: { action: "restart deployment dep-1" } });
    log.record({ category: "verification_outcome", severity: "info", component: "c", outcome: "success", evidence: { verified: true } });
    // attacker modifies evidence AFTER the fact via raw SQL (no repo API allows this)
    db.run("UPDATE railway_audit SET evidence = ? WHERE seq = 1", JSON.stringify({ action: "nothing suspicious" }));
    const v = log.verify();
    expect(v.valid).toBe(false);
    expect(v.firstBreak?.reason).toContain("hash mismatch");
    close();
  });

  test("DELETING a record is detected (chain break)", () => {
    const { log, db, close } = makeLog();
    for (let i = 0; i < 3; i++) {
      log.record({ category: "api_failure", severity: "warning", component: "c", outcome: "failure", evidence: { i } });
    }
    db.run("DELETE FROM railway_audit WHERE seq = 2");
    const v = log.verify();
    expect(v.valid).toBe(false);
    expect(v.firstBreak?.reason).toContain("prev_hash chain broken");
    close();
  });

  test("credential material can never enter evidence (redaction at write time)", () => {
    const { log, close } = makeLog();
    const rec = log.record({
      category: "auth_failure", severity: "warning", component: "railway.client",
      outcome: "failure", evidence: { detail: "token rlwy_wksp_secretsecretsecretsecret123 rejected" },
    });
    expect(JSON.stringify(rec.evidence).includes("rlwy_wksp_secretsecret")).toBe(false);
    expect(JSON.stringify(rec.evidence).includes("rlwy_<redacted>")).toBe(true);
    close();
  });
});
