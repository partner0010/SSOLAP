"""
core/database.py — 데이터베이스 연결 & 세션 관리

개발 환경: SQLite (파일 기반, 설치 불필요)
운영 환경: DATABASE_URL만 PostgreSQL로 바꾸면 자동 전환

SQLAlchemy 2.0 async 방식 사용
"""
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# ─── 엔진 생성 ────────────────────────────────────────────────────────────────
# echo=True → 개발 시 SQL 쿼리를 콘솔에 출력 (디버그용)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    # SQLite 전용: 동시 접근 허용 (프로덕션 PostgreSQL에서는 필요 없음)
    connect_args={"check_same_thread": False}
    if "sqlite" in settings.DATABASE_URL
    else {},
)

# ─── 세션 팩토리 ──────────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # commit 후에도 객체 사용 가능
)


# ─── 기반 모델 클래스 ──────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """모든 SQLAlchemy 모델이 상속받는 기반 클래스"""
    pass


# ─── 의존성 주입용 세션 제공자 ────────────────────────────────────────────────
async def get_db() -> AsyncSession:
    """
    FastAPI 의존성 주입용 DB 세션 생성기
    요청 시작 → 세션 생성 → 라우터 처리 → 세션 닫기

    사용법:
        @router.get("/")
        async def my_route(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ─── 테이블 생성 (개발용) ─────────────────────────────────────────────────────
async def create_tables() -> None:
    """앱 시작 시 DB 테이블 자동 생성 (모델 import 후 호출)"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
