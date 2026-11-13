#!/usr/bin/env bash
# JARVIS NEXUS - JarvisWorldEditor build (Linux variant; owner machine).
# Requires UE_ROOT to point at a UE 5.5 engine root. In the authoring sandbox
# there is no engine (blocker B2): this script then fails with the exact
# missing-input message, which is the honest "real build attempt" evidence.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPROJECT="$HERE/../JarvisWorld.uproject"

if [ -z "${UE_ROOT:-}" ]; then
  echo "[JarvisWorld] UE_ROOT is not set. Point it at your UE 5.5 engine root." >&2
  exit 1
fi
if [ ! -x "$UE_ROOT/Engine/Build/BatchFiles/Linux/Build.sh" ]; then
  echo "[JarvisWorld] UE_ROOT does not look like an engine root: $UE_ROOT" >&2
  exit 1
fi
exec bash "$UE_ROOT/Engine/Build/BatchFiles/Linux/Build.sh" JarvisWorldEditor Linux Development -Project="$UPROJECT" -WaitMutex
