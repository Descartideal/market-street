@echo off
title Market Street - Stock Trading Game
setlocal
pushd "%~dp0market-game"
where node >nul 2>nul
if not errorlevel 1 (
  node server.cjs
) else (
  if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    "%LOCALAPPDATA%\Programs\nodejs\node.exe" server.cjs
  ) else (
    echo Node.js was not found. Install Node.js 22 or newer, then try again.
    pause
  )
)
if errorlevel 1 pause
popd
endlocal
