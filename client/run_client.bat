@echo off
title TaskPulse AI - Local Desktop Dual Audio Recorder
echo ============================================================
echo  TaskPulse AI - Local Desktop Audio Client Launcher
echo  Captures local microphone and speaker system sound, 
echo  then uploads to your Remote Cloud AI Server!
echo ============================================================
echo.

set PYTHON_CMD=python
if exist "..\..\.venv\Scripts\python.exe" set PYTHON_CMD=..\..\.venv\Scripts\python.exe

%PYTHON_CMD% -m pip install sounddevice numpy requests
echo.
%PYTHON_CMD% taskpulse_desktop_client.py

pause
