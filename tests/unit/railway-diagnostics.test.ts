/**
 * Railway diagnostics unit tests — the 14-step investigation workflow with a
 * MOCKED transport. Cause classification must be evidence-backed; speculation
 * is never presented as fact; recommendations carry permission levels.
 */
import { describe, expect, test } from "bun:test";
import { createRailwayMock, MOCK } from "../helpers/railway-mocks";
import { CONFIDENCE_SCALE } from "@nexus/railway";

describe("railway diagnostics (mocked transport)", () => {
  test("Scenario A shape: failed deployment + error logs -> CONFIRMED cause with log evidence and L3 recommendations", async () => {
    const mock = createRailwayMock({ dataset: { latestDeploymentStatus: "FAILED", historyStatuses: ["FAILED", "SUCCESS"] } });
    const r = await mock.intel.diagnostics.investigate({ kind: "deployment_failure", resourceIds: [MOCK.failedDeploymentId] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const inv = r.value;
      expect(inv.status).toBe("complete");
      expect(inv.causeClassification).toBe("CONFIRMED");
      expect(inv.confidence).toBe(CONFIDENCE_SCALE.CONFIRMED);
      expect(inv.rootCause).toContain("failed");
      // log evidence captured
      expect(inv.evidence.some((e) => e.source === "deployment_logs" && JSON.stringify(e.data).includes("error"))).toBe(true);
      // deployment lifecycle evidence
      expect(inv.evidence.some((e) => e.source === "deployment_events")).toBe(true);
      // recommendations carry registered operations with permission levels
      const rollback = inv.recommendations.find((rec) => rec.operationId === "railway.deployment.rollback");
      expect(rollback).toBeDefined();
      expect(rollback!.requiredLevel).toBe("L3");
      const redeploy = inv.recommendations.find((rec) => rec.operationId === "railway.deployment.redeploy");
      expect(redeploy).toBeDefined();
      // impact mentions the public domain
      expect(inv.impact).toContain(MOCK.domain);
      // persisted + audited
      expect(mock.intel.diagnostics.getInvestigation(inv.id)?.id).toBe(inv.id);
      expect(mock.intel.audit.query({ category: "root_cause" }).length).toBe(1);
    }
    mock.close();
  });

  test("Scenario B shape: successful deployment + unhealthy app -> PROBABLE runtime failure (dimensions stay independent)", async () => {
    const mock = createRailwayMock({ dataset: { latestDeploymentStatus: "SUCCESS", historyStatuses: ["SUCCESS"], appHealthStatus: 503 } });
    const r = await mock.intel.diagnostics.investigate({ kind: "app_outage", resourceIds: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.causeClassification).toBe("PROBABLE");
      expect(r.value.rootCause).toContain("runtime");
      // app health evidence recorded
      expect(r.value.evidence.some((e) => e.source === "application_health")).toBe(true);
      // rollback recommendation present (suspect regression)
      expect(r.value.recommendations.some((rec) => rec.operationId === "railway.deployment.rollback")).toBe(true);
    }
    mock.close();
  });

  test("credential_failure trigger -> CONFIRMED credential diagnosis with owner-only rotation guidance", async () => {
    const mock = createRailwayMock();
    const r = await mock.intel.diagnostics.investigate({ kind: "credential_failure", resourceIds: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.causeClassification).toBe("CONFIRMED");
      expect(r.value.rootCause).toContain("credential");
      const rotation = r.value.recommendations.find((rec) => rec.action.includes("Rotate"));
      expect(rotation).toBeDefined();
      expect(rotation!.requiredLevel).toBe("L4"); // agents never rotate credentials
    }
    mock.close();
  });

  test("no failure evidence -> UNKNOWN with honest 'no classification' framing", async () => {
    const mock = createRailwayMock({ dataset: { latestDeploymentStatus: "SUCCESS", historyStatuses: ["SUCCESS"], appHealthStatus: 200 } });
    const r = await mock.intel.diagnostics.investigate({ kind: "manual", resourceIds: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.causeClassification).toBe("UNKNOWN");
      expect(r.value.rootCause).toBeUndefined();
      expect(r.value.recommendations[0]!.action).toContain("Continue monitoring");
    }
    mock.close();
  });

  test("investigations are recorded in memory scope via the remember hook (JARVIS integration)", async () => {
    const remembered: Array<{ title: string }> = [];
    const mock = createRailwayMock({ dataset: { latestDeploymentStatus: "FAILED" } });
    // simulate the memory hook the app wires in
    const origRemember = (mock.intel.diagnostics as unknown as { deps: { remember?: (m: { title: string }) => void } }).deps;
    origRemember.remember = (m) => remembered.push(m);
    await mock.intel.diagnostics.investigate({ kind: "deployment_failure", resourceIds: [] });
    expect(remembered.length).toBe(1);
    expect(remembered[0]!.title).toContain("Railway diagnosis");
    mock.close();
  });
});
