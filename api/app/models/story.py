"""
models/story.py — 스토리 DB 모델
Story, StoryView
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _expires_default() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=24)


class Story(Base):
    """
    stories 테이블

    media_type: image | video
    expires_at: 생성 후 24시간 (기본값)
    """
    __tablename__ = "stories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    media_url:  Mapped[str]           = mapped_column(String(500), nullable=False)
    media_type: Mapped[str]           = mapped_column(String(10),  nullable=False, default="image")
    caption:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 조회 수 캐시
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 만료 시각 (24h 후)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # ── 관계 ──────────────────────────────────────────────────────────────────
    author:  Mapped["User"]            = relationship("User", back_populates="stories")
    viewers: Mapped[list["StoryView"]] = relationship(
        "StoryView", back_populates="story", cascade="all, delete-orphan",
    )


class StoryView(Base):
    """
    story_views 테이블 — 스토리 조회 기록 (viewer 중복 방지용)
    """
    __tablename__ = "story_views"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    story_id: Mapped[int] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    viewer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # ── 관계 ──────────────────────────────────────────────────────────────────
    story:  Mapped["Story"] = relationship("Story", back_populates="viewers")
    viewer: Mapped["User"]  = relationship("User")
