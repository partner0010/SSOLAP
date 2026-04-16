@echo off
title SSOLAP Setup (Run once)

echo.
echo  +====================================================+
echo  ^|   SSOLAP First-Time Setup  (run once only)        ^|
echo  +====================================================+
echo.

set ROOT=%~dp0
set API_DIR=%ROOT%api
set WEB_DIR=%ROOT%web

:: ── Check Python ────────────────────────────────────────────────────────────
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found.
    echo         Install from https://www.python.org/downloads/
    pause
    exit /b 1
)
echo [OK] Python found:
python --version

:: ── Check Node.js ───────────────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    echo         Install from https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found:
node --version

echo.
echo ─────────────────────────────────────────────────────
echo  STEP 1/4  Create Python virtual environment
echo ─────────────────────────────────────────────────────
cd /d %API_DIR%
if not exist "venv" (
    echo Creating venv...
    python -m venv venv
    echo [OK] venv created
) else (
    echo [SKIP] venv already exists
)

echo Installing Python packages...
call venv\Scripts\activate.bat && pip install -r requirements.txt
echo [OK] Python packages installed

echo.
echo ─────────────────────────────────────────────────────
echo  STEP 2/4  Run DB migrations
echo ─────────────────────────────────────────────────────
cd /d %API_DIR%
call venv\Scripts\activate.bat && alembic upgrade head
echo [OK] DB migration done

echo.
echo ─────────────────────────────────────────────────────
echo  STEP 3/4  Install Node.js packages
echo ─────────────────────────────────────────────────────
cd /d %WEB_DIR%
if not exist "node_modules" (
    echo Running npm install...
    npm install
) else (
    echo [SKIP] node_modules already exists
)
echo [OK] Node packages installed

echo.
echo ─────────────────────────────────────────────────────
echo  STEP 4/4  Create .env.local (web)
echo ─────────────────────────────────────────────────────
if not exist "%WEB_DIR%\.env.local" (
    echo Creating web/.env.local ...
    (
        echo NEXT_PUBLIC_API_URL=http://localhost:8000
        echo NEXT_PUBLIC_WS_URL=ws://localhost:8000
        echo NEXT_PUBLIC_APP_NAME=SSOLAP
    ) > "%WEB_DIR%\.env.local"
    echo [OK] web/.env.local created
) else (
    echo [SKIP] web/.env.local already exists
)

echo.
echo  +====================================================+
echo  ^|  Setup complete!                                  ^|
echo  ^|                                                   ^|
echo  ^|  Run start.bat to launch all services             ^|
echo  +====================================================+
echo.
pause
