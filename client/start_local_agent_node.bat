@echo off
title TaskPulse Local Node.js Soundcard Agent
color 0A
cls

echo =====================================================================
echo  TaskPulse AI - Local Soundcard Agent (Node.js Engine)
echo =====================================================================
echo.
echo [1/3] Checking Node.js Environment...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on your system.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [2/3] Clearing old agent instances on port 18514...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":18514" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [3/3] Launching Local Soundcard Agent Daemon on http://127.0.0.1:18514 ...
echo.

node "%~dp0local_sound_agent.js"

pause
