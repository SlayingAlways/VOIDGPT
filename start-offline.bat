@echo off
setlocal
title AI App - Offline (Local) Mode
cd /d "%~dp0"

REM ============================================================
REM  Runs everything locally ("offline mode"):
REM    1. openai-oauth bridge  ->  http://127.0.0.1:10531
REM    2. Next.js app          ->  http://localhost:3000
REM  The bridge URL is passed to Next.js as an environment
REM  variable, so .env does not need to be edited.
REM
REM  Note: the very first run needs internet once to download
REM  and cache the bridge package via npx. After that it starts
REM  from the local cache without any registry check
REM  (--prefer-offline).
REM ============================================================

set "BRIDGE_URL=http://127.0.0.1:10531"
set "OPENAI_OAUTH_BRIDGE_URL=%BRIDGE_URL%"

REM First run only: install dependencies
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo [1/3] Starting OpenAI OAuth bridge...
start "OpenAI OAuth Bridge" cmd /k "npx --yes --prefer-offline openai-oauth"

REM Wait up to 60s for the bridge to answer
set /a tries=0
where curl >nul 2>&1
if errorlevel 1 (
    echo       curl not found - waiting 10s instead of polling...
    timeout /t 10 /nobreak >nul
    goto start_app
)
:wait_bridge
curl -s -o nul --max-time 2 "%BRIDGE_URL%" >nul 2>&1
if not errorlevel 1 goto bridge_up
set /a tries+=1
if %tries% geq 60 (
    echo WARNING: Bridge not detected after 60s - continuing anyway.
    goto start_app
)
timeout /t 1 /nobreak >nul
goto wait_bridge
:bridge_up
echo       Bridge is up on 127.0.0.1:10531

:start_app
echo [2/3] Starting Next.js app...
REM Dev server. For a production-style local run, run "npm run build"
REM once, then replace the line below with:
REM   start "AI Web Server (Next.js)" cmd /k "npm run start"
start "AI Web Server (Next.js)" cmd /k "npm run dev"

REM Wait up to 60s for the app to answer on port 3000
set /a tries=0
:wait_app
curl -s -o nul --max-time 2 "http://localhost:3000" >nul 2>&1
if not errorlevel 1 goto app_up
set /a tries+=1
if %tries% geq 60 (
    echo WARNING: App not detected after 60s - opening browser anyway.
    goto app_up
)
timeout /t 1 /nobreak >nul
goto wait_app
:app_up

echo [3/3] Opening browser...
start "" "http://localhost:3000"

echo.
echo Offline mode is running:
echo   Bridge : %BRIDGE_URL%
echo   App    : http://localhost:3000
echo Close the "OpenAI OAuth Bridge" and "AI Web Server" windows to stop.
echo.
pause
