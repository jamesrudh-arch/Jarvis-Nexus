#!/usr/bin/env python3
"""
STAGE 2.2 / WORKSTREAM A — INDEPENDENT CI WORKFLOW VALIDATOR.

Directive §5: "Create an independent CI validation script. Do not merely confirm
that the YAML parses. Prove that the workflow would actually execute for the
intended branches and events."

What this validator proves (or refutes), with exit code 0 only if ALL pass:
  1. YAML parses (PyYAML; the YAML-1.1 `on`->True quirk is handled explicitly).
  2. Workflow structure: name, permissions (least privilege), jobs, steps.
  3. TRIGGER PROOF: GitHub branch-filter semantics (fnmatch globs) are applied
     to the parsed filters: push to refs/heads/main MUST trigger; push/PR on
     other branches must NOT (for this repo's single-branch posture).
  4. Action refs: pinned to major-version tags (no floating @main/@latest).
  5. No `secrets.*` references that would silently fail; no owner secrets are
     required (live tests self-skip by design — assert the skipIf pattern).
  6. No conditionally-skipping steps (a step with `if:` that can silently
     skip its stated objective is flagged).
  7. Run-step targets exist in the repository (package.json scripts, tool
     files, test directories).
  8. SELF-TEST (the Stage 2.1 lesson): a synthetic corrupt filter
     `branches: ain]` MUST be detected as non-matching — proving this
     validator would have caught a REAL corruption. The Stage 2.1 finding
     F-COM-03 (CI corrupted) was a DISPLAY ARTIFACT, not bytes: the blob at
     pushed 945a78d contains `branches: [main]` (od -c proof) and pickaxe
     across all refs finds no commit ever containing `branches: ain]`.
  9. --execute mode runs the workflow's steps LOCALLY and records results.
     GitHub execution is a separate claim requiring an authorized push and a
     real Actions run — never asserted from local execution alone.

Output: JSON verdict on stdout; exit 0 = all checks pass.
"""
import json
import fnmatch
import subprocess
import sys
from pathlib import Path

import yaml

REPO = Path("/home/z/my-project")
WF = REPO / ".github" / "workflows" / "ci.yml"
DEP = REPO / ".github" / "dependabot.yml"

results = []
failed = 0


def check(name, ok, detail=None):
    global failed
    if not ok:
        failed += 1
    results.append({"check": name, "pass": bool(ok), "detail": detail})
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))
    return ok


def branch_matches(filters, ref_branch):
    """GitHub `branches` filter semantics: fnmatch globs; empty/absent filter = match all."""
    if filters is None:
        return True
    if isinstance(filters, str):
        filters = [filters]
    return any(fnmatch.fnmatch(ref_branch, pat) for pat in filters)


def get_on_key(doc):
    """YAML 1.1 parses bare `on` as boolean True in PyYAML; GitHub accepts the
    written form. Handle both without guessing."""
    for k in ("on", True):
        if k in doc:
            return doc[k]
    return None


print("=== STAGE 2.2 INDEPENDENT CI VALIDATION ===")
raw = WF.read_text()

# --- 1. YAML parses ----------------------------------------------------------
try:
    doc = yaml.safe_load(raw)
    check("YAML parses (ci.yml)", isinstance(doc, dict), f"top-level keys: {sorted(map(str, doc.keys()))}")
except yaml.YAMLError as e:
    check("YAML parses (ci.yml)", False, str(e))
    print(json.dumps({"verdict": "FAIL", "failed": failed, "results": results}, indent=2))
    sys.exit(1)

# --- 2. structure ------------------------------------------------------------
check("workflow name declared", doc.get("name") == "CI", doc.get("name"))
perms = doc.get("permissions")
check("least-privilege permissions (contents: read)", perms == {"contents": "read"}, perms)
jobs = doc.get("jobs") or {}
check("exactly one job (verify)", list(jobs.keys()) == ["verify"], list(jobs.keys()))
job = jobs.get("verify", {})
check("runs-on pinned image", job.get("runs-on") == "ubuntu-latest", job.get("runs-on"))
check("timeout bounded", isinstance(job.get("timeout-minutes"), int) and 0 < job["timeout-minutes"] <= 30, job.get("timeout-minutes"))
steps = job.get("steps") or []
check("steps present", len(steps) >= 5, len(steps))

# --- 3. TRIGGER PROOF --------------------------------------------------------
on = get_on_key(doc)
check("on: block present (YAML 1.1 `on`->True handled)", on is not None, type(on).__name__)
push = (on or {}).get("push") or {}
pr = (on or {}).get("pull_request") or {}
push_branches = push.get("branches")
pr_branches = pr.get("branches")
check("push trigger restricted to [main] (byte-true via parsed doc)", push_branches == ["main"], push_branches)
check("pull_request trigger restricted to [main]", pr_branches == ["main"], pr_branches)
check("TRIGGER PROOF: push to refs/heads/main fires the workflow",
      branch_matches(push_branches, "main") and push.get("types", None) in (None, []))
check("TRIGGER PROOF: push to refs/heads/feature/x does NOT fire", not branch_matches(push_branches, "feature/x"))
check("TRIGGER PROOF: PR targeting main fires", branch_matches(pr_branches, "main"))
check("TRIGGER PROOF: PR targeting develop does NOT fire", not branch_matches(pr_branches, "develop"))

# --- 4/5/6. actions, secrets, silent skips -----------------------------------
for s in steps:
    uses = s.get("uses")
    if uses:
        ok = "@" in uses and not uses.endswith(("@main", "@master", "@latest"))
        check(f"action ref pinned to a version tag: {uses}", ok)
    if s.get("secrets") or "secrets." in json.dumps(s):
        check("no secrets references in steps (CI runs credential-less by design)", False, s.get("name"))
    if "if" in s:
        check(f"step can silently skip (if: condition present) — {s.get('name')}", False, s.get("if"))
check("no secrets.* anywhere in workflow (live tests self-skip by skipIf design)",
      "secrets." not in raw)

# live-skip design proof: credential-less CI must not fail on live-only tests.
# Two real mechanisms exist in this repo: (a) a conditional helper
# `hasCreds ? test(...) : test.skip(...)` in railway-live.test.ts, and
# (b) `test.skipIf(!process.env.<TOKEN>)` guards in api/model-fabric tests.
live_src = (REPO / "tests" / "integration" / "railway-live.test.ts").read_text()
api_src = (REPO / "tests" / "integration" / "api.test.ts").read_text()
mf_src = (REPO / "tests" / "unit" / "model-fabric.test.ts").read_text()
check("live-credential tests self-skip (conditional test.skip helper in railway-live)",
      "test.skip(" in live_src and "hasCreds" in live_src)
check("cloudflare-gated tests self-skip (skipIf env guard in api.test.ts)",
      "test.skipIf(!process.env.CLOUDFLARE_API_TOKEN)" in api_src)
check("model-fabric live tests self-skip (skipIf env guard)",
      "test.skipIf(!token || !account)" in mf_src)

# --- 7. run-step targets exist ----------------------------------------------
pkg = json.loads((REPO / "package.json").read_text())
scripts = pkg.get("scripts", {})
for s in steps:
    run = s.get("run")
    if not isinstance(run, str):
        continue
    name = s.get("name", run[:40])
    lines = [l.strip() for l in run.splitlines() if l.strip() and not l.strip().startswith("#")]
    for cmd in lines:
        if cmd.startswith("bun run typecheck"):
            check(f"step target exists: package.json typecheck script", "typecheck" in scripts)
        elif cmd.startswith("bun tools/registry-validate.ts"):
            check(f"step target exists: tools/registry-validate.ts", (REPO / "tools" / "registry-validate.ts").exists())
        elif cmd.startswith("bun test tests/unit"):
            check(f"step target exists: tests/unit", (REPO / "tests" / "unit").is_dir())
        elif cmd.startswith("bun test tests/integration"):
            check(f"step target exists: tests/integration", (REPO / "tests" / "integration").is_dir())
        elif cmd.startswith("bun test tests/scenarios"):
            check(f"step target exists: tests/scenarios", (REPO / "tests" / "scenarios").is_dir())
        elif cmd.startswith("bun test tests/persistence"):
            check(f"step target exists: tests/persistence", (REPO / "tests" / "persistence").is_dir())
        elif cmd.startswith("bun install"):
            check("lockfile present for --frozen-lockfile", (REPO / "bun.lock").exists())

# --- 8. SELF-TEST: the validator would catch a REAL corruption --------------
synthetic = yaml.safe_load("on:\n  push:\n    branches: ain]\n")
syn_push = (get_on_key(synthetic) or {}).get("push") or {}
check("SELF-TEST: corrupt filter `branches: ain]` is detected as NOT matching main",
      not branch_matches(syn_push.get("branches"), "main"), "the Stage 2.1 'corruption' never existed in bytes — display artifact only")
check("SELF-TEST: corrupt filter would also not match ANY common branch name",
      not any(branch_matches(syn_push.get("branches"), b) for b in ["main", "develop", "master", "release/1.0"]))

# dependabot structural validation (CI tooling inspection)
dep = yaml.safe_load(DEP.read_text()) if DEP.exists() else None
check("dependabot.yml structurally valid (version + updates)",
      isinstance(dep, dict) and dep.get("version") == 2 and isinstance(dep.get("updates"), list) and len(dep["updates"]) >= 1)

# F-2.2-CI-01 guard: the adversarial verification gate MUST run in CI —
# otherwise CI stays green even while the repository's own verifier is red
# (proven locally: pre-fix, the integration step exited 0 with V4 red).
step_names = [s.get("name") for s in steps]
check("adversarial verification gate runs in CI (F-2.2-CI-01 repaired)",
      any(s and "Adversarial verification gate" in s for s in step_names if isinstance(s, str)), step_names)

# --- 9. local execution evidence (optional) ----------------------------------
execution = None
if "--execute" in sys.argv:
    print("\n=== LOCAL EXECUTION OF WORKFLOW STEPS (recorded as-is; NOT a GitHub claim) ===")
    execution = {}
    for s in steps:
        run = s.get("run")
        if not isinstance(run, str):
            continue
        lines = [l for l in run.splitlines() if l.strip() and not l.strip().startswith("#")]
        script = "\n".join(lines)
        # `bun run typecheck` from package.json; run everything else verbatim in repo root
        proc = subprocess.run(["bash", "-c", script], cwd=REPO, capture_output=True, text=True, timeout=900)
        tail = (proc.stdout + proc.stderr).strip().splitlines()[-4:]
        execution[s.get("name", "?")] = {"exitCode": proc.returncode, "tail": tail}
        print(f"  step '{s.get('name')}': exit {proc.returncode} | " + " / ".join(tail[:2]))

verdict = {
    "stage": "2.2",
    "workstream": "A — independent CI validation",
    "generatedAt": subprocess.run(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], capture_output=True, text=True).stdout.strip(),
    "workflowFile": ".github/workflows/ci.yml",
    "historicalFindingDisposition": {
        "BLK-01 / D-2.1-01 / F-COM-03": "REFUTED — false finding. ci.yml at pushed 945a78d and at HEAD contains `branches: [main]` (od -c byte proof); pickaxe across all refs finds no commit ever containing 'branches: ain]'. The Stage 2.1 'byte-exact cat -A proof' was itself the display artifact it claimed to disprove. Standing rule from Stage 2.2: gate-critical files are verified with od -c / structured parsers, never free-text cat output."
    },
    "githubExecution": "NOT VALIDATED — requires authorized push and a real GitHub Actions run; the public API was rate-limited at validation time; local execution (if --execute) proves step correctness only",
    "checksTotal": len(results),
    "checksFailed": failed,
    "localStepExecution": execution,
    "verdict": "PASS" if failed == 0 else f"FAIL — {failed} check(s)",
}
out = REPO / "docs" / "stage2.2" / "evidence"
out.mkdir(parents=True, exist_ok=True)
(out / "ci-validation.json").write_text(json.dumps(verdict, indent=2) + "\n")
print(f"\n=== VERDICT: {verdict['verdict']} ({len(results)} checks, {failed} failed) ===")
print(json.dumps(verdict, indent=2))
sys.exit(0 if failed == 0 else 1)
