"""
routers/posts.py — 게시물 API
GET  /posts/feed            — 팔로잉 피드
GET  /posts/explore         — 탐색 (전체 공개 게시물)
POST /posts                 — 게시물 작성
GET  /posts/{id}            — 단일 게시물 조회
PUT  /posts/{id}            — 게시물 수정
DELETE /posts/{id}          — 게시물 삭제
POST /posts/{id}/like       — 좋아요 토글
GET  /posts/{id}/comments   — 댓글 목록
POST /posts/{id}/comments   — 댓글 작성
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.post import Post, PostMedia, PostLike, Comment
from app.models.follow import Follow
from app.schemas.post import (
    CreatePostRequest,
    UpdatePostRequest,
    PostResponse,
    FeedResponse,
    AuthorBrief,
    MediaResponse,
    CommentResponse,
    CreateCommentRequest,
)
from app.routers.deps import get_current_user, get_optional_user

router = APIRouter(prefix="/posts", tags=["게시물"])


# ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

async def _get_liked_post_ids(
    db: AsyncSession, user_id: int, post_ids: list[int]
) -> set[int]:
    """현재 유저가 좋아요 누른 게시물 ID 집합"""
    if not post_ids:
        return set()
    rows = await db.scalars(
        select(PostLike.post_id).where(
            and_(PostLike.user_id == user_id, PostLike.post_id.in_(post_ids))
        )
    )
    return set(rows.all())


def _to_post_response(post: Post, liked_ids: set[int]) -> PostResponse:
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
                id=m.id,
                url=m.url,
                media_type=m.media_type,
                width=m.width,
                height=m.height,
                duration=m.duration,
                display_order=m.display_order,
            )
            for m in post.media
        ],
        is_liked=post.id in liked_ids,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


# ─── 피드 (팔로잉 기반) ──────────────────────────────────────────────────────

@router.get("/feed", response_model=FeedResponse, summary="팔로잉 피드")
async def get_feed(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FeedResponse:
    """
    팔로우한 유저들의 게시물 + 내 게시물 시간 역순
    """
    offset = (page - 1) * per_page

    # 팔로잉 ID 목록
    following_ids = await db.scalars(
        select(Follow.following_id).where(Follow.follower_id == current_user.id)
    )
    feed_user_ids = list(following_ids.all()) + [current_user.id]

    # 총 개수
    total = await db.scalar(
        select(func.count(Post.id)).where(
            and_(Post.author_id.in_(feed_user_ids), Post.is_public.is_(True))
        )
    ) or 0

    # 게시물 조회
    posts = (await db.scalars(
        select(Post)
        .options(selectinload(Post.author), selectinload(Post.media))
        .where(
            and_(Post.author_id.in_(feed_user_ids), Post.is_public.is_(True))
        )
        .order_by(desc(Post.created_at))
        .offset(offset)
        .limit(per_page)
    )).all()

    post_ids = [p.id for p in posts]
    liked_ids = await _get_liked_post_ids(db, current_user.id, post_ids)

    return FeedResponse(
        posts=[_to_post_response(p, liked_ids) for p in posts],
        total=total,
        page=page,
        per_page=per_page,
        has_next=(offset + per_page) < total,
    )


# ─── 탐색 (전체 공개) ─────────────────────────────────────────────────────────

@router.get("/explore", response_model=FeedResponse, summary="탐색 피드")
async def explore(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    post_type: Optional[str] = Query(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> FeedResponse:
    """공개 게시물 전체 (최신순)"""
    offset = (page - 1) * per_page

    filters = [Post.is_public.is_(True)]
    if post_type:
        filters.append(Post.post_type == post_type)

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
    liked_ids = (
        await _get_liked_post_ids(db, current_user.id, post_ids)
        if current_user else set()
    )

    return FeedResponse(
        posts=[_to_post_response(p, liked_ids) for p in posts],
        total=total,
        page=page,
        per_page=per_page,
        has_next=(offset + per_page) < total,
    )


# ─── 게시물 작성 ──────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
    summary="게시물 작성",
)
async def create_post(
    body: CreatePostRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PostResponse:
    body.validate_content()

    post = Post(
        author_id=current_user.id,
        content=body.content,
        post_type=body.post_type,
        is_public=body.is_public,
    )
    db.add(post)
    await db.flush()

    # 미디어 추가
    for idx, m in enumerate(body.media):
        db.add(PostMedia(
            post_id=post.id,
            url=m.url,
            media_type=m.media_type,
            width=m.width,
            height=m.height,
            duration=m.duration,
            display_order=idx,
        ))

    # 작성자 post_count 증가
    current_user.post_count += 1

    await db.commit()
    await db.refresh(post)

    # 관계 재로드
    post_with_rel = await db.scalar(
        select(Post)
        .options(selectinload(Post.author), selectinload(Post.media))
        .where(Post.id == post.id)
    )
    return _to_post_response(post_with_rel, set())


# ─── 단일 게시물 조회 ─────────────────────────────────────────────────────────

@router.get("/{post_id}", response_model=PostResponse, summary="게시물 조회")
async def get_post(
    post_id: int,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> PostResponse:
    post = await db.scalar(
        select(Post)
        .options(selectinload(Post.author), selectinload(Post.media))
        .where(Post.id == post_id)
    )
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다")
    if not post.is_public and (not current_user or current_user.id != post.author_id):
        raise HTTPException(status_code=403, detail="비공개 게시물입니다")

    # 조회수 증가
    post.view_count += 1
    await db.commit()

    liked_ids = (
        await _get_liked_post_ids(db, current_user.id, [post.id])
        if current_user else set()
    )
    return _to_post_response(post, liked_ids)


# ─── 게시물 수정 ──────────────────────────────────────────────────────────────

@router.put("/{post_id}", response_model=PostResponse, summary="게시물 수정")
async def update_post(
    post_id: int,
    body: UpdatePostRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PostResponse:
    post = await db.scalar(
        select(Post)
        .options(selectinload(Post.author), selectinload(Post.media))
        .where(Post.id == post_id)
    )
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다")
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    if body.content is not None:
        post.content = body.content
    if body.is_public is not None:
        post.is_public = body.is_public

    await db.commit()
    await db.refresh(post)

    liked_ids = await _get_liked_post_ids(db, current_user.id, [post.id])
    return _to_post_response(post, liked_ids)


# ─── 게시물 삭제 ──────────────────────────────────────────────────────────────

@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT, summary="게시물 삭제")
async def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다")
    if post.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    await db.delete(post)
    current_user.post_count = max(0, current_user.post_count - 1)
    await db.commit()


# ─── 좋아요 토글 ──────────────────────────────────────────────────────────────

@router.post("/{post_id}/like", summary="좋아요 토글")
async def toggle_like(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """좋아요 누르면 +1, 이미 눌렀으면 취소 -1"""
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다")

    existing = await db.scalar(
        select(PostLike).where(
            and_(PostLike.user_id == current_user.id, PostLike.post_id == post_id)
        )
    )

    if existing:
        await db.delete(existing)
        post.like_count = max(0, post.like_count - 1)
        liked = False
    else:
        db.add(PostLike(user_id=current_user.id, post_id=post_id))
        post.like_count += 1
        liked = True

    await db.commit()
    return {"liked": liked, "like_count": post.like_count}


# ─── 댓글 목록 ────────────────────────────────────────────────────────────────

@router.get("/{post_id}/comments", response_model=list[CommentResponse], summary="댓글 목록")
async def get_comments(
    post_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[CommentResponse]:
    offset = (page - 1) * per_page
    comments = (await db.scalars(
        select(Comment)
        .options(selectinload(Comment.author))
        .where(and_(Comment.post_id == post_id, Comment.parent_id.is_(None)))
        .order_by(Comment.created_at)
        .offset(offset)
        .limit(per_page)
    )).all()

    return [
        CommentResponse(
            id=c.id,
            post_id=c.post_id,
            author=AuthorBrief(
                id=c.author.id,
                username=c.author.username,
                display_name=c.author.display_name,
                avatar_url=c.author.avatar_url,
            ),
            parent_id=c.parent_id,
            content=c.content,
            like_count=c.like_count,
            created_at=c.created_at,
        )
        for c in comments
    ]


# ─── 댓글 작성 ────────────────────────────────────────────────────────────────

@router.post(
    "/{post_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="댓글 작성",
)
async def create_comment(
    post_id: int,
    body: CreateCommentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentResponse:
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다")

    # 대댓글 검증
    if body.parent_id:
        parent = await db.get(Comment, body.parent_id)
        if not parent or parent.post_id != post_id:
            raise HTTPException(status_code=400, detail="유효하지 않은 부모 댓글입니다")

    comment = Comment(
        post_id=post_id,
        author_id=current_user.id,
        parent_id=body.parent_id,
        content=body.content,
    )
    db.add(comment)
    post.comment_count += 1
    await db.flush()

    # author 로드
    await db.refresh(comment)
    comment_with_author = await db.scalar(
        select(Comment)
        .options(selectinload(Comment.author))
        .where(Comment.id == comment.id)
    )

    await db.commit()

    return CommentResponse(
        id=comment_with_author.id,
        post_id=comment_with_author.post_id,
        author=AuthorBrief(
            id=comment_with_author.author.id,
            username=comment_with_author.author.username,
            display_name=comment_with_author.author.display_name,
            avatar_url=comment_with_author.author.avatar_url,
        ),
        parent_id=comment_with_author.parent_id,
        content=comment_with_author.content,
        like_count=comment_with_author.like_count,
        created_at=comment_with_author.created_at,
    )
