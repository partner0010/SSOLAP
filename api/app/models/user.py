"""
models/user.py — 사용자 DB 모델
SQLAlchemy ORM 테이블 정의
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    """
    users 테이블

    인증/프로필 정보를 저장하는 핵심 테이블
    포인트 잔액은 성능을 위해 user_points 테이블에 별도 관리
    """
    __tablename__ = "users"

    # ── 기본 필드 ─────────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # 로그인 식별자
    username: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False, index=True,
        comment="로그인용 아이디 (영문/숫자/_)"
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True,
        comment="이메일 (로그인 대체 수단)"
    )

    # 비밀번호 (bcrypt 해시)
    hashed_password: Mapped[str] = mapped_column(
        String(255), nullable=False,
        comment="bcrypt 해시 비밀번호"
    )

    # ── 프로필 ────────────────────────────────────────────────────────────────
    display_name: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="화면에 표시되는 이름"
    )
    bio: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="자기소개"
    )
    avatar_url: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True,
        comment="프로필 이미지 URL"
    )

    # ── 역할 & 상태 ───────────────────────────────────────────────────────────
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="user",
        comment="user | creator | admin"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True,
        comment="계정 활성 상태 (false = 정지)"
    )
    is_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False,
        comment="이메일 인증 여부"
    )

    # ── 통계 (캐시) ───────────────────────────────────────────────────────────
    # 실제 count는 별도 테이블에 있으나 조회 성능을 위해 여기도 유지
    follower_count:  Mapped[int] = mapped_column(Integer, default=0)
    following_count: Mapped[int] = mapped_column(Integer, default=0)
    post_count:      Mapped[int] = mapped_column(Integer, default=0)

    # ── 타임스탬프 ────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="마지막 로그인 시각"
    )

    # ── 관계 (Relationships) ──────────────────────────────────────────────────
    point_balance: Mapped["UserPoints"] = relationship(
        "UserPoints",
        back_populates="user",
        uselist=False,   # 1:1 관계
        cascade="all, delete-orphan",
        lazy="select",
    )
    posts: Mapped[list["Post"]] = relationship(
        "Post",
        back_populates="author",
        cascade="all, delete-orphan",
        lazy="noload",   # 필요할 때만 로드
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r}>"


class UserPoints(Base):
    """
    user_points 테이블 — S포인트 잔액 캐시

    왜 별도 테이블인가:
        users 테이블에 balance를 두면 포인트 변경마다
        users 행 전체를 업데이트 → 불필요한 락 경합 발생
        별도 테이블로 분리하면 포인트 연산 시 users 테이블 터치 안 함
    """
    __tablename__ = "user_points"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        comment="users.id 참조"
    )
    balance: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="현재 보유 포인트 (항상 0 이상)"
    )
    total_earned: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="누적 획득 포인트"
    )
    total_spent: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="누적 사용 포인트"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship("User", back_populates="point_balance")
