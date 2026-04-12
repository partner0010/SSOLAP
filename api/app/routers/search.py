"""
routers/search.py — 통합 검색 API
GET /search?q=키워드&type=all|user|post|room

SQLite LIKE 기반 전문 검색
(PostgreSQL 전환 시 tsvector 풀텍스트 검색으로 업그레이드 가능)
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.models.user import User
from app.models.post import Post
from app.models.chat import ChatRoom
from app.routers.deps import get_optional_user

router = APIRouter(prefix="/search", tags=["검색"])


# ─── 응답 스키마 ──────────────────────────────────────────────────────────────

class UserResult(BaseModel):
    id:              int
    username:        str
    display_name:    str
    bio:             Optional[str] = None
    avatar_url:      Optional[str] = None
    follower_count:  int
    is_verified:     bool

    model_config = {"from_attributes": True}


class PostResult(BaseModel):
    id:            int
    content:       Optional[str] = None
    post_type:     str
    like_count:    int
    comment_count: int
    author_username:     str
    author_display_name: str
    created_at:    datetime

    model_config = {"from_attributes": True}


class RoomResult(BaseModel):
    id:           int
    name:         str
    description:  Optional[str] = None
    room_type:    str
    entry_type:   str
    entry_fee:    int
    member_count: int
    created_at:   datetime

    model_config = {"from_attributes": True}


class SearchResponse(BaseModel):
    query:       str
    users:       list[UserResult]    = []
    posts:       list[PostResult]    = []
    rooms:       list[RoomResult]    = []
    user_total:  int = 0
    post_total:  int = 0
    room_total:  int = 0


# ─── 통합 검색 ────────────────────────────────────────────────────────────────

@router.get("", response_model=SearchResponse, summary="통합 검색")
async def search(
    q:        str  = Query(..., min_length=1, max_length=100, description="검색어"),
    type:     str  = Query("all", pattern="^(all|user|post|room)$"),
    page:     int  = Query(1, ge=1),
    per_page: int  = Query(10, ge=1, le=30),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """
    유저 / 게시물 / 채팅방을 키워드로 통합 검색

    - type=all   : 세 가지 모두 검색 (각 per_page개)
    - type=user  : 유저만
    - type=post  : 게시물만
    - type=room  : 채팅방만
    """
    kw      = f"%{q}%"
    offset  = (page - 1) * per_page
    users, posts, rooms = [], [], []
    user_total = post_total = room_total = 0

    # ── 유저 검색 ─────────────────────────────────────────────────────
    if type in ("all", "user"):
        user_total = await db.scalar(
            select(func.count(User.id)).where(
                or_(
                    User.username.ilike(kw),
                    User.display_name.ilike(kw),
                    User.bio.ilike(kw),
                )
            )
        ) or 0

        user_rows = (await db.scalars(
            select(User)
            .where(
                or_(
                    User.username.ilike(kw),
                    User.display_name.ilike(kw),
                    User.bio.ilike(kw),
                )
            )
            .order_by(desc(User.follower_count))
            .offset(offset)
            .limit(per_page)
        )).all()

        users = [
            UserResult(
                id=u.id, username=u.username, display_name=u.display_name,
                bio=u.bio, avatar_url=u.avatar_url,
                follower_count=u.follower_count, is_verified=u.is_verified,
            )
            for u in user_rows
        ]

    # ── 게시물 검색 ───────────────────────────────────────────────────
    if type in ("all", "post"):
        post_total = await db.scalar(
            select(func.count(Post.id)).where(
                Post.is_public.is_(True),
                Post.content.ilike(kw),
            )
        ) or 0

        post_rows = (await db.scalars(
            select(Post)
            .options(selectinload(Post.author))
            .where(Post.is_public.is_(True), Post.content.ilike(kw))
            .order_by(desc(Post.like_count), desc(Post.created_at))
            .offset(offset)
            .limit(per_page)
        )).all()

        posts = [
            PostResult(
                id=p.id, content=p.content, post_type=p.post_type,
                like_count=p.like_count, comment_count=p.comment_count,
                author_username=p.author.username,
                author_display_name=p.author.display_name,
                created_at=p.created_at,
            )
            for p in post_rows
        ]

    # ── 채팅방 검색 ───────────────────────────────────────────────────
    if type in ("all", "room"):
        room_total = await db.scalar(
            select(func.count(ChatRoom.id)).where(
                ChatRoom.is_public.is_(True),
                or_(
                    ChatRoom.name.ilike(kw),
                    ChatRoom.description.ilike(kw),
                ),
            )
        ) or 0

        room_rows = (await db.scalars(
            select(ChatRoom)
            .where(
                ChatRoom.is_public.is_(True),
                or_(
                    ChatRoom.name.ilike(kw),
                    ChatRoom.description.ilike(kw),
                ),
            )
            .order_by(desc(ChatRoom.member_count))
            .offset(offset)
            .limit(per_page)
        )).all()

        rooms = [
            RoomResult(
                id=r.id, name=r.name, description=r.description,
                room_type=r.room_type, entry_type=r.entry_type,
                entry_fee=r.entry_fee, member_count=r.member_count,
                created_at=r.created_at,
            )
            for r in room_rows
        ]

    return SearchResponse(
        query=q,
        users=users, user_total=user_total,
        posts=posts, post_total=post_total,
        rooms=rooms, room_total=room_total,
    )
