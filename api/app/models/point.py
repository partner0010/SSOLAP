"""
models/point.py — S포인트 거래 내역 DB 모델
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PointTransaction(Base):
    """
    point_transactions 테이블

    action 종류:
        daily_checkin     — 일일 출석 체크인 (+10)
        post_create       — 게시물 작성 (+20)
        comment_create    — 댓글 작성 (+5)
        like_milestone    — 좋아요 이정표 달성 (+50 etc)
        purchase          — 포인트 구매 (+N)
        spend_room_entry  — 채팅방 입장비 (-N)
        spend_boost       — 게시물 부스트 (-N)
        admin_grant       — 관리자 지급 (+N)
        admin_deduct      — 관리자 차감 (-N)
    """
    __tablename__ = "point_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(
        String(40), nullable=False,
        comment="거래 유형 (daily_checkin / post_create / ...)",
    )
    amount: Mapped[int] = mapped_column(
        Integer, nullable=False,
        comment="양수=획득, 음수=소비",
    )
    balance_after: Mapped[int] = mapped_column(
        Integer, nullable=False,
        comment="거래 후 잔액",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="표시용 설명 (예: '게시물 작성 보상')",
    )
    ref_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="관련 리소스 ID (post_id, comment_id 등)",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        sign = "+" if self.amount >= 0 else ""
        return f"<PointTx id={self.id} {self.action} {sign}{self.amount}>"
