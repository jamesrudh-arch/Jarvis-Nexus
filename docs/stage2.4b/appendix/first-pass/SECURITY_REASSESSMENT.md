# STAGE 2.4B — SECURITY REASSESSMENT (post-remediation)

Scope per directive §5: authentication, authorization, rate limiting, CORS, CSRF, webhook validation, replay protection, secret handling, error disclosure, forwarded-header trust, dependency security. Re-tested **after** the remediation on the remediated tree; every claim below maps to a test that actually ran this session.

---

## 1. Forwarded-header trust — the F-2.4A-02 question, answered honestly

**Empirical status: UNVERIFIED, and now proven unanswerable pre-deploy.** The probe (`scripts/stage24b/probe_xff_edge.ts`, evidence `evidence/xff-edge-probe.json`) sent 245 read-only GETs to production with a controlled `X-Forwarded-For`: all returned 200. Source inspection of the *deployed* code (`41092a33`) explains it completely: it contains **no rate limiter and no XFF consumer at all** (0 hits for `clientIpOf`/`X-Forwarded`/`RATE_LIMIT`). The limiter exists only in the candidate, so there is no XFF-dependent behaviour deployed today, and the append-vs-overwrite question **cannot in principle be answered against the current deployment**. Neither Railway's official statement (overwrite) nor the community report (append) is treated as proven — the run-time verdict recorded by the probe was superseded by this source-level finding, and the evidence file carries both, explicitly.

**Consequence for design — the mitigation no longer depends on the answer:** the Stage 2.4B global auth-fail backstop (`AUTH_FAIL_GLOBAL_LIMIT_PER_MIN`, default 300/min across all identities, identical expiry semantics) bounds total failed-auth throughput whatever the edge does. Rotation of a client-controlled identity can buy at most the shared budget, never N× the per-identity budget. E2E SEC-13 proves it end-to-end (6 rotating identities exhaust the shared budget; a fresh identity with a VALID token is refused while the window is live, scope `global`; recovers at expiry). Residual, stated: under the append hypothesis, per-identity lockout fairness degrades during global lockout (valid tokens refused ≤ 60 s per exhausted window, protected routes only, public routes never) — an availability trade-off chosen fail-closed, never a bypass. The empirical edge answer (V-08) remains a post-deploy runbook step; it is no longer load-bearing for the brute-force bound.

## 2. Authentication & authorization (re-tested)

- Owner bearer key: constant-time compare; header-only transport (query-string keys rejected — AUTH-05); case-mangled schemes rejected; whitespace-padded tokens rejected (E2E + adversarial V2, all re-run green).
- Lockout: fail-closed during the live window (SEC-10), public routes never collateral (SEC-11), **and now expires correctly** (SEC-12 — the F-2.4A-01 fix, live through HTTP with an injectable clock).
- All owner-gated routes 401 anon (AUTH-06, corrected route list: `/railway/status` is public-by-design carrying statuses, not topology; `GET /railway/monitor` does not exist).
- Webhook: unconfigured secret → fail-closed 503; bad secret → 401; schema-invalid payload → 400; **stale timestamp (replay window) → 401** (SEC-04..06); dedup fingerprint unchanged.

## 3. Rate limiting (re-tested)

- Global per-identity limiter: 429 + truthful `Retry-After` at the 241st request from one identity (SEC-09, default 240/min).
- Auth-fail per-identity budget: 61st failure → 429, valid token refused in-window (SEC-10).
- Global auth-fail backstop: SEC-13 (above).
- Concurrency: exact outcome distributions under parallel floods (3×401 + 27×429); no state corruption.

## 4. CORS & CSRF posture (re-tested)

- Deny-by-default allowlist; allowed origin echoed exactly (SEC-01); disallowed origin receives no ACAO (SEC-02); preflight handled only for allowed origins (SEC-03/03b). No wildcard `*` anywhere.
- CSRF: state-changing routes are owner-bearer-authenticated (not cookie-authenticated), and cross-origin reads are blocked by the allowlist; the same-origin-only default when unset stands.

## 5. Secret handling (re-tested + new surface)

- Scan of every file changed on this branch for token patterns (`ghp_…`, `rlwy_…`, 64-hex constants, private-key blocks): **clean** — the branch diff was enumerated from git and grepped; the only 64-hex values in the new tests are runtime-generated (`randomBytes(32).toString("hex")` at test time), never committed values.
- The encryption key: env-only; never in artifacts, logs, alerts, listings, headers or CLI arguments; the webhook payload is verified by test to contain no key material and not to echo its own URL.
- `NEXUS_ALERT_WEBHOOK_URL` is displayed only as `webhookConfigured: boolean`.

## 6. Error disclosure (re-tested)

- 404s short, no stack traces (APP-06 + adversarial V3); validation errors carry zod issues only; unknown routes leak nothing.
- New surface reviewed: backup failures return `backup_failed` with the run result (paths, counts, codes) — owner-authenticated route; the 400 decode failures carry human-readable causes but no key material or raw bytes; `x-lockout-scope` reveals which budget tripped (operational transparency; cannot be leveraged to bypass anything — the per-identity budget stays independently enforced).

## 7. Dependency security

- `bun audit` (live npm advisory DB): **no vulnerabilities** (network-verified this session).
- No new dependencies; lockfile byte-identical to main (`bun install --frozen-lockfile` 902 packages, no changes).
- The osv-scanner advisory step remains absent from the CI branch (F-2.4B-CI-01, documented in CI_REMEDIATION_REVIEW); Dependabot continues weekly on npm + github-actions.

## 8. Verdict

**No CRITICAL/HIGH findings.** The one open pre-deploy unknown (edge XFF behaviour) is now *structurally mitigated* (the brute-force bound no longer depends on it) while remaining honestly UNVERIFIED until the post-deploy probe. F-2.4A-01 is closed with reproduction evidence in both directions. F-2.4A-06's code paths are closed with the drill; production activation remains an owner configuration decision, tracked in the risk register.
