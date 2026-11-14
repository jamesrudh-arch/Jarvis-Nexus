/**
 * registry-validate.ts — consistency checks for the machine-readable
 * registries (directive §16): schema validity, dependency references,
 * evidence presence for VERIFIED requirements, ledger/requirement linkage.
 */
import requirements from "../registry/requirements.json";
import technologies from "../registry/technologies.json";
import ledger from "../registry/ledger.json";

const errors: string[] = [];
const warn: string[] = [];

// requirements -----------------------------------------------------------------
const reqs = requirements.requirements;
const ids = new Set(reqs.map((r) => r.id));
if (ids.size !== reqs.length) errors.push("requirements.json: duplicate ids");

const STATUSES = new Set(["DISCOVERED", "SPECIFIED", "DESIGNED", "IMPLEMENTING", "INTEGRATING", "TESTING", "REPAIRING", "VERIFIED", "DEPLOYED", "BLOCKED"]);
const reqSchema = (r: (typeof reqs)[number]) => {
  if (!r.id || !r.product || !r.directive || !r.title || !r.behaviour) errors.push(`${r.id}: missing core fields`);
  if (!STATUSES.has(r.status)) errors.push(`${r.id}: invalid status ${r.status}`);
  for (const dep of r.dependsOn) if (!ids.has(dep)) errors.push(`${r.id}: unknown dependency ${dep}`);
  if (r.status === "VERIFIED" && r.evidence.length === 0) errors.push(`${r.id}: VERIFIED without evidence`);
  if (r.status === "BLOCKED") {
    if (!r.blockedBy) errors.push(`${r.id}: BLOCKED without blockedBy reason`);
    // directive §20: five-point documentation — never a bare BLOCKED
    const b = r.blocker as { limitation?: string; technicalEvidence?: string; minimumAdditionalCapability?: string; continuesIndependently?: string } | undefined;
    if (!b || !b.limitation || !b.technicalEvidence || !b.minimumAdditionalCapability || !b.continuesIndependently) {
      errors.push(`${r.id}: BLOCKED without 4-point blocker documentation {limitation, technicalEvidence, minimumAdditionalCapability, continuesIndependently} (directive §20)`);
    }
  }
  if (r.status === "BLOCKED" && r.evidence.length > 0) warn.push(`${r.id}: BLOCKED but carries evidence (documentation-only is fine)`);
};

// technologies -------------------------------------------------------------------
const techIds = new Set(technologies.records.map((t) => t.id));
for (const t of technologies.records) {
  if (!t.name || !t.category || !t.decision || !t.decisionRationale) errors.push(`technologies.json ${t.id}: missing core fields`);
}

// ledger ---------------------------------------------------------------------------
const DECISIONS = new Set(["CANDIDATE", "ASSESSING", "ADOPTED", "ADAPTED", "EXTRACTED", "REJECTED", "PENDING_ENVIRONMENT"]);
for (const t of technologies.records) if (!DECISIONS.has(t.decision)) errors.push(`technologies.json ${t.id}: invalid decision ${t.decision}`);
const ledgerTaskIds = new Set<string>();
for (const t of ledger.tasks) {
  if (ledgerTaskIds.has(t.taskId)) errors.push(`ledger.json: duplicate taskId ${t.taskId}`);
  ledgerTaskIds.add(t.taskId);
  for (const rid of t.requirementIds) if (!ids.has(rid)) errors.push(`ledger ${t.taskId}: unknown requirement ${rid}`);
}
// every requirement should be touched by some ledger task or explicitly deferred
const covered = new Set(ledger.tasks.flatMap((t) => t.requirementIds));
for (const r of reqs) if (!covered.has(r.id)) warn.push(`requirement ${r.id} not referenced by any ledger task`);

reqs.forEach(reqSchema);

const summary = {
  requirements: {
    total: reqs.length,
    byStatus: reqs.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {}),
  },
  technologies: { total: technologies.records.length, byDecision: technologies.records.reduce<Record<string, number>>((acc, t) => { acc[t.decision] = (acc[t.decision] ?? 0) + 1; return acc; }, {}) },
  ledgerTasks: ledger.tasks.length,
};

console.log(JSON.stringify(summary, null, 2));
if (warn.length) console.log("WARNINGS:\n" + warn.join("\n"));
if (errors.length) {
  console.error("REGISTRY INVALID:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("registries consistent ✔");
