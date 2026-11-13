# Gate 0 — Step 0 Baseline Results

Environment: Ubuntu sandbox, Python 3.12.16, Node v24.22.2, npm 11.19.1.
Clean virtual environment at `.venv` (deleted and recreated from `python3 -m venv`).
Commands run from repository root unless noted.

## 1. `pytest -v`

### First run — polluted shell environment (recorded as pre-existing failure)

```
ERROR backend/tests/test_nexus_core.py - sqlalchemy.exc.ArgumentError: Could not parse SQLAlchemy URL from given URL string
!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!
========================= 1 warning, 1 error in 1.09s ==========================
```

Root cause (diagnosed, not a repository defect): the sandbox shell exported
`DATABASE_URL=file:/home/z/my-project/db/custom.db` — a Prisma-style `file:` URL left
over from an unrelated workspace. `normalize_database_url()` passes unknown schemes
through unchanged and `create_engine()` then fails at import. On a real deployment
the variable holds a `postgres://` or `postgresql://` URL, which parses fine.

Verdict: **environmental, pre-existing, reported before any code change.** The
Gate 0 fix deliberately does NOT alter database-URL handling (out of scope); it is
recorded here and in the threat note as an observation.

### Clean-environment run (`env -u DATABASE_URL`) — recorded verbatim

```
backend/tests/test_nexus_core.py::test_health_and_truthful_capabilities PASSED [ 12%]
backend/tests/test_nexus_core.py::test_world_locomotion_interruption_and_resumption PASSED [ 25%]
backend/tests/test_nexus_core.py::test_seven_owner_switches_real_enforcement PASSED [ 37%]
backend/tests/test_nexus_core.py::test_memory_epistemic_integrity_and_sensitive_encryption PASSED [ 50%]
backend/tests/test_nexus_core.py::test_goal_dependency_enforcement PASSED [ 62%]
backend/tests/test_nexus_core.py::test_scenarios_simulations_and_kaggle_packages PASSED [ 75%]
backend/tests/test_nexus_core.py::test_authenticated_private_worker_websocket_streaming PASSED [ 87%]
backend/tests/test_nexus_core.py::test_supabase_url_and_fernet_passphrase_normalization PASSED [100%]
========================= 8 passed, 1 warning in 1.75s =========================
```

Baseline verdict: **8/8 PASS** (one pre-existing deprecation warning from
starlette/httpx, informational only).

## 2. `node frontend/tests/verify_character_and_scene.mjs`

```
ALL FRONTEND RIG, VISEME, LOCOMOTION & PROXY CHECKS PASSED
```

Baseline verdict: **PASS**.

## 3. `(cd frontend && npm ci && npm run build)`

```
✓ 30 modules transformed.
dist/index.html                  10.19 kB │ gzip:   3.46 kB
dist/assets/index-fLK-_3bb.css   10.81 kB │ gzip:   2.79 kB
dist/assets/index-Ubd5Rwli.js   785.42 kB │ gzip: 210.24 kB
✓ built in 4.26s
```

Pre-existing warning (informational, not a failure): one chunk > 500 kB after
minification (Three.js bundle); upstream guidance suggests code-splitting.

Baseline verdict: **BUILD SUCCEEDS**.

## 4. Pre-existing failures reported before code changes

1. **Environmental**: stray `DATABASE_URL` in the hosting shell breaks app import
   (see above). Not triggered on Railway/Vercel where the variable is a proper
   PostgreSQL URL. No repo change made for it in Gate 0.
2. No other pre-existing test or build failures were found.

Raw captures: `docs/security/evidence/baseline/` (pytest_baseline.txt = polluted run, pytest_baseline_clean_env.txt = clean run, verify_character_baseline.txt, npm_build_baseline.txt).
