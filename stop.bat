@echo off
chcp 65001 >nul
title SSOLAP 서비스 종료

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║        SSOLAP 서비스 종료             ║
echo  ╚═══════════════════════════════════════╝
echo.

:: ── 포트 8000 (FastAPI) 종료 ─────────────────────────────────────────────
echo [1/2] FastAPI 서버 종료 중 (포트 8000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo       PID %%a 종료
    taskkill /PID %%a /F >nul 2>&1
)

:: ── 포트 3000 (Next.js) 종료 ─────────────────────────────────────────────
echo [2/2] Next.js 서버 종료 중 (포트 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo       PID %%a 종료
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo  ✅ 서비스 종료 완료
echo.
pause
