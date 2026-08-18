@echo off
title TaskPulse AI - Local Soundcard Agent Daemon
echo ============================================================
echo  TaskPulse AI • Local Desktop Soundcard Agent
echo  Listening on: http://127.0.0.1:18514
echo  Enables Remote Web Server to capture local PC Soundcard audio!
echo ============================================================
echo.

set PYTHON_CMD=python
if exist "..\..\.venv\Scripts\python.exe" set PYTHON_CMD=..\..\.venv\Scripts\python.exe

%PYTHON_CMD% -m pip install sounddevice numpy requests
echo.
%PYTHON_CMD% local_sound_agent.py

pause
