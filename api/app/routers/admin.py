"""
routers/admin.py — 어드민 API
GET  /admin/stats              — 플랫폼 통계 (유저수, 게시물수, 채팅방수, 포인트)
GET  /admin/users              — 유저 목록 (검색, 정렬, 페이지네이션)
GET  /admin/users/{id}         — 유저 상세
PATCH /admin/users/{id}        — 유저 역할/활성 상태 변경
DELETE /admin/users/{id}       — 유저 삭제
POST /admin/users/{id}/grant-points — 포인트 지급/차감
GET  /admin/posts              — 게시물 목록
DELETE /admin/posts/{id}       — 게시물 삭제
GET  /admin/notifications/broadcast — 전체 알림 발송
"""
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User, UserPoints
from app.models.post import Post
from app.models.chat import ChatRoom
from app.models.notification import Notification
from app.models.point import PointTransaction
from app.routers.deps import get_admin_user
from app.services.point_service import award_points, spend_points
from app.services.notification_service import create_notification

router = APIRouter(prefix="/admin", tags=["어드민"])


# ─── 스키마 ───────────────────────────────────────────────────────────────────

class AdminUserItem(BaseModel):
    id:              int
    username:        str
    display_name:    str
    email:           str
    role:            str
    is_active:       bool
    is_verified:     bool
    follower_count:  int
    following_count: int
    post_count:      int
    point_balance:   int
    created_at:      datetime
    last_login_at:   Optional[datetime] = None

    model_config = {"from_attributes": True}


class AdminUserListResponse(BaseModel):
    users:    list[AdminUserItem]
    total:    int
    page:     int
    per_page: int
    has_next: bool


class UpdateUserRequest(BaseModel):
    role:      Optional[str]  = Field(None, pattern="^(user|creator|admin)$")
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None


class GrantPointsRequest(BaseModel):
    amount:      int    = Field(..., description="양수: 지급, 음수: 차감")
    description: str    = Field(..., min_length=1, max_length=200)


class BroadcastRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    link:    Optional[str] = None


class PlatformStats(BaseModel):
    total_users:    int
    active_users:   int
    total_posts:    int
    total_rooms:    int
    total_points_issued: int
    new_users_today:     int
    new_posts_today:     int


class AdminPostItem(BaseModel):
    id:           int
    author_id:    int
    author_username: str
    content:      Optional[str]
    post_type:    str
    is_public:    bool
    like_count:   int
    comment_count: int
    view_count:   int
    created_at:   datetime


class AdminPostListResponse(BaseModel):
    posts:    list[AdminPostItem]
    total:    int
    page:     int
    per_page: int
    has_next: bool


# ─── 플랫폼 통계 ──────────────────────────────────────────────────────────────

@router.get("/stats", response_model=PlatformStats, summary="플랫폼 통계")
async def get_stats(
    admin: User = Depends(get_admin_user),
    db:    AsyncSession = Depends(get_db),
) -> PlatformStats:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    total_users   = await db.scalar(select(func.count(User.id))) or 0
    active_users  = await db.scalar(select(func.count(User.id)).where(User.is_active.is_(True))) or 0
    total_posts   = await db.scalar(select(func.count(Post.id))) or 0
    total_rooms   = await db.scalar(select(func.count(ChatRoom.id))) or 0
    total_points  = await db.scalar(select(func.sum(UserPoints.total_earned))) or 0
    new_users_today = await db.scalar(
        select(func.count(User.id)).where(User.created_at >= today_start)
    ) or 0
    new_posts_today = await db.scalar(
        select(func.count(Post.id)).where(Post.created_at >= today_start)
    ) or 0

    return PlatformStats(
        total_users=total_users,
        active_users=active_users,
        total_posts=total_posts,
        total_rooms=total_rooms,
        total_points_issued=total_points,
        new_users_today=new_users_today,
        new_posts_today=new_posts_today,
    )


# ─── 유저 목록 ────────────────────────────────────────────────────────────────

@router.get("/users", response_model=AdminUserListResponse, summary="유저 목록")
async def list_users(
    page:     int           = Query(1, ge=1),
    per_page: int           = Query(20, ge=1, le=100),
    q:        Optional[str] = Query(None, description="username/email/display_name 검색"),
    role:     Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    admin:    User          = Depends(get_admin_user),
    db:       AsyncSession  = Depends(get_db),
) -> AdminUserListResponse:
    offset = (page - 1) * per_page
    filters = []
    if q:
        # LIKE 메타문자 이스케이프 (SQL Injection 방어)
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like    = f"%{escaped}%"
        filters.append(
            (User.username.like(like, escape="\\")) |
            (User.email.like(like, escape="\\")) |
            (User.display_name.like(like, escape="\\"))
        )
    if role:
        filters.append(User.role == role)
    if is_active is not None:
        filters.append(User.is_active.is_(is_active))

    from sqlalchemy import and_
    where_clause = and_(*filters) if filters else True

    total = await db.scalar(select(func.count(User.id)).where(where_clause)) or 0
    users = (await db.scalars(
        select(User)
        .where(where_clause)
        .order_by(desc(User.created_at))
        .offset(offset).limit(per_page)
    )).all()

    # 포인트 잔액 로드
    user_ids = [u.id for u in users]
    point_rows = (await db.execute(
        select(UserPoints.user_id, UserPoints.balance).where(UserPoints.user_id.in_(user_ids))
    )).all()
    point_map = {row.user_id: row.balance for row in point_rows}

    items = [
        AdminUserItem(
            id=u.id, username=u.username, display_name=u.display_name,
            email=u.email, role=u.role, is_active=u.is_active,
            is_verified=u.is_verified, follower_count=u.follower_count,
            following_count=u.following_count, post_count=u.post_count,
            point_balance=point_map.get(u.id, 0),
            created_at=u.created_at, last_login_at=u.last_login_at,
        )
        for u in users
    ]

    return AdminUserListResponse(
        users=items, total=total, page=page,
        per_page=per_page, has_next=(offset + per_page) < total,
    )


# ─── 유저 상태 변경 ───────────────────────────────────────────────────────────

@router.patch("/users/{user_id}", response_model=AdminUserItem, summary="유저 역할/상태 변경")
async def update_user(
    user_id: int,
    body:    UpdateUserRequest,
    admin:   User = Depends(get_admin_user),
    db:      AsyncSession = Depends(get_db),
) -> AdminUserItem:
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없습니다")
    if target.id == admin.id and body.role and body.role != "admin":
        raise HTTPException(status_code=400, detail="자신의 어드민 권한은 해제할 수 없습니다")

    if body.role       is not None: target.role        = body.role
    if body.is_active  is not None: target.is_active   = body.is_active
    if body.is_verified is not None: target.is_verified = body.is_verified

    await db.commit()

    pt = await db.scalar(select(UserPoints).where(UserPoints.user_id == target.id))
    return AdminUserItem(
        id=target.id, username=target.username, display_name=target.display_name,
        email=target.email, role=target.role, is_active=target.is_active,
        is_verified=target.is_verified, follower_count=target.follower_count,
        following_count=target.following_count, post_count=target.post_count,
        point_balance=pt.balance if pt else 0,
        created_at=target.created_at, last_login_at=target.last_login_at,
    )


# ─── 유저 삭제 ────────────────────────────────────────────────────────────────

@router.delete("/users/{user_id}", status_code=204, summary="유저 비활성화 (소프트 삭제)")
async def delete_user(
    user_id: int,
    admin:   User = Depends(get_admin_user),
    db:      AsyncSession = Depends(get_db),
) -> None:
    """
    유저 계정을 완전 삭제하지 않고 is_active=False로 비활성화합니다.
    - 한국 개인정보보호법: 거래·포인트 기록 보관 의무(5년) 준수
    - 법적 분쟁 시 증거 보전
    """
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없습니다")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="자신의 계정은 비활성화할 수 없습니다")
    target.is_active = False
    await db.commit()


# ─── 포인트 지급/차감 ─────────────────────────────────────────────────────────

@router.post("/users/{user_id}/grant-points", summary="포인트 지급/차감")
async def grant_points(
    user_id: int,
    body:    GrantPointsRequest,
    admin:   User = Depends(get_admin_user),
    db:      AsyncSession = Depends(get_db),
) -> dict:
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없습니다")

    if body.amount >= 0:
        await award_points(
            db, user=target, action="admin_grant",
            amount=body.amount, description=body.description,
        )
    else:
        await spend_points(
            db, user=target, action="admin_deduct",
            amount=abs(body.amount), description=body.description,
        )
    await db.commit()

    pt = await db.scalar(select(UserPoints).where(UserPoints.user_id == target.id))
    return {"success": True, "new_balance": pt.balance if pt else 0}


# ─── 게시물 목록 ──────────────────────────────────────────────────────────────

@router.get("/posts", response_model=AdminPostListResponse, summary="게시물 목록")
async def list_posts(
    page:     int           = Query(1, ge=1),
    per_page: int           = Query(20, ge=1, le=100),
    q:        Optional[str] = Query(None, description="내용 검색"),
    post_type: Optional[str] = Query(None),
    admin:    User          = Depends(get_admin_user),
    db:       AsyncSession  = Depends(get_db),
) -> AdminPostListResponse:
    from sqlalchemy import and_
    from sqlalchemy.orm import selectinload

    offset = (page - 1) * per_page
    filters = []
    if q:
        filters.append(Post.content.like(f"%{q}%"))
    if post_type:
        filters.append(Post.post_type == post_type)

    where_clause = and_(*filters) if filters else True

    total = await db.scalar(select(func.count(Post.id)).where(where_clause)) or 0
    posts = (await db.scalars(
        select(Post)
        .options(selectinload(Post.author))
        .where(where_clause)
        .order_by(desc(Post.created_at))
        .offset(offset).limit(per_page)
    )).all()

    items = [
        AdminPostItem(
            id=p.id, author_id=p.author_id,
            author_username=p.author.username if p.author else "삭제됨",
            content=p.content, post_type=p.post_type,
            is_public=p.is_public, like_count=p.like_count,
            comment_count=p.comment_count, view_count=p.view_count,
            created_at=p.created_at,
        )
        for p in posts
    ]

    return AdminPostListResponse(
        posts=items, total=total, page=page,
        per_page=per_page, has_next=(offset + per_page) < total,
    )


# ─── 게시물 강제 삭제 ─────────────────────────────────────────────────────────

@router.delete("/posts/{post_id}", status_code=204, summary="게시물 강제 삭제")
async def admin_delete_post(
    post_id: int,
    admin:   User = Depends(get_admin_user),
    db:      AsyncSession = Depends(get_db),
) -> None:
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다")
    await db.delete(post)
    await db.commit()


# ─── 전체 알림 발송 ───────────────────────────────────────────────────────────

@router.post("/notifications/broadcast", summary="전체 유저 시스템 알림 발송")
async def broadcast_notification(
    body:  BroadcastRequest,
    admin: User = Depends(get_admin_user),
    db:    AsyncSession = Depends(get_db),
) -> dict:
    """모든 활성 유저에게 시스템 알림을 발송합니다 (최대 1000명)."""
    user_ids = (await db.scalars(
        select(User.id).where(User.is_active.is_(True)).limit(1000)
    )).all()

    count = 0
    for uid in user_ids:
        await create_notification(
            db, recipient_id=uid, noti_type="system",
            message=body.message, link=body.link,
        )
        count += 1

    return {"sent": count}
