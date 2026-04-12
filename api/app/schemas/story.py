"""
schemas/story.py — 스토리 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


# ─── 작성자 요약 ───────────────────────────────────────────────────────────────
class StoryAuthorBrief(BaseModel):
    id:           int
    username:     str
    display_name: str
    avatar_url:   Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ─── 단일 스토리 응답 ──────────────────────────────────────────────────────────
class StoryResponse(BaseModel):
    id:         int
    media_url:  str
    media_type: str          # image | video
    caption:    Optional[str] = None
    view_count: int
    expires_at: datetime
    created_at: datetime

    author:     StoryAuthorBrief

    # 현재 유저가 이미 봤는지 (피드 조회 시 서버에서 계산)
    is_viewed:  bool = False

    model_config = ConfigDict(from_attributes=True)


# ─── 유저별 스토리 그룹 (피드 표시용) ────────────────────────────────────────
class UserStoriesGroup(BaseModel):
    user_id:      int
    username:     str
    display_name: str
    avatar_url:   Optional[str] = None
    has_unseen:   bool          # 안 본 스토리가 하나라도 있는지
    stories:      List[StoryResponse]


# ─── 피드 응답 ─────────────────────────────────────────────────────────────────
class StoriesFeedResponse(BaseModel):
    groups: List[UserStoriesGroup]   # 내 스토리 먼저, 그 뒤 팔로잉 유저


# ─── 조회자 목록 (본인 스토리에서만) ─────────────────────────────────────────
class StoryViewerItem(BaseModel):
    id:           int
    username:     str
    display_name: str
    avatar_url:   Optional[str] = None
    viewed_at:    datetime

    model_config = ConfigDict(from_attributes=True)


class StoryViewersResponse(BaseModel):
    story_id: int
    count:    int
    viewers:  List[StoryViewerItem]
