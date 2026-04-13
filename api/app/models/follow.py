"""
models/follow.py — 팔로우 관계 DB 모델
"""
from datetime import datetime

from sqlalchemy import (
    DateTime, ForeignKey, Integer, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Follow(Base):
    """
    follows 테이블 — 팔로우 관계 (user ↔ user M:N)

    follower_id  → 팔로우를 「하는」 유저
    following_id → 팔로우를 「받는」 유저

    예: A가 B를 팔로우 = follower_id=A, following_id=B
    """
    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follow"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    follower_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="팔로우를 하는 유저",
    )
    following_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="팔로우를 받는 유저",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )

    follower:  Mapped["User"] = relationship("User", foreign_keys=[follower_id])
    following: Mapped["User"] = relationship("User", foreign_keys=[following_id])

    def __repr__(self) -> str:
        return f"<Follow {self.follower_id} → {self.following_id}>"
