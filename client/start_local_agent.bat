@echo off
title TaskPulse AI - Local Soundcard Agent Daemon
color 0A
cls

echo ============================================================
echo  TaskPulse AI • Local Desktop Soundcard Agent
echo  Listening on: http://127.0.0.1:18514
echo  Enables Remote Web Server to capture local PC Soundcard audio!
echo ============================================================
echo.

echo [1/3] Clearing stale instances on port 18514...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":18514" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/3] Verifying Python Audio Dependencies...
set PYTHON_CMD=python
if exist "..\..\.venv\Scripts\python.exe" set PYTHON_CMD=..\..\.venv\Scripts\python.exe

%PYTHON_CMD% -m pip install sounddevice numpy requests pyaudiowpatch SpeechRecognition >nul 2>&1

echo [3/3] Launching WASAPI Dual Soundcard Agent on http://127.0.0.1:18514 ...
echo.
%PYTHON_CMD% "%~dp0local_sound_agent.py"

pause
