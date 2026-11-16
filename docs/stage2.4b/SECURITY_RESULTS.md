# STAGE 2.4B — SECURITY RESULTS (post-remediation revalidation)

**Scope (directive §7 + first-pass §5):** authentication, authorization, rate limiting, CORS, CSRF, webhook validation, replay protection, secret handling, error disclosure, forwarded-header trust (F-2.4A-02 carried forward, not expanded), dependency security. Re-tested **after** the remediation, on the remediated tree — twice (first pass + independent re-verification pass; every claim below maps to a test that actually ran in both). First-pass detail: `appendix/first-pass/SECURITY_REASSESSMENT.md`.

**Verdict: no CRITICAL/HIGH findings.** The one open pre-deploy unknown (Railway edge XFF behaviour) is structurally mitigated and honestly UNVERIFIED until the post-deploy probe.

---

## 1. X-Forwarded-For (F-2.4A-02) — carried forward, answered honestly, not expanded

- **Current implementation:** `clientIpOf` uses the first `X-Forwarded-For` entry as the rate-limit identity; a new global auth-fail backstop (`AUTH_FAIL_GLOBAL_LIMIT_PER_MIN`, default 300/min across all identities, identical expiry semantics) bounds total failed-auth throughput **whatever the edge does with the header** — rotation of a client-controlled identity can buy at most the shared budget, never N× the per-identity budget.
- **Trust assumptions:** none are assumed. Neither Railway's official statement (edge overwrites XFF) nor the community report (edge appends) is treated as proven. The probe (`scripts/stage24b/probe_xff_edge.ts`; evidence in both passes) is **proven unanswerable against the current deployment**: the deployed code (`41092a33`) contains no rate limiter and no XFF consumer at all, so there is no XFF-dependent behaviour deployed today. The run-time verdict recorded by the probe was superseded by this source-level finding; the evidence files carry both, explicitly.
- **Abuse implications:** bounded by construction (above). Residual, stated: under the append hypothesis, per-identity lockout fairness degrades during a global lockout (valid tokens refused ≤ 60 s per exhausted window, protected routes only; public routes never) — an availability trade-off chosen fail-closed, never a bypass. `x-lockout-scope: identity|global` discloses which budget tripped (operational transparency; cannot be leveraged — the per-identity budget stays independently enforced).
- **Required post-deployment verification:** runbook **V-08** — the empirical edge answer is a post-deploy step; it is no longer load-bearing for the brute-force bound. Until then: **UNVERIFIED**, and classified exactly so.

## 2. Authentication & authorization (re-tested, both passes)

- Owner bearer key: constant-time compare; header-only transport (query-string keys rejected); case-mangled schemes rejected; whitespace-padded tokens rejected.
- Lockout: fail-closed during the live window (SEC-10), public routes never collateral (SEC-11), **and now expires correctly** (SEC-12 — through real HTTP with an injectable clock; twin time-real probes).
- All owner-gated routes 401 anon (AUTH-06, corrected route list); `GET /railway/status` public-by-design (carries statuses, not topology).
- Webhook: unconfigured secret → fail-closed 503; bad secret → 401; schema-invalid → 400; stale timestamp (replay window) → 401 (SEC-04..06); dedup fingerprint unchanged.

## 3. Rate limiting (re-tested)

Global per-identity limiter 429 + truthful `Retry-After` at the 241st request (SEC-09, default 240/min); auth-fail per-identity budget 61st failure → 429, valid token refused in-window (SEC-10); global backstop (SEC-13: 6 rotating identities exhaust the shared budget; a fresh identity with a VALID token is refused while the window is live, scope `global`; recovers at expiry); concurrency: exact outcome distributions under parallel floods (3×401 + 27×429), no state corruption.

## 4. CORS & CSRF (re-tested)

Deny-by-default allowlist; allowed origin echoed exactly (SEC-01); disallowed origin receives no ACAO (SEC-02); preflight handled only for allowed origins (SEC-03/03b); no wildcard `*` anywhere. CSRF: state-changing routes are owner-bearer-authenticated (not cookie-authenticated); cross-origin reads blocked by the allowlist; same-origin-only default when unset stands.

## 5. Secret handling (re-tested + new surface)

- Scan of every file changed on this branch for token patterns (`ghp_…`, `rlwy_…`, committed 64-hex constants, private-key blocks): clean — the only 64-hex values in the new tests are runtime-generated (`randomBytes(32)`), never committed values.
- Encryption key: env-only; never in artifacts, logs, alerts, listings, headers or CLI arguments. Webhook payload verified by test to contain no key material and not to echo its own URL; `NEXUS_ALERT_WEBHOOK_URL` is displayed only as `webhookConfigured: boolean`.

## 6. Error disclosure (re-tested)

404s short, no stack traces (APP-06 + adversarial V3); validation errors carry zod issues only. New surface reviewed: backup failures return `backup_failed` with the run result on an owner-authenticated route; 400 decode failures carry human-readable causes but no key material or raw bytes.

## 7. Dependency security (re-tested)

`bun audit` (live npm advisory DB): **no vulnerabilities** (network-verified, both passes). No new dependencies; lockfile byte-identical to main (902 packages, frozen install). The advisory osv-scanner step remains absent from the CI branch (F-2.4B-CI-01, documented); Dependabot continues weekly on npm + github-actions.
