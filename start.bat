@echo off
chcp 65001 >nul
title SSOLAP 서비스 실행기

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║        SSOLAP 서비스 시작             ║
echo  ╚═══════════════════════════════════════╝
echo.

set ROOT=%~dp0
set API_DIR=%ROOT%api
set WEB_DIR=%ROOT%web

:: ── Python venv 설정 ────────────────────────────────────────────────────────
set VENV_ACTIVATE=%API_DIR%\venv\Scripts\activate.bat
set PYTHON_CMD=python

if exist "%VENV_ACTIVATE%" (
    echo [API] 가상환경(venv) 발견됨
    set PYTHON_CMD=%API_DIR%\venv\Scripts\python.exe
) else (
    echo [API] 전역 Python 사용 (venv 없음)
)

:: ── 포트 충돌 확인 ────────────────────────────────────────────────────────
echo [체크] 포트 사용 여부 확인 중...
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [경고] 8000 포트가 이미 사용 중입니다 — 기존 API 서버를 확인하세요
) else (
    echo [OK] 8000 포트 사용 가능
)
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [경고] 3000 포트가 이미 사용 중입니다 — 기존 웹 서버를 확인하세요
) else (
    echo [OK] 3000 포트 사용 가능
)

echo.
echo ▶ FastAPI 백엔드 서버 시작 중... (포트 8000)
start "SSOLAP API (FastAPI:8000)" cmd /k "chcp 65001 >nul && cd /d %API_DIR% && title SSOLAP API (FastAPI:8000) && echo. && echo  [FastAPI] 서버 시작 중... && echo  주소: http://localhost:8000 && echo  Swagger: http://localhost:8000/docs && echo. && %PYTHON_CMD% -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

:: API가 준비될 때까지 2초 대기
timeout /t 2 /nobreak >nul

echo ▶ Next.js 프론트엔드 서버 시작 중... (포트 3000)
start "SSOLAP WEB (Next.js:3000)" cmd /k "chcp 65001 >nul && cd /d %WEB_DIR% && title SSOLAP WEB (Next.js:3000) && echo. && echo  [Next.js] 서버 시작 중... && echo  주소: http://localhost:3000 && echo. && npm run dev"

:: 브라우저 자동 실행 (5초 후)
echo.
echo [INFO] 5초 후 브라우저를 자동으로 엽니다...
timeout /t 5 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  ✅ 서비스 실행 완료                                  ║
echo ║                                                      ║
echo ║  웹 프론트엔드 : http://localhost:3000               ║
echo ║  백엔드 API    : http://localhost:8000               ║
echo ║  API Swagger   : http://localhost:8000/docs          ║
echo ║                                                      ║
echo ║  종료하려면 stop.bat 을 실행하세요                    ║
echo ╚══════════════════════════════════════════════════════╝
echo.
pause
