@echo off
:: SSOLAP 개발 환경 초기 설정 스크립트
:: 처음 한 번만 실행하면 됩니다

echo.
echo ========================================
echo   SSOLAP 개발 환경 설정
echo ========================================
echo.

:: .env 파일 생성
if not exist ".env" (
    copy ".env.example" ".env"
    echo [OK] .env 파일 생성 완료
    echo      SECRET_KEY를 반드시 변경하세요!
) else (
    echo [SKIP] .env 파일이 이미 존재합니다
)

echo.
echo --- [1/2] 웹 패키지 설치 (Next.js) ---
cd web
call npm install
if errorlevel 1 (
    echo [ERROR] npm install 실패
    exit /b 1
)
cd ..
echo [OK] 웹 패키지 설치 완료

echo.
echo --- [2/2] API 패키지 설치 (FastAPI) ---
cd api
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] pip install 실패
    exit /b 1
)
cd ..
echo [OK] API 패키지 설치 완료

echo.
echo ========================================
echo   설정 완료!
echo.
echo   실행 방법:
echo   - 웹: scripts\start-web.bat
echo   - API: scripts\start-api.bat
echo ========================================
echo.
