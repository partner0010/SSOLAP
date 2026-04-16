@echo off
title SSOLAP Launcher

echo.
echo  +==========================================+
echo  ^|         SSOLAP Service Launcher         ^|
echo  +==========================================+
echo.

set ROOT=%~dp0
set API_DIR=%ROOT%api
set WEB_DIR=%ROOT%web

:: Check Python venv
set PYTHON_CMD=python
if exist "%API_DIR%\venv\Scripts\python.exe" (
    set PYTHON_CMD=%API_DIR%\venv\Scripts\python.exe
    echo [OK] Python venv found
) else (
    echo [OK] Using global Python
)

:: Check port 8000
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [WARN] Port 8000 is already in use
) else (
    echo [OK] Port 8000 available
)

:: Check port 3000
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [WARN] Port 3000 is already in use
) else (
    echo [OK] Port 3000 available
)

echo.
echo [1/2] Starting FastAPI backend  (port 8000) ...
start "SSOLAP API  ^| FastAPI :8000" cmd /k "cd /d %API_DIR% && %PYTHON_CMD% -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Next.js frontend (port 3000) ...
start "SSOLAP WEB  ^| Next.js :3000" cmd /k "cd /d %WEB_DIR% && npm run dev"

echo.
echo [INFO] Opening browser in 5 seconds...
timeout /t 5 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo  +====================================================+
echo  ^|  Services started!                                ^|
echo  ^|                                                   ^|
echo  ^|  Web Frontend : http://localhost:3000             ^|
echo  ^|  API Backend  : http://localhost:8000             ^|
echo  ^|  API Swagger  : http://localhost:8000/docs        ^|
echo  ^|                                                   ^|
echo  ^|  Run stop.bat to shut down all services           ^|
echo  +====================================================+
echo.
pause
