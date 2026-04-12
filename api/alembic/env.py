"""
alembic/env.py — Alembic 마이그레이션 환경 설정

async SQLAlchemy (asyncpg / aiosqlite) 지원
- 개발: sqlite+aiosqlite  → sync fallback (sqlite+pysqlite) 사용
- 프로덕션: postgresql+asyncpg → sync fallback (postgresql+psycopg2) 사용

실행 예시:
  alembic revision --autogenerate -m "initial"
  alembic upgrade head
  alembic downgrade -1
"""
import re
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from alembic import context

# ─── 설정 로드 ────────────────────────────────────────────────────────────────
config = context.config

# alembic.ini의 로깅 설정 반영
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ─── 앱 설정 + 모델 임포트 ────────────────────────────────────────────────────
# 모든 모델을 import 해야 autogenerate가 테이블을 감지함
from app.core.config import settings
from app.core.database import Base  # noqa: F401

# 각 모델 파일 import (Base.metadata에 등록됨)
from app.models import user, post, follow, point  # noqa: F401
from app.models import chat as chat_model          # noqa: F401
from app.models import notification                # noqa: F401

target_metadata = Base.metadata


def get_sync_url(async_url: str) -> str:
    """
    async DB URL → sync DB URL 변환 (alembic은 sync 드라이버 필요)

    sqlite+aiosqlite   → sqlite
    postgresql+asyncpg → postgresql+psycopg2
    """
    url = async_url
    url = url.replace("sqlite+aiosqlite", "sqlite")
    url = url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    return url


def run_migrations_offline() -> None:
    """
    오프라인 모드: DB 연결 없이 SQL 스크립트만 생성
    alembic upgrade head --sql 로 실행
    """
    url = get_sync_url(settings.DATABASE_URL)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    온라인 모드: 실제 DB에 연결해서 마이그레이션 실행
    """
    sync_url = get_sync_url(settings.DATABASE_URL)

    # alembic.ini의 sqlalchemy.url 오버라이드
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = sync_url

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            # SQLite: batch mode 필요 (ALTER TABLE 미지원)
            render_as_batch="sqlite" in sync_url,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
