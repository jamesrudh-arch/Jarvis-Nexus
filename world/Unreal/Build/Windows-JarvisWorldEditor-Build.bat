@echo off
REM JARVIS NEXUS - JarvisWorldEditor build (Windows, owner UE 5.5 machine).
REM Usage (README step 2):
REM   set UE_ROOT=C:\Program Files\Epic Games\UE_5.5
REM   world\Unreal\Build\Windows-JarvisWorldEditor-Build.bat
setlocal
if "%UE_ROOT%"=="" (
  echo [JarvisWorld] UE_ROOT is not set. Point it at your UE 5.5 install ^(e.g. C:\Program Files\Epic Games\UE_5.5^).
  exit /b 1
)
if not exist "%UE_ROOT%\Engine\Build\BatchFiles\Build.bat" (
  echo [JarvisWorld] UE_ROOT does not look like an engine root: "%UE_ROOT%"
  exit /b 1
)
call "%UE_ROOT%\Engine\Build\BatchFiles\Build.bat" JarvisWorldEditor Win64 Development -Project="%~dp0..\JarvisWorld.uproject" -WaitMutex
endlocal
