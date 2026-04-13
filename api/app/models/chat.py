"""
models/chat.py — 채팅 DB 모델
ChatRoom, ChatMember, ChatMessage
"""
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer,
    String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ChatRoom(Base):
    """
    chat_rooms 테이블

    room_type:
        direct  — 1:1 DM
        group   — 그룹 채팅 (최대 500명)
        channel — 공개 채널 (구독형)

    entry_type:
        open     — 누구나 입장
        password — 비밀번호 입장
        point    — S포인트 입장료
        invite   — 초대 전용
    """
    __tablename__ = "chat_rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    room_type: Mapped[str] = mapped_column(
        String(10), nullable=False, default="group",
        comment="direct | group | channel",
    )
    entry_type: Mapped[str] = mapped_column(
        String(10), nullable=False, default="open",
        comment="open | password | point | invite",
    )
    entry_password: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    entry_fee:      Mapped[int]            = mapped_column(Integer, nullable=False, default=0)
    max_members:    Mapped[int]            = mapped_column(Integer, nullable=False, default=500)
    member_count:   Mapped[int]            = mapped_column(Integer, nullable=False, default=0)
    is_public:      Mapped[bool]           = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # 관계
    owner:    Mapped[Optional["User"]]      = relationship("User", foreign_keys=[owner_id])
    members:  Mapped[List["ChatMember"]]    = relationship(
        "ChatMember", back_populates="room", cascade="all, delete-orphan",
    )
    messages: Mapped[List["ChatMessage"]]   = relationship(
        "ChatMessage", back_populates="room", cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<ChatRoom id={self.id} name={self.name!r}>"


class ChatMember(Base):
    """chat_members 테이블 — 채팅방 멤버십"""
    __tablename__ = "chat_members"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_chat_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    role: Mapped[str] = mapped_column(
        String(10), nullable=False, default="member",
        comment="owner | admin | member",
    )
    # 마지막 읽은 메시지 ID (미읽음 카운트 계산용)
    last_read_message_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )

    room: Mapped["ChatRoom"] = relationship("ChatRoom", back_populates="members")
    user: Mapped["User"]     = relationship("User")


class ChatMessage(Base):
    """
    chat_messages 테이블

    message_type:
        text   — 일반 텍스트
        image  — 이미지
        video  — 영상
        system — 시스템 메시지 (입장/퇴장 등)
        secret — 비밀 메시지 (수신자만 열람)
    """
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    sender_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    message_type: Mapped[str] = mapped_column(
        String(10), nullable=False, default="text",
        comment="text | image | video | system | secret",
    )
    content:      Mapped[str]          = mapped_column(Text, nullable=False)
    media_url:    Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # 비밀 메시지: 수신자 user_id (단일 대상)
    secret_recipient_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True,
    )

    # 관계
    room:   Mapped["ChatRoom"]      = relationship("ChatRoom", back_populates="messages")
    sender: Mapped[Optional["User"]] = relationship("User", foreign_keys=[sender_id])
    secret_recipient: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[secret_recipient_id],
    )

    def __repr__(self) -> str:
        return f"<ChatMessage id={self.id} room={self.room_id}>"
