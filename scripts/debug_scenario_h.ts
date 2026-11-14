import { createRailwayMock, MOCK } from "../tests/helpers/railway-mocks";
const mock = createRailwayMock({ readOnly: false, dataset: { latestDeploymentStatus: "FAILED", historyStatuses: ["FAILED", "SUCCESS"] } });
console.log("mode:", mock.intel.mode, "readOnly:", mock.intel.authorization.isReadOnly());
const inv = await mock.intel.diagnostics.investigate({ kind: "deployment_failure", resourceIds: [MOCK.failedDeploymentId] });
if (!inv.ok) { console.log("INVESTIGATE FAILED:", inv.error.toJSON()); process.exit(1); }
const plan = mock.intel.recovery.createPlan(inv.value);
if (!plan.ok) { console.log("PLAN FAILED:", plan.error.toJSON()); process.exit(1); }
console.log("plan step:", JSON.stringify(plan.value.step, null, 1));
const decision = mock.intel.authorization.requestAuthorization({
  operationId: plan.value.step.operationId, resourceIds: plan.value.step.resourceIds,
  scope: `recovery plan ${plan.value.id}`, principal: { type: "user", id: "owner" },
});
console.log("owner decision:", JSON.stringify(decision, null, 1));
mock.close();
