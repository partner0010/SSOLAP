@echo off
:: Next.js 개발 서버 실행
echo.
echo ========================================
echo   SSOLAP 웹 서버 시작
echo   주소: http://localhost:3000
echo ========================================
echo.

cd /d "%~dp0..\web"
npm run dev
