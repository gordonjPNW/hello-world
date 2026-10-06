@echo off
REM ---------------------------------------------------------------------------
REM  tune.cmd - start a Claude Code session for the allytune work.
REM
REM  Saves typing the handoff prompt by hand, which matters on a handheld with
REM  an on-screen keyboard and no clipboard between devices.
REM
REM    tune          start a session and hand Claude the phase 1 brief
REM    tune resume   reopen the most recent conversation in this folder
REM    tune doctor   installation health check, no session
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

where claude >nul 2>nul
if errorlevel 1 (
    echo.
    echo   'claude' is not on PATH in this window.
    echo.
    echo   Fix it by running:
    echo     powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-ally.ps1
    echo.
    echo   Then CLOSE this window and open a new one. A PATH change never
    echo   reaches a window that was already open.
    echo.
    exit /b 1
)

if /i "%~1"=="resume" (
    claude --continue
    exit /b %errorlevel%
)

if /i "%~1"=="doctor" (
    claude doctor
    exit /b %errorlevel%
)

claude "Read docs/allytune/03-handoff-prompt.md and carry it out."
