/**
 * Railway API contract tests (versioned, offline).
 *  - declared query dependencies must be covered by the committed baseline
 *  - secret-bearing queries must not exist
 *  - drift diff logic (BREAKING / WARNING / INFO)
 */
import { describe, expect, test } from "bun:test";
import { queries, checkUsedFieldsAgainstBaseline, diffContract, CONTRACT_BASELINE, contractIsCompatible } from "@nexus/railway";
import type { LiveFields } from "@nexus/railway";

describe("railway API contract (versioned, offline)", () => {
  test("every field our queries depend on exists in the committed live-schema baseline", () => {
    const check = checkUsedFieldsAgainstBaseline();
    expect(check.violations).toEqual([]);
    expect(check.ok).toBe(true);
  });

  test("baseline provenance: captured from the live endpoint with introspection evidence", () => {
    expect(CONTRACT_BASELINE.endpoint).toBe("https://backboard.railway.com/graphql/v2");
    expect(Object.keys(CONTRACT_BASELINE.types).length).toBeGreaterThan(30);
    expect(CONTRACT_BASELINE.enums["DeploymentStatus"]).toContain("SUCCESS");
    expect(CONTRACT_BASELINE.enums["DeploymentStatus"]).toContain("FAILED");
  });

  test("SECURITY: no query document fetches variable VALUES (secrets)", () => {
    const all = Object.values(queries as unknown as Record<string, string>).join("\n");
    expect(all.includes("variables(environmentId")).toBe(false);
    expect(all.includes("unrendered")).toBe(false);
  });

  test("drift detection: removed field is BREAKING, deprecation is WARNING, addition is INFO", () => {
    const baselineTypes = Object.keys(CONTRACT_BASELINE.types);
    const probeType = baselineTypes.find((t) => t !== "Query" && t !== "Mutation")!;
    const base = CONTRACT_BASELINE.types[probeType]!;
    const baseFields = Object.keys(base.fields);
    expect(baseFields.length).toBeGreaterThan(0);

    const live: LiveFields = {};
    for (const [t, spec] of Object.entries(CONTRACT_BASELINE.types)) {
      live[t] = Object.fromEntries(Object.keys(spec.fields).map((f) => [f, false]));
    }
    // remove one field -> BREAKING
    delete live[probeType]![baseFields[0]!];
    // deprecate another -> WARNING
    live[probeType]![baseFields[1]!] = true;
    // add a new one -> INFO
    live[probeType]!["brandNewField"] = false;

    const drifts = diffContract(live);
    expect(drifts.some((d) => d.type === "field_removed" && d.field === baseFields[0] && d.severity === "BREAKING")).toBe(true);
    expect(drifts.some((d) => d.type === "field_deprecated" && d.field === baseFields[1] && d.severity === "WARNING")).toBe(true);
    expect(drifts.some((d) => d.type === "field_added" && d.field === "brandNewField" && d.severity === "INFO")).toBe(true);
    expect(contractIsCompatible(drifts)).toBe(false); // BREAKING present
  });

  test("drift detection: identical live schema is compatible (no drift)", () => {
    const live: LiveFields = {};
    for (const [t, spec] of Object.entries(CONTRACT_BASELINE.types)) {
      live[t] = Object.fromEntries(Object.keys(spec.fields).map((f) => [f, false]));
    }
    const drifts = diffContract(live);
    expect(drifts.filter((d) => d.severity !== "INFO")).toEqual([]);
    expect(contractIsCompatible(drifts)).toBe(true);
  });

  test("drift detection: a whole type disappearing is BREAKING", () => {
    const live: LiveFields = {};
    for (const [t, spec] of Object.entries(CONTRACT_BASELINE.types)) {
      live[t] = Object.fromEntries(Object.keys(spec.fields).map((f) => [f, false]));
    }
    delete live["Deployment"];
    const drifts = diffContract(live);
    expect(drifts.some((d) => d.type === "type_removed" && d.typeName === "Deployment" && d.severity === "BREAKING")).toBe(true);
  });
});
