@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
cd /d E:\跑团管家
call C:\Users\Administrator\AppData\Roaming\QClaw\npm-global\tauri.cmd build
