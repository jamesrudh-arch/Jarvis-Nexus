# JARVIS NEXUS — Unreal Foundation (Phase 3)

The authoritative Unreal project lives HERE: `world/Unreal/JarvisWorld.uproject`
(Master Directive Part 5; blueprint `docs/blueprint/world-topology.md`).

Division of labour (owner GO, Phase 3): **authoring in-sandbox, compile on the
owner's UE machine.** The sandbox has no engine/GPU (blocker B2) — every file
below is authored, and the exact commands required on the owner workstation
are in `world/Unreal/Build/`.

## What is in this tree

| Path | Contents |
| --- | --- |
| `JarvisWorld.uproject` | UE 5.5 project; module `JarvisWorld`; plugins PythonScriptPlugin, EditorScriptingUtilities, JarvisNexusEOS |
| `Config/DefaultEngine.ini` | World Partition editor hash **512 m** (`CellSize=51200`), maps, Lumen/virtual-shadow/DX12 baseline, Python remote execution |
| `Config/DefaultGame.ini` | Project identity; version 0.3.0-phase3 |
| `Source/JarvisWorld*/` | Game + editor targets (BuildSettingsVersion.V5); module (Core/CoreUObject/Engine) |
| `Source/JarvisWorld/Public+Private/JarvisGeoLibrary.*` | **Authoritative coordinate conversion** — EPSG:4326 <-> TM local metres <-> Unreal doubles; Krueger 6th-order series; Blueprint-callable |
| `Source/JarvisWorld/Public+Private/JarvisWorldIdentity.*` | `FJarvisEntityId` + `UJarvisIdentityLibrary` — persistent PREFIX-NNN IDs |
| `Source/JarvisWorld/Private/Tests/JarvisGeoTests.cpp` | Automation tests `Jarvis.Geo.*` x3 + `Jarvis.Identity.*` x1 |
| `Python/jarvis_geo.py` | Pure-stdlib mirror of the C++ geo math (sandbox/editor/CI) |
| `Python/create_test_map.py` | Deterministic WP test-map builder (`L_JarvisTestMap`) |
| `Python/validate_project.py` | Owner-machine validator -> `Saved/ValidationReport.json` + screenshot |
| `Python/jarvis_http_bridge.py` | Whitelisted UE<->NEXUS bridge (migrated from `unreal/Python/`, content unchanged) |
| `Plugins/JarvisNexusEOS/` | EOS plugin (migrated from `unreal/Plugins/`, content unchanged; no-SDK mode until B5 clears) |
| `Build/*.bat\|*.sh` | Owner build/automation entry points |

## Bring-up (owner workstation, steps 1–7 core)

1. **Prerequisites.** UE 5.5 (launcher build). Windows: VS 2022 with the
   C++ game-development workload. Linux: clang per Epic's docs. Then set
   `UE_ROOT` to the engine root (e.g. `C:\Program Files\Epic Games\UE_5.5`).
2. **Compile.** Windows: `world\Unreal\Build\Windows-JarvisWorldEditor-Build.bat`.
   Linux: `UE_ROOT=... ./world/Unreal/Build/Linux-JarvisWorldEditor-Build.sh`.
   Expected: `JarvisWorld` module builds; `LogJarvisWorld` online at startup.
3. **Open.** Right-click `JarvisWorld.uproject` > Switch Unreal Engine version > 5.5, then open.
   On first open accept the module build if prompted.
4. **Create the test map.** Tools > Python: run
   `exec(open(r"<repo>/world/Unreal/Python/create_test_map.py").read())`.
   This creates the World Partition level `/Game/Maps/L_JarvisTestMap` and
   places six REG markers at the blueprint region centres.
5. **Set the 512 m runtime grid (manual, one step).** With `L_JarvisTestMap`
   open: Window > World Settings > World Partition > Runtime Grids — set the
   primary runtime grid to **512 m**. The UE 5.5 Python API does not expose the
   runtime-grid list (verified against Epic's API reference; not faked) — this
   is the single manual step; `validate_project.py` records the live state.
6. **Validate.** Run `validate_project.py` the same way. It writes
   `world/Unreal/Saved/ValidationReport.json` and captures
   `Saved/ValidationScreenshot.png`. Send both back as Phase 3 runtime evidence.
7. **Automation tests.** `world\Unreal\Build\Windows-RunAutomationTests.bat` —
   runs `Jarvis.Geo.RoundTripUnder1cm`, `Jarvis.Geo.AxisConventionsAndAnchor`,
   `Jarvis.Geo.WorldExtentBounds`, `Jarvis.Identity.ParseFormatRoundTrip`.

8. **Coordinate reference.** EPSG:4326 <-> TM (anchor 45N/10E, k0=1, WGS84,
   Krueger 6th order) <-> local metres <-> Unreal units (1 m = 100 UU;
   X = east, Y = south, Z = up). Round-trip verified to 0.000005 mm in the
   sandbox (10,010 points) plus a PROJ cross-check (0.000003 mm, 2,000 points).
   The same math ships here as C++ (`UJarvisGeoLibrary`), editor Python
   (`jarvis_geo.py`), and CI (`scripts/geo_verify.py`).
9. **Rollback.** `git revert -m 1 <phase-3 merge commit>` reverts the whole
   phase (the F-C1 migration reverts with it — git mv history is preserved).

## Honest limitations

* No engine in the authoring sandbox: the Linux build script fails with
  `UE_ROOT is not set` — that is the recorded real-build attempt (B2).
* Landscape/terrain is deliberately Phase 5 (real atlas-driven terrain; the
  UE 5.5 Python API does not expose `LandscapeEditorSubsystem` — verified,
  not assumed).
* Runtime grid 512 m: one manual step (5) — the API cannot set it; the
  validator reads back and records the live state.
