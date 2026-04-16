@echo off
title SSOLAP Stop

echo.
echo  +==========================================+
echo  ^|        SSOLAP Service Shutdown          ^|
echo  +==========================================+
echo.

echo [1/2] Stopping FastAPI server (port 8000) ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo       Killing PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo [2/2] Stopping Next.js server (port 3000) ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo       Killing PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo  [OK] All services stopped.
echo.
pause
