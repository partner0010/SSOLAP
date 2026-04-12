"""
routers/users.py — 유저 프로필 & 팔로우 API
GET  /users/{username}          — 유저 프로필 조회
PUT  /users/me                  — 내 프로필 수정
POST /users/{username}/follow   — 팔로우 토글
GET  /users/{username}/followers — 팔로워 목록
GET  /users/{username}/following — 팔로잉 목록
GET  /users/{username}/posts    — 유저 게시물 목록
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.follow import Follow
from app.models.post import Post, PostLike
from app.schemas.user import UserResponse, UpdateProfileRequest
from app.schemas.post import FeedResponse, PostResponse, AuthorBrief, MediaResponse
from app.routers.deps import get_current_user, get_optional_user

router = APIRouter(prefix="/users", tags=["유저"])


# ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _user_to_response(user: User) -> UserResponse:
    balance = user.point_balance.balance if user.point_balance else 0
    return UserResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        bio=user.bio,
        avatar_url=user.avatar_url,
        role=user.role,
        is_verified=user.is_verified,
        is_active=user.is_active,
        follower_count=user.follower_count,
        following_count=user.following_count,
        post_count=user.post_count,
        point_balance=balance,
        created_at=user.created_at,
    )


async def _get_user_by_username(db: AsyncSession, username: str) -> User:
    user = await db.scalar(
        select(User)
        .options(selectinload(User.point_balance))
        .where(User.username == username.lower())
    )
    if not user:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없습니다")
    return user


# ─── 유저 프로필 조회 ─────────────────────────────────────────────────────────

class UserProfileResponse(UserResponse):
    is_following: bool = False   # 내가 이 유저를 팔로우하는지


@router.get("/{username}", response_model=UserProfileResponse, summary="유저 프로필")
async def get_user_profile(
    username: str,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    user = await _get_user_by_username(db, username)

    is_following = False
    if current_user and current_user.id != user.id:
        follow = await db.scalar(
            select(Follow).where(
                and_(
                    Follow.follower_id == current_user.id,
                    Follow.following_id == user.id,
                )
            )
        )
        is_following = follow is not None

    base = _user_to_response(user)
    return UserProfileResponse(**base.model_dump(), is_following=is_following)


# ─── 내 프로필 수정 ────────────────────────────────────────────────────────────

@router.put("/me/profile", response_model=UserResponse, summary="내 프로필 수정")
async def update_my_profile(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    if body.display_name is not None:
        current_user.display_name = body.display_name
    if body.bio is not None:
        current_user.bio = body.bio
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url

    await db.commit()
    await db.refresh(current_user)
    return _user_to_response(current_user)


# ─── 팔로우 토글 ──────────────────────────────────────────────────────────────

@router.post("/{username}/follow", summary="팔로우 / 언팔로우")
async def toggle_follow(
    username: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await _get_user_by_username(db, username)

    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신을 팔로우할 수 없습니다")

    existing = await db.scalar(
        select(Follow).where(
            and_(
                Follow.follower_id == current_user.id,
                Follow.following_id == target.id,
            )
        )
    )

    if existing:
        # 언팔로우
        await db.delete(existing)
        target.follower_count  = max(0, target.follower_count - 1)
        current_user.following_count = max(0, current_user.following_count - 1)
        followed = False
    else:
        # 팔로우
        db.add(Follow(follower_id=current_user.id, following_id=target.id))
        target.follower_count  += 1
        current_user.following_count += 1
        followed = True

    await db.commit()
    return {
        "followed":       followed,
        "follower_count": target.follower_count,
    }


# ─── 팔로워 목록 ──────────────────────────────────────────────────────────────

@router.get("/{username}/followers", response_model=list[UserResponse], summary="팔로워 목록")
async def get_followers(
    username: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    target = await _get_user_by_username(db, username)
    offset = (page - 1) * per_page

    follower_ids = await db.scalars(
        select(Follow.follower_id)
        .where(Follow.following_id == target.id)
        .offset(offset)
        .limit(per_page)
    )
    users = (await db.scalars(
        select(User)
        .options(selectinload(User.point_balance))
        .where(User.id.in_(list(follower_ids.all())))
    )).all()

    return [_user_to_response(u) for u in users]


# ─── 팔로잉 목록 ──────────────────────────────────────────────────────────────

@router.get("/{username}/following", response_model=list[UserResponse], summary="팔로잉 목록")
async def get_following(
    username: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    target = await _get_user_by_username(db, username)
    offset = (page - 1) * per_page

    following_ids = await db.scalars(
        select(Follow.following_id)
        .where(Follow.follower_id == target.id)
        .offset(offset)
        .limit(per_page)
    )
    users = (await db.scalars(
        select(User)
        .options(selectinload(User.point_balance))
        .where(User.id.in_(list(following_ids.all())))
    )).all()

    return [_user_to_response(u) for u in users]


# ─── 유저 게시물 목록 ─────────────────────────────────────────────────────────

@router.get("/{username}/posts", response_model=FeedResponse, summary="유저 게시물 목록")
async def get_user_posts(
    username: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> FeedResponse:
    target = await _get_user_by_username(db, username)
    offset = (page - 1) * per_page

    # 비공개 게시물: 본인만 조회 가능
    is_own = current_user and current_user.id == target.id
    filters = [Post.author_id == target.id]
    if not is_own:
        filters.append(Post.is_public.is_(True))

    total = await db.scalar(
        select(func.count(Post.id)).where(and_(*filters))
    ) or 0

    posts = (await db.scalars(
        select(Post)
        .options(selectinload(Post.author), selectinload(Post.media))
        .where(and_(*filters))
        .order_by(desc(Post.created_at))
        .offset(offset)
        .limit(per_page)
    )).all()

    post_ids = [p.id for p in posts]
    liked_ids: set[int] = set()
    if current_user and post_ids:
        rows = await db.scalars(
            select(PostLike.post_id).where(
                and_(PostLike.user_id == current_user.id, PostLike.post_id.in_(post_ids))
            )
        )
        liked_ids = set(rows.all())

    def _to_resp(post: Post) -> PostResponse:
        return PostResponse(
            id=post.id,
            author=AuthorBrief(
                id=post.author.id,
                username=post.author.username,
                display_name=post.author.display_name,
                avatar_url=post.author.avatar_url,
            ),
            content=post.content,
            post_type=post.post_type,
            is_public=post.is_public,
            like_count=post.like_count,
            comment_count=post.comment_count,
            view_count=post.view_count,
            media=[
                MediaResponse(
                    id=m.id, url=m.url, media_type=m.media_type,
                    width=m.width, height=m.height, duration=m.duration,
                    display_order=m.display_order,
                )
                for m in post.media
            ],
            is_liked=post.id in liked_ids,
            created_at=post.created_at,
            updated_at=post.updated_at,
        )

    return FeedResponse(
        posts=[_to_resp(p) for p in posts],
        total=total,
        page=page,
        per_page=per_page,
        has_next=(offset + per_page) < total,
    )
