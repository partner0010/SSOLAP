"""
main.py — FastAPI 앱 진입점
uvicorn app.main:app --reload 로 실행
"""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import create_tables

# ─── 라우터 임포트 ────────────────────────────────────────────────────────────
from app.routers import auth, posts, users

# ─── 모델 임포트 (create_tables가 모든 모델을 인식하도록) ─────────────────────
from app.models import user, post, follow  # noqa: F401

# ─── 시작/종료 이벤트 ──────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작 시 실행 (startup), 종료 시 실행 (shutdown)"""

    # 업로드 디렉토리 생성
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

    # DB 테이블 생성 (개발 환경)
    # 운영 환경에서는 Alembic 마이그레이션으로 대체
    if settings.DEBUG:
        await create_tables()
        print(f"\n{'='*50}")
        print(f"  {settings.APP_NAME} v{settings.APP_VERSION}")
        print(f"  DB: {settings.DATABASE_URL}")
        print(f"  Docs: http://localhost:8000/docs")
        print(f"{'='*50}\n")

    yield

    # 앱 종료 시 (필요한 정리 작업)
    print("[SSOLAP API] Shutting down...")


# ─── FastAPI 앱 생성 ──────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
## SSOLAP API

유튜브+인스타+카카오톡 결합 하이브리드 SNS 플랫폼 API

### 인증
모든 보호된 엔드포인트는 `Authorization: Bearer <token>` 헤더 필요
    """,
    docs_url="/docs",       # Swagger UI
    redoc_url="/redoc",     # ReDoc UI
    lifespan=lifespan,
)

# ─── CORS 미들웨어 ────────────────────────────────────────────────────────────
# 프론트엔드(Next.js)에서 API 호출 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── 라우터 등록 ──────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(posts.router)
app.include_router(users.router)

# 추후 Phase별로 추가 예정:
# app.include_router(chat.router)
# app.include_router(points.router)

# ─── 정적 파일 서빙 (업로드 이미지/영상) ─────────────────────────────────────
upload_path = Path(settings.UPLOAD_DIR)
upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")

# ─── 헬스체크 ────────────────────────────────────────────────────────────────
@app.get("/", tags=["헬스체크"])
async def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["헬스체크"])
async def health():
    """로드밸런서, 모니터링 시스템용 헬스체크"""
    return {"status": "ok"}
