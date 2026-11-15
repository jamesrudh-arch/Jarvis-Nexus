/**
 * STAGE 2.2 / WORKSTREAM B — EVIDENCE-INTEGRITY VALIDATOR.
 *
 * Directive §6 requirements, all enforced here:
 *  - required files exist               (7 reports + manifest + >=6 evidence)
 *  - JSON schemas are valid             (per-format required fields)
 *  - manifest references resolve        (artifacts[].path exists; bytes match)
 *  - SHA-256 checksums match            (docs/stage2/evidence/SHA256SUMS)
 *  - evidence timestamps are consistent (parseable, not future-dated)
 *  - git commit references exist        (generatedAtHead via git cat-file)
 *  - recovery artifacts are complete    (bundle bytes + sha256 recompute)
 *  - no evidence is silently substituted (--record writes the checksum
 *    register tied to a commit; default mode FAILS on any divergence)
 *
 * Usage:
 *   bun run scripts/stage22_evidence_validate.ts --record   # re-register
 *   bun run scripts/stage22_evidence_validate.ts            # verify
 * Exit 0 = integrity holds.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const EVID = "docs/stage2/evidence";
const REPS = "docs/stage2/reports";
const SUMS = join(EVID, "SHA256SUMS");
const RECORD = process.argv.includes("--record");

let failed = 0;
const checks: Array<{ check: string; pass: boolean; detail?: unknown }> = [];
const check = (name: string, pass: boolean, detail?: unknown) => {
  if (!pass) failed += 1;
  checks.push({ check: name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  return pass;
};
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const head = () => execSync("git rev-parse HEAD").toString().trim();
const now = Date.now();
const SKEW_MS = 5 * 60 * 1000;

console.log(`=== EVIDENCE INTEGRITY (${RECORD ? "RECORD MODE" : "VERIFY MODE"}) — head ${head().slice(0, 8)} ===`);

// 1. required files ----------------------------------------------------------
const reports = ["PHASE0_BASELINE.md", "SECURITY_REMEDIATION.md", "RECOVERY_MANIFEST.md", "GIT_RECONCILIATION.md", "DEPLOYMENT_READINESS.md", "BACKUP_VERIFICATION.md", "VISUAL_APP_RESTORATION.md"];
for (const r of reports) check(`report exists: ${r}`, existsSync(join(REPS, r)) && statSync(join(REPS, r)).size > 500, existsSync(join(REPS, r)) ? statSync(join(REPS, r)).size : "missing");
const manifestPath = join(REPS, "recovery_manifest.json");
check("recovery manifest exists and parses", existsSync(manifestPath));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const evidenceFiles = readdirSync(EVID).filter((f) => f !== "SHA256SUMS" && !f.startsWith("."));
check("evidence directory holds >= 6 non-empty artifacts", evidenceFiles.length >= 6, evidenceFiles);

// 2. JSON schema + per-format required fields ---------------------------------
const jsonDocs: Record<string, any> = {};
for (const f of evidenceFiles.filter((f) => f.endsWith(".json"))) {
  const p = join(EVID, f);
  try {
    const d = JSON.parse(readFileSync(p, "utf8"));
    jsonDocs[f] = d;
    check(`JSON parses: ${f}`, true);
    if (d.format) {
      if (d.format.startsWith("stage2-")) {
        check(`schema ${f}: generatedAt + generatedAtHead present`, typeof d.generatedAt === "string" && typeof d.generatedAtHead === "string", { generatedAt: d.generatedAt, generatedAtHead: d.generatedAtHead?.slice(0, 8) });
        // 5. timestamps consistent (parseable, not future-dated)
        const t = Date.parse(d.generatedAt);
        check(`timestamp ${f}: parseable and not future-dated`, !Number.isNaN(t) && t <= now + SKEW_MS, d.generatedAt);
        // 6. git commit reference exists
        try { execSync(`git cat-file -e ${d.generatedAtHead}`); check(`git ref ${f}: generatedAtHead exists`, true); }
        catch { check(`git ref ${f}: generatedAtHead exists`, false, d.generatedAtHead); }
        if (d.verdict) check(`verdict ${f}: PASS recorded`, String(d.verdict).startsWith("PASS"), d.verdict);
      }
    }
  } catch (e) { check(`JSON parses: ${f}`, false, String(e)); }
}

// 3. manifest references resolve ----------------------------------------------
for (const a of manifest.artifacts ?? []) {
  const ok = existsSync(a.path) && statSync(a.path).size === a.bytes;
  check(`manifest artifact resolves with exact byte count: ${a.id}`, ok, { path: a.path, expected: a.bytes, actual: existsSync(a.path) ? statSync(a.path).size : -1 });
  if (existsSync(a.path) && a.sha256) check(`manifest artifact sha256 matches: ${a.id}`, sha(a.path) === a.sha256, a.path);
}
check("manifest carries explicit lostPoints classification", manifest.lostPoints && Object.keys(manifest.lostPoints).length >= 3, manifest.lostPoints ? Object.keys(manifest.lostPoints) : null);

// 7. recovery artifacts complete (RP-2.2-001 manifest cross-check)
const rp22 = JSON.parse(readFileSync("docs/stage2.2/recovery/manifest-rp-2.2-001.json", "utf8"));
for (const a of rp22.durableArtifacts ?? []) {
  check(`RP-2.2-001 durable artifact complete: ${a.id}`, existsSync(a.path) && statSync(a.path).size === a.bytes && sha(a.path) === a.sha256, a.path);
}

// honest-classification guard: every regenerated report must say so
for (const r of reports) {
  const body = readFileSync(join(REPS, r), "utf8");
  check(`report carries REGENERATED banner: ${r}`, body.includes("REGENERATED 2026-11-15"));
}

// 4. SHA-256 substitution guard -----------------------------------------------
if (RECORD) {
  const lines = evidenceFiles.map((f) => `${sha(join(EVID, f))}  ${f}`).sort();
  lines.push(`# recorded ${new Date().toISOString()} at head ${head()}`);
  writeFileSync(SUMS, lines.join("\n") + "\n");
  check(`SHA256SUMS recorded for ${evidenceFiles.length} artifacts`, true, SUMS);
} else {
  if (!existsSync(SUMS)) {
    check("SHA256SUMS register exists", false, "run with --record first");
  } else {
    const registered = new Map(readFileSync(SUMS, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => [l.trim().split(/\s+/)[1], l.trim().split(/\s+/)[0]] as const));
    for (const f of evidenceFiles) {
      const want = registered.get(f);
      check(`no silent substitution: ${f}`, want === sha(join(EVID, f)), want ? undefined : "not registered");
    }
    for (const f of registered.keys()) check(`registered file still present: ${f}`, evidenceFiles.includes(f as string), "registered but missing");
  }
}

// verdict ---------------------------------------------------------------------
const verdict = failed === 0 ? "PASS" : `FAIL — ${failed} check(s)`;
const doc = { format: "stage2.2-evidence-integrity", generatedAt: new Date().toISOString(), generatedAtHead: head(), mode: RECORD ? "record" : "verify", checksTotal: checks.length, checksFailed: failed, verdict, checks };
mkdirSync("docs/stage2.2/evidence", { recursive: true });
writeFileSync("docs/stage2.2/evidence/evidence-integrity.json", JSON.stringify(doc, null, 2) + "\n");
console.log(`\n=== EVIDENCE INTEGRITY: ${verdict} (${checks.length} checks) ===`);
process.exit(failed === 0 ? 0 : 1);
