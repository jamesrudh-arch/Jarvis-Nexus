# JARVIS NEXUS — legacy `unreal/` location (TOMBSTONE)

This directory is the FORMER home of the Unreal work. Phase 3 (F-C1
disposition, `docs/blueprint/CHANGES.md` Entry 002) migrated everything to the
directive-mandated location:

> **`world/Unreal/JarvisWorld.uproject`** (Master Directive Part 5)

What moved where (content unchanged, git history preserved via `git mv`):

| Was (legacy) | Now |
| --- | --- |
| `unreal/Plugins/JarvisNexusEOS/` | `world/Unreal/Plugins/JarvisNexusEOS/` |
| `unreal/Python/jarvis_http_bridge.py` | `world/Unreal/Python/jarvis_http_bridge.py` |

Removed (superseded by the real C++ project at `world/Unreal/`):
`unreal/JarvisNexus.uproject` and `unreal/Config/DefaultEngine.ini` — the
legacy `.uproject` declared a `JarvisNexus` module that never existed in
`Source/` and could not compile.

Everything (project, modules, geo library, identity library, automation
tests, bring-up steps 1–9) now lives at `world/Unreal/README.md`.
