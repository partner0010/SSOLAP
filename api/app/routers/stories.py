"""
routers/stories.py — 스토리 API
────────────────────────────────────────────────────────────
GET  /stories/feed          — 팔로잉 유저 스토리 피드 (그룹)
POST /stories               — 스토리 생성
DELETE /stories/{id}        — 스토리 삭제 (본인만)
POST /stories/{id}/view     — 조회 기록
GET  /stories/{id}/viewers  — 조회자 목록 (본인 스토리만)
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.follow import Follow
from app.models.story import Story, StoryView
from app.schemas.story import (
    StoryResponse, StoryAuthorBrief,
    UserStoriesGroup, StoriesFeedResponse,
    StoryViewerItem, StoryViewersResponse,
)
from app.routers.deps import get_current_user

router = APIRouter(prefix="/stories", tags=["스토리"])


# ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _to_story_response(story: Story, viewed_ids: set[int]) -> StoryResponse:
    return StoryResponse(
        id=story.id,
        media_url=story.media_url,
        media_type=story.media_type,
        caption=story.caption,
        view_count=story.view_count,
        expires_at=story.expires_at,
        created_at=story.created_at,
        author=StoryAuthorBrief(
            id=story.author.id,
            username=story.author.username,
            display_name=story.author.display_name,
            avatar_url=story.author.avatar_url,
        ),
        is_viewed=(story.id in viewed_ids),
    )


# ─── 피드 ─────────────────────────────────────────────────────────────────────

@router.get("/feed", response_model=StoriesFeedResponse)
async def get_stories_feed(
    db:   AsyncSession = Depends(get_db),
    me:   User         = Depends(get_current_user),
):
    """
    팔로잉 유저 + 본인의 활성 스토리를 유저별로 그룹화해 반환.
    내 스토리가 맨 앞.
    """
    now = _now_utc()

    # ── 1. 팔로잉 user_id 목록 ─────────────────────────────────────────────
    following_ids_q = await db.execute(
        select(Follow.following_id).where(Follow.follower_id == me.id)
    )
    following_ids: list[int] = [r for (r,) in following_ids_q.all()]

    # 나 자신 포함
    target_ids = list({me.id, *following_ids})

    # ── 2. 활성 스토리 조회 (만료되지 않은 것) ─────────────────────────────
    stories_q = await db.execute(
        select(Story)
        .options(selectinload(Story.author))
        .where(
            and_(
                Story.user_id.in_(target_ids),
                Story.expires_at > now,
            )
        )
        .order_by(Story.user_id, Story.created_at)
    )
    stories: list[Story] = list(stories_q.scalars().all())

    if not stories:
        return StoriesFeedResponse(groups=[])

    story_ids = [s.id for s in stories]

    # ── 3. 내가 본 스토리 id 목록 ─────────────────────────────────────────
    viewed_q = await db.execute(
        select(StoryView.story_id)
        .where(
            and_(
                StoryView.viewer_id == me.id,
                StoryView.story_id.in_(story_ids),
            )
        )
    )
    viewed_ids: set[int] = {r for (r,) in viewed_q.all()}

    # ── 4. 유저별 그룹화 ──────────────────────────────────────────────────
    groups_map: dict[int, list[Story]] = {}
    for s in stories:
        groups_map.setdefault(s.user_id, []).append(s)

    # 내 스토리 먼저, 그 다음 팔로잉 순
    ordered_ids = []
    if me.id in groups_map:
        ordered_ids.append(me.id)
    for uid in following_ids:
        if uid in groups_map:
            ordered_ids.append(uid)

    groups = []
    for uid in ordered_ids:
        user_stories = groups_map[uid]
        author = user_stories[0].author
        story_responses = [_to_story_response(s, viewed_ids) for s in user_stories]
        has_unseen = any(not sr.is_viewed for sr in story_responses)
        groups.append(
            UserStoriesGroup(
                user_id=uid,
                username=author.username,
                display_name=author.display_name,
                avatar_url=author.avatar_url,
                has_unseen=has_unseen,
                stories=story_responses,
            )
        )

    return StoriesFeedResponse(groups=groups)


# ─── 생성 ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=StoryResponse, status_code=status.HTTP_201_CREATED)
async def create_story(
    media_url:  str,
    media_type: str = Query("image", pattern="^(image|video)$"),
    caption:    Optional[str] = Query(None, max_length=200),
    db:         AsyncSession = Depends(get_db),
    me:         User         = Depends(get_current_user),
):
    """
    스토리 생성 (24시간 후 자동 만료).
    media_url 은 /upload 엔드포인트로 먼저 업로드 후 받은 URL을 넘기면 됩니다.
    """
    story = Story(
        user_id=me.id,
        media_url=media_url,
        media_type=media_type,
        caption=caption,
        expires_at=_now_utc() + timedelta(hours=24),
    )
    db.add(story)
    await db.flush()

    # author 관계 직접 할당 (조회 없이)
    story.author = me

    await db.commit()
    await db.refresh(story)

    # author 다시 로드
    result = await db.execute(
        select(Story).options(selectinload(Story.author)).where(Story.id == story.id)
    )
    story = result.scalar_one()

    return _to_story_response(story, set())


# ─── 삭제 ─────────────────────────────────────────────────────────────────────

@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_story(
    story_id: int,
    db:       AsyncSession = Depends(get_db),
    me:       User         = Depends(get_current_user),
):
    result = await db.execute(select(Story).where(Story.id == story_id))
    story: Optional[Story] = result.scalar_one_or_none()

    if not story:
        raise HTTPException(status_code=404, detail="스토리를 찾을 수 없습니다")
    if story.user_id != me.id:
        raise HTTPException(status_code=403, detail="본인 스토리만 삭제할 수 있습니다")

    await db.delete(story)
    await db.commit()


# ─── 조회 기록 ────────────────────────────────────────────────────────────────

@router.post("/{story_id}/view", status_code=status.HTTP_204_NO_CONTENT)
async def view_story(
    story_id: int,
    db:       AsyncSession = Depends(get_db),
    me:       User         = Depends(get_current_user),
):
    """스토리 조회 기록 (중복 방지 — 이미 봤으면 무시)"""
    result = await db.execute(select(Story).where(Story.id == story_id))
    story: Optional[Story] = result.scalar_one_or_none()

    if not story:
        raise HTTPException(status_code=404, detail="스토리를 찾을 수 없습니다")

    # 만료 체크
    if story.expires_at < _now_utc():
        raise HTTPException(status_code=410, detail="만료된 스토리입니다")

    # 본인 스토리는 조회 수 안 올림
    if story.user_id == me.id:
        return

    # 중복 체크
    exists_q = await db.execute(
        select(StoryView.id).where(
            and_(StoryView.story_id == story_id, StoryView.viewer_id == me.id)
        )
    )
    if exists_q.scalar_one_or_none():
        return  # 이미 봤음

    # 새 조회 기록 추가 + 카운트 증가
    view = StoryView(story_id=story_id, viewer_id=me.id)
    story.view_count += 1
    db.add(view)
    await db.commit()


# ─── 조회자 목록 (본인 스토리만) ──────────────────────────────────────────────

@router.get("/{story_id}/viewers", response_model=StoryViewersResponse)
async def get_story_viewers(
    story_id: int,
    db:       AsyncSession = Depends(get_db),
    me:       User         = Depends(get_current_user),
):
    result = await db.execute(select(Story).where(Story.id == story_id))
    story: Optional[Story] = result.scalar_one_or_none()

    if not story:
        raise HTTPException(status_code=404, detail="스토리를 찾을 수 없습니다")
    if story.user_id != me.id:
        raise HTTPException(status_code=403, detail="본인 스토리의 조회자만 볼 수 있습니다")

    viewers_q = await db.execute(
        select(StoryView, User)
        .join(User, User.id == StoryView.viewer_id)
        .where(StoryView.story_id == story_id)
        .order_by(StoryView.viewed_at.desc())
        .limit(200)
    )
    rows = viewers_q.all()

    viewers = [
        StoryViewerItem(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            viewed_at=sv.viewed_at,
        )
        for sv, user in rows
    ]

    return StoryViewersResponse(
        story_id=story_id,
        count=story.view_count,
        viewers=viewers,
    )
