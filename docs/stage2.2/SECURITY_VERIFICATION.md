# STAGE 2.2 — SECURITY VERIFICATION

**Document ID:** STAGE22-SEC-001
**Scope:** directive §8. Re-verified against the corrected implementation; Stage 2.1 results were NOT assumed — every posture was re-probed against the current code.
**Reproducible suite:** `scripts/stage22_security_suite.ts` (committed).
**Machine evidence:** `docs/stage2.2/evidence/security-suite.json`; probe matrix: `docs/stage2.2/evidence/final-closure-probe.txt` (BLK-08 repaired).

---

## 1. Verification matrix (31 checks, all PASS)

| Area | Verified posture |
|---|---|
| Authentication | **37/37 source-derived owner-gated routes** return 401 unauthenticated AND with a wrong key (the matrix derives the route list from source by regex — it cannot drift from the implementation; 30/30 at Stage 2.1 → 37 with the Stage 2.2 restore/download routes) |
| Escalation / token handling | Owner key in query string refused; key via other header schemes refused; case-mangled authorization schemes (bearer/BEARER/Basic/padded) refused; whitespace-padded token refused (constant-time compare not fooled) |
| Webhooks (secret-authenticated, **configured** secret) | no secret → 401; wrong secret → 401; valid + fresh → 202; duplicate replay → 200 `duplicate:true`; stale timestamp → 401 (replay window); malformed payload → 400 (never 500); payload is contract-validated (severity enum etc.) |
| Rate limiting | fixed-IP burst: exactly 5 allowed then 429 with `Retry-After > 0` (boundary exact on a dedicated 5/min instance); per-IP isolation (a different client is not collateral-limited) |
| Auth-fail lockout | after repeated failures, even the VALID key is refused (429) while public routes stay 200 |
| CORS | unlisted origin receives NO `access-control-allow-origin`; allowlisted origin receives it (fail-closed allowlist, verified both ways) |
| Secret exposure | 0 leaks across public routes, status routes and error bodies |
| Input validation | oversized payload → 400 (never 500); malformed JSON → 400; wrong types → 400; path traversal → 404 with no file content; unknown routes → 404 without stack traces |
| New Stage 2.2 surface | restore route: traversal filename refused (400); download route: traversal filename refused (400); both require owner auth; the restore route never touches the live store (test-proven) |

## 2. Legacy token assessment (in context — directive §8)

`nexus-tier0-dev-token` (name referenced; values are not reproduced in reports):

- **Scope:** `NEXUS_WORLD/infrastructure/api_server.py` `DEFAULT_FOUNDER_TOKEN` and `NEXUS_WORLD/scripts/serve_world.py` fallback — the reference Python subsystem only.
- **Production exposure: none.** The deployed runtime is the Bun API (`apps/nexus-api`), which never references the token (verified by source scan). The token is env-overridable (`NEXUS_FOUNDER_TOKEN`).
- **Classification:** LOW — self-flagged in the repository's own security scan; carried from Stage 2.1; unchanged.
- **Remaining decision (owner):** whether to force env-override (remove the default) in the reference subsystem. Not deployment-blocking; not changed autonomously because the subsystem is reference-only and the change buys no production security.

## 3. Regression guards (permanent)

Every posture above is re-executed by: the committed security suite (this document's generator), the adversarial suite's V2 block (in the standard test run), and the 15 backup-restore tests (guard/CLI/offsite). CI runs the adversarial gate on every push (F-2.2-CI-01 repair) — a red gate can no longer hide behind a green CI.

## 4. Honest limits (unchanged, owner-gated)

- **FC-05 / BLK-10:** XFF-rotation rate-limit evasion — needs production XFF-behavior verification post-deploy; owner-gated routes carry the sensitive surface meanwhile.
- **BLK-06:** volume-backup state on Railway unverifiable without owner credentials (B-03).
- **B-07:** model-provider verification in production is post-deploy (`POST /models/verify`, owner) — "configured ≠ verified" stands.
