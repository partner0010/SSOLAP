"""
models/notification.py — 알림 DB 모델
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Notification(Base):
    """
    notifications 테이블

    noti_type:
        follow          — A가 B를 팔로우
        like            — A가 B의 게시물에 좋아요
        comment         — A가 B의 게시물에 댓글
        comment_reply   — A가 B의 댓글에 대댓글
        mention         — 게시물/댓글에 @언급
        room_invite     — 채팅방 초대
        point_earned    — 포인트 획득
        system          — 시스템 공지
    """
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # 알림 수신자
    recipient_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # 알림 발생 주체 (시스템 알림은 null)
    actor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    noti_type: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="follow | like | comment | comment_reply | mention | room_invite | point_earned | system",
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)

    # 관련 리소스 링크 (프론트에서 클릭 시 이동)
    link: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # 읽음 여부
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True,
    )

    # 관계
    recipient: Mapped["User"] = relationship("User", foreign_keys=[recipient_id])
    actor:     Mapped[Optional["User"]] = relationship("User", foreign_keys=[actor_id])

    def __repr__(self) -> str:
        return f"<Notification id={self.id} type={self.noti_type!r} to={self.recipient_id}>"
