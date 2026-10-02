@echo off
title PaotuanGuanjia Dev Launcher (no packaging)

REM Switch to this bat's directory (keep bat in project root E:\paotuanguanjia)
cd /d "%~dp0"

REM Set local toolchain paths
set "CARGO_BIN=C:\Users\Administrator\.cargo\bin"
set "NPM_GLOBAL=C:\Users\Administrator\AppData\Roaming\QClaw\npm-global"
set "MSVC_BIN=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64"
set "PATH=%CARGO_BIN%;%NPM_GLOBAL%;%MSVC_BIN%;%PATH%"

REM Kill leftover dev process so target/ is not locked
echo [1/2] Cleaning up leftover trpg-tracker process...
taskkill /F /IM trpg-tracker.exe >nul 2>&1

REM Launch tauri dev (no packaging)
echo [2/2] Starting tauri dev (dev build, not packaged)...
echo When compile finishes, window shows Local: http://localhost:1420
echo Close this window to stop the dev server.
echo.
tauri dev

pause