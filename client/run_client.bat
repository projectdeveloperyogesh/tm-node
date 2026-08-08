@echo off
title TaskPulse AI - Local Desktop Dual Audio Recorder
echo ============================================================
echo  TaskPulse AI • Local Desktop Audio Client Launcher
echo  Captures local microphone & speaker system sound, 
echo  then uploads to your Remote Cloud AI Server!
echo ============================================================
echo.

python taskpulse_desktop_client.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Installing required Python packages (sounddevice, numpy, requests)...
    pip install sounddevice numpy requests
    python taskpulse_desktop_client.py
)

pause
