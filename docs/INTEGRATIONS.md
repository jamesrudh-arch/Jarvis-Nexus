# JARVIS NEXUS — Integration Audit Register (Session 4, 2026-11-12)

Live-verification evidence: `scripts/verify_integrations.py` (run:
`/home/z/.venv/bin/python3 scripts/verify_integrations.py`) and the live API
`GET /api/v1/integrations`. Statuses below are the results of REAL
authenticated calls against each service on 2026-11-12 — no fabricated claims.

## IMPLEMENTED + VERIFIED LIVE (this environment)

| Integration | Evidence |
|---|---|
| **GitHub token** | HTTP 200 `GET /user` → authenticated as `jamesrudh-arch`; push permission on both repos confirmed |
| **GitHub push** | `Jarvis-Nexus` repo (was empty) now at `main` = session commits; verified via `GET /repos/…/commits/main` and `git ls-remote` |
| **Kaggle ×6** | All six KGAT tokens verified individually (`GET /api/v1/hello`): jimcreat, wikeyoung, deyoungsltd, bittrexminingltd, wikeyoung5, youngwilly. Resource manager (`src/lib/nexus/integrations/kaggle.ts`) does per-account verify + round-robin workload routing + dataset discovery + private kernel push (compute submission) |
| **Cloudflare account** | `GET /accounts` → 200, account `Jamesrudh@gmail.com's Account` |
| **Cloudflare R2 API reachability** | Token reaches the R2 API (real response: error 10042, see below) |
| **Railway authentication** | GraphQL `projects` query → 200 (workspace token valid, read scope) |
| **Local app** | 37/37 unit tests, `tsc --noEmit` clean, production build clean |

## IMPLEMENTED + VERIFIED LIVE, FUNCTIONALLY BLOCKED BY ACCOUNT STATE (owner action)

| Integration | Precise blocker (real API response) |
|---|---|
| **Cloudflare R2 storage** | `HTTP 403 {code 10042: "Please enable R2 through the Cloudflare Dashboard"}` — R2 must be enabled on the account (payment method + plan activation). Full client implemented (management REST + dependency-free SigV4 S3 data plane with SHA-256/ETag integrity). After enabling, create S3 credentials (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) — the client goes live with zero code changes |
| **Railway deployment** | Token authenticates but ALL mutations return `HTTP 403` (workspace token lacks API write scope) and the workspace contains 0 projects. `Dockerfile` + `.dockerignore` are prepared; deployment needs: (a) a token with write scope, or (b) dashboard: New Project → connect repo `jamesrudh-arch/Jarvis-Nexus` (Dockerfile auto-detected) → add volume at `/data` → set env vars from `.env.example` → deploy; healthcheck path `/api/v1/health` |

## IMPLEMENTED + AWAITING EXTERNAL EXECUTION (prepared for intended runtime)

| Component | What's ready | Exact external requirement |
|---|---|---|
| **UE5 world runtime** | `unreal/` — .uproject (Python + MetaHuman plugins), in-editor whitelisted HTTP bridge (`Python/jarvis_http_bridge.py`), CORE-side client `unrealBridge.ts` | Windows PC + UE 5.5 install; open project; `import jarvis_http_bridge; jarvis_http_bridge.start()`; set `UNREAL_BRIDGE_URL` |
| **Epic Online Services** | `unreal/Plugins/JarvisNexusEOS` — full C++ module: credential-driven `EOS_Platform_Create`, client-credentials login, per-frame tick, honest status; config from `jarvis_nexus_eos.json` | Download EOS SDK from Epic Developer Portal → `ThirdParty/EOSSDK/`; provide ClientSecret + ProductId + DeploymentId (supplied `xyza7891…` credential is the client-ID format). No REST verification exists for EOS — auth happens inside the SDK at engine runtime |
| **MetaHuman embodiment** | Web side already accepts MetaHuman UE5-skeleton GLB drops (bone aliasing + ARKit-51 + viseme fallback, sessions 1–3); UE-side spawn/sequence commands in the bridge | Windows + UE 5.5 + MetaHuman Creator (Epic account) → export MetaHuman → drop GLB into `public/models/` or spawn in UE |
| **Blender automation** | `blender/jarvis_blender` addon (real bpy operators: scene creation, import/export GLB/USD, PBR materials, rig validation, batch, scene validation) + MCP-style TCP server (main-thread job queue) + headless script; CORE client `blenderMcp.ts` | Blender 4.2+ on any host; install the addon zip; server auto-starts on :9876 |
| **iOS native app** | `ios/JarvisNexus` — SwiftUI + AVAudioSession(voiceChat) + SFSpeechRecognizer wake/standby/barge-in + WKWebView bridge; honest permission states | Mac + Xcode 16; create target, add the four files, set `NEXUS_URL`, run on device. Apple constraint documented: mic capture suspends on device lock for ALL third-party apps — no workaround promised |
| **PWA** | `public/manifest.webmanifest` + generated icons (192/512/maskable/apple) + `appleWebApp` metadata + 44px touch targets + safe-area insets | Install from Safari (Share → Add to Home Screen) |

## CONFIGURED IN CODE, CREDENTIAL INCOMPLETE (owner must supply values)

| Integration | State |
|---|---|
| **Supabase** | The supplied `sb_secret_…` key is a PROJECT-scoped secret key (management API correctly rejects it: `401 JWT could not be decoded` — it expects an `sbp_` PAT). To activate: set `SUPABASE_URL` (Dashboard → Settings → API → project URL) for the data-plane client (REST/auth/storage implemented), and/or `SUPABASE_PAT` for management. Both client paths are implemented and live-verify themselves |
| **Epic EOS values** | Client-ID-format credential present; client secret, ProductId, DeploymentId missing (Developer Portal) |

## Security posture

- All secrets live ONLY in gitignored `.env*` (verified: `git check-ignore .env.local`; secrets audit over all tracked files returned zero matches before every push).
- API responses (`/api/v1/integrations`) expose connection state + identities only — never tokens.
- UE bridge accepts a fixed command whitelist (no arbitrary execution); Blender bridge likewise.
- Kaggle tokens are used server-side only (Node runtime routes).
- Recommended after integration bring-up: rotate the GitHub PAT (it was pasted in chat) and scope a Railway write token.

## Wake-word / standby resource behaviour (implemented, web + iOS)

- STANDBY: microphone analysed locally (AnalyserNode RMS / Speech framework); NO network calls, no LLM, no TTS, no cloud streaming while silent. Recognition bursts open only on speech-energy onset.
- "Hey JARVIS" → ACTIVE (she faces you, listening); every utterance routes to CORE.
- Barge-in: voice energy while she speaks cancels speech + in-flight generation instantly (web: `interruptSpeech()` aborts sequencer + fetches; iOS: `jarvis-barge-in` event).
- "Go to sleep"/"Stand by" or 180 s inactivity → STANDBY.
- MIC/MASTER switches off → engine stops and every audio track is torn down.
