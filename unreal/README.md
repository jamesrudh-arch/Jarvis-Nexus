# JARVIS NEXUS — Unreal Engine 5 / MetaHuman Integration

Implementation status: **code complete, prepared for external execution.**
This directory contains the real UE5 project architecture. The UE editor and
MetaHuman Creator cannot run inside the JARVIS development sandbox (no GPU, no
Windows, ~60 GB engine install) — bring-up happens on the owner's workstation
following the exact steps below. Nothing here is a mock: every file is the
actual code that runs once UE5 is present.

## What is implemented

| Component | File | Purpose |
|---|---|---|
| Project | `JarvisNexus.uproject` | UE 5.5 project with PythonScriptPlugin + MetaHumanPlugin + JarvisNexusEOS enabled |
| CORE ↔ UE5 communication | `Python/jarvis_http_bridge.py` | In-editor threaded HTTP server (port 8765). Whitelisted commands only: ping, get_state, load_level, spawn_character, play_animation, set_camera, set_light, capture_frame, list_assets. JARVIS CORE calls it through `src/lib/nexus/integrations/unrealBridge.ts` |
| Epic Online Services | `Plugins/JarvisNexusEOS/` | C++ module: credential-driven `EOS_Platform_Create` + client-credentials `EOS_Auth_Login`, per-frame `EOS_Platform_Tick`, honest status reporting. Compiles against the official EOS SDK placed in `ThirdParty/EOSSDK` (auto no-SDK mode otherwise) |
| Engine config | `Config/DefaultEngine.ini` | Python remote execution enabled, sane defaults |

## Exact external execution requirements (owner workstation)

1. **Hardware/OS**: Windows 10/11 PC with a GPU meeting UE5 minimums
   (RTX-class recommended for Lumen), ~100 GB free disk.
2. **Install Unreal Engine 5.5** via the Epic Games Launcher; sign in with the
   Epic account that owns the MetaHuman assets.
3. **Open this project**: copy the `unreal/` folder contents to the
   workstation, right-click `JarvisNexus.uproject` → Generate project files →
   open. Let it compile (the JarvisNexusEOS plugin builds in no-SDK mode
   until step 5).
4. **Start the bridge**: in the editor Python console
   (Output Log → Python), run:
   ```python
   import jarvis_http_bridge; jarvis_http_bridge.start()
   ```
   Then set `UNREAL_BRIDGE_URL=http://<workstation-ip>:8765` in JARVIS CORE's
   environment — the Connections panel will verify with a live ping.
5. **EOS SDK** (optional but required for Epic Online Services): download the
   Unified SDK from the Epic Developer Portal (dev.epicgames.com/portal →
   your product → EOS SDK) and extract to
   `Plugins/JarvisNexusEOS/ThirdParty/EOSSDK/` (containing `Include/` and
   `Lib/Win64/Release/`). Create `Plugins/JarvisNexusEOS/jarvis_nexus_eos.json`:
   ```json
   { "clientId": "xyza7891…", "clientSecret": "…", "productId": "…", "deploymentId": "…" }
   ```
   (all four values from the Developer Portal; the file is gitignored).
   Rebuild — the module runs `EOS_Platform_Create` on startup and logs the
   real login result.
6. **MetaHuman**: create/import the MetaHuman in MetaHuman Creator (UE 5.5's
   MetaHuman plugin handles download into the project). Her skeletal mesh +
   face board drop into the world; `spawn_character` + `play_animation`
   commands from JARVIS CORE drive her. The web embodiment (Avaturn GLB path)
   already supports the MetaHuman UE5 skeleton drop-in (bone aliasing +
   ARKit-51 + viseme fallback, sessions 1–3).

## Kaggle ≠ UE5 host (compute distinction)

Kaggle offers notebook GPU compute (CUDA kernels); it does NOT provide a
GUI/RTX-class interactive Unreal editor session or licensed runtime streaming.
The UE editor + interactive runtime belongs on the owner's PC. Kaggle accounts
are used for AI/data workloads through the Kaggle resource manager
(`src/lib/nexus/integrations/kaggle.ts`), and optionally for offline renders
where headless work genuinely fits.

## Licensing notes

- Unreal Engine EULA applies to the engine; MetaHuman assets are governed by
  the MetaHuman license (use within Unreal/any-engine terms per current
  Epic policy — recorded in RESEARCH_REGISTER F-sources, verify at bring-up).
- The Avaturn-character web embodiment is prototype-licensed (ED-L1).
