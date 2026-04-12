@echo off
:: FastAPI 개발 서버 실행
echo.
echo ========================================
echo   SSOLAP API 서버 시작
echo   주소: http://localhost:8000
echo   문서: http://localhost:8000/docs
echo ========================================
echo.

cd /d "%~dp0..\api"

:: Python 가상환경이 있으면 활성화 (있을 경우)
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
