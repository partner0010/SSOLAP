"""
models/post.py — 게시물 DB 모델
Post, PostMedia, PostLike, Comment
"""
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer,
    String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Post(Base):
    """
    posts 테이블

    post_type:
        text   — 텍스트만
        image  — 이미지 1장 이상
        video  — 일반 영상
        short  — 숏폼 (세로형 30초 이내)
    """
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    post_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="text",
        comment="text | image | video | short",
    )
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # ── 통계 캐시 ─────────────────────────────────────────────────────────────
    like_count:    Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    view_count:    Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── 타임스탬프 ────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=False,
    )

    # ── 관계 ──────────────────────────────────────────────────────────────────
    author: Mapped["User"] = relationship("User", back_populates="posts")
    media: Mapped[List["PostMedia"]] = relationship(
        "PostMedia", back_populates="post",
        cascade="all, delete-orphan",
        order_by="PostMedia.display_order",
        lazy="selectin",
    )
    likes: Mapped[List["PostLike"]] = relationship(
        "PostLike", back_populates="post", cascade="all, delete-orphan",
    )
    comments: Mapped[List["Comment"]] = relationship(
        "Comment", back_populates="post", cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Post id={self.id} type={self.post_type!r}>"


class PostMedia(Base):
    """post_media 테이블 — 첨부 미디어 (이미지/영상)"""
    __tablename__ = "post_media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    media_type: Mapped[str] = mapped_column(
        String(10), nullable=False, comment="image | video",
    )
    width:    Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)
    height:   Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)
    duration: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True, comment="영상 길이(초)",
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    post: Mapped["Post"] = relationship("Post", back_populates="media")


class PostLike(Base):
    """post_likes 테이블 — 좋아요 (user ↔ post M:N)"""
    __tablename__ = "post_likes"
    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_post_like"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )

    post: Mapped["Post"] = relationship("Post", back_populates="likes")
    user: Mapped["User"] = relationship("User")


class Comment(Base):
    """comments 테이블 — 댓글 & 대댓글"""
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"),
        nullable=True, index=True,
        comment="대댓글: 부모 댓글 ID (null = 최상위 댓글)",
    )
    content:    Mapped[str] = mapped_column(Text, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=False,
    )

    post:   Mapped["Post"] = relationship("Post", back_populates="comments")
    author: Mapped["User"] = relationship("User")
    replies: Mapped[List["Comment"]] = relationship(
        "Comment",
        foreign_keys="[Comment.parent_id]",
        back_populates="parent_comment",
        cascade="all, delete-orphan",
    )
    parent_comment: Mapped[Optional["Comment"]] = relationship(
        "Comment",
        foreign_keys="[Comment.parent_id]",
        back_populates="replies",
        remote_side="Comment.id",
    )

    def __repr__(self) -> str:
        return f"<Comment id={self.id} post_id={self.post_id}>"
