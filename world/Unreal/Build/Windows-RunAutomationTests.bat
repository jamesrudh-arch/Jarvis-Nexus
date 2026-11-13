@echo off
REM JARVIS NEXUS - headless automation runner (Windows, owner UE 5.5 machine).
REM Runs the four Phase 3 automation tests (Jarvis.Geo.* x3, Jarvis.Identity.* x1)
REM and exits when the queue drains.
REM Usage (README step 7):
REM   set UE_ROOT=C:\Program Files\Epic Games\UE_5.5
REM   world\Unreal\Build\Windows-RunAutomationTests.bat
setlocal
if "%UE_ROOT%"=="" (
  echo [JarvisWorld] UE_ROOT is not set. Point it at your UE 5.5 install.
  exit /b 1
)
set EDITOR=%UE_ROOT%\Engine\Binaries\Win64\UnrealEditor-Cmd.exe
if not exist "%EDITOR%" (
  echo [JarvisWorld] UnrealEditor-Cmd not found under UE_ROOT.
  exit /b 1
)
"%EDITOR%" "%~dp0..\JarvisWorld.uproject" -ExecRunAutomationTests -TestExit="Automation Test Queue Empty" -unattended -nopause -nosplash -log
endlocal
