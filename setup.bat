@echo off
chcp 65001 >nul
title SSOLAP 최초 설치

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║     SSOLAP 최초 설치 (처음 한 번만 실행하세요)        ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

set ROOT=%~dp0
set API_DIR=%ROOT%api
set WEB_DIR=%ROOT%web

:: ── Python 확인 ──────────────────────────────────────────────────────────
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo        https://www.python.org/downloads/ 에서 설치 후 다시 실행하세요.
    pause
    exit /b 1
)
echo [OK] Python 확인됨
python --version

:: ── Node.js 확인 ─────────────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo        https://nodejs.org/ 에서 설치 후 다시 실행하세요.
    pause
    exit /b 1
)
echo [OK] Node.js 확인됨
node --version

echo.
echo ─────────────────────────────────────────────
echo  [STEP 1/4] Python 가상환경 생성 및 패키지 설치
echo ─────────────────────────────────────────────
cd /d %API_DIR%
if not exist "venv" (
    echo 가상환경 생성 중...
    python -m venv venv
    echo [OK] venv 생성 완료
) else (
    echo [OK] venv 이미 존재함 — 건너뜀
)

echo 패키지 설치 중... (시간이 걸릴 수 있습니다)
call venv\Scripts\activate.bat
pip install -r requirements.txt
echo [OK] API 패키지 설치 완료

echo.
echo ─────────────────────────────────────────────
echo  [STEP 2/4] DB 마이그레이션
echo ─────────────────────────────────────────────
cd /d %API_DIR%
call venv\Scripts\activate.bat
alembic upgrade head
echo [OK] DB 마이그레이션 완료

echo.
echo ─────────────────────────────────────────────
echo  [STEP 3/4] Next.js 패키지 설치
echo ─────────────────────────────────────────────
cd /d %WEB_DIR%
if not exist "node_modules" (
    echo npm install 중... (시간이 걸릴 수 있습니다)
    npm install
) else (
    echo [OK] node_modules 이미 존재함 — 건너뜀
)
echo [OK] 웹 패키지 설치 완료

echo.
echo ─────────────────────────────────────────────
echo  [STEP 4/4] 환경변수 파일 확인
echo ─────────────────────────────────────────────
if not exist "%WEB_DIR%\.env.local" (
    echo [생성] web\.env.local 파일 생성 중...
    (
        echo NEXT_PUBLIC_API_URL=http://localhost:8000
        echo NEXT_PUBLIC_WS_URL=ws://localhost:8000
        echo NEXT_PUBLIC_APP_NAME=SSOLAP
    ) > "%WEB_DIR%\.env.local"
    echo [OK] web\.env.local 생성 완료
) else (
    echo [OK] web\.env.local 이미 존재함
)

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  ✅ 설치 완료!                                        ║
echo ║                                                      ║
echo ║  이제 start.bat 을 실행해 서비스를 시작하세요         ║
echo ╚══════════════════════════════════════════════════════╝
echo.
pause
