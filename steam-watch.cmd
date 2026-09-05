@echo off
REM ---------------------------------------------------------------------------
REM  steam-watch.cmd - closes Steam's window automatically once a game launches.
REM
REM  Start this BEFORE launching a game from Steam, then leave the window open
REM  while you play. It only closes Steam's window -- Steam itself keeps running,
REM  minimized to the tray, so nothing about your library or friends list is
REM  affected. It never touches the game.
REM
REM  To stop watching: close this window, or press Ctrl+C.
REM ---------------------------------------------------------------------------

cd /d "%~dp0"
title Steam Watcher

"C:\Users\gordo\AppData\Local\Programs\Python\Python312\python.exe" -m allytune steam-watch
echo.
echo   Steam Watcher stopped.
pause
