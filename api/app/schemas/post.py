"""
schemas/post.py — 게시물 Pydantic 요청/응답 스키마
"""
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


# ─── 미디어 ───────────────────────────────────────────────────────────────────

class MediaItem(BaseModel):
    """게시물 첨부 미디어 (요청 시 URL 직접 전달)"""
    url:        str = Field(..., max_length=500)
    media_type: str = Field(..., pattern="^(image|video)$")
    width:    Optional[int]   = None
    height:   Optional[int]   = None
    duration: Optional[float] = None


class MediaResponse(BaseModel):
    id:            int
    url:           str
    media_type:    str
    width:         Optional[int]   = None
    height:        Optional[int]   = None
    duration:      Optional[float] = None
    display_order: int

    model_config = {"from_attributes": True}


# ─── 작성자 미니 프로필 ────────────────────────────────────────────────────────

class AuthorBrief(BaseModel):
    id:           int
    username:     str
    display_name: str
    avatar_url:   Optional[str] = None

    model_config = {"from_attributes": True}


# ─── 게시물 요청 ──────────────────────────────────────────────────────────────

class CreatePostRequest(BaseModel):
    content:   Optional[str]        = Field(None, max_length=2000)
    post_type: str                  = Field("text", pattern="^(text|image|video|short)$")
    is_public: bool                 = True
    media:     List[MediaItem]      = []

    def validate_content(self) -> None:
        """텍스트 게시물은 content 필수"""
        if self.post_type == "text" and not self.content:
            raise ValueError("텍스트 게시물에는 내용이 필요합니다")
        if self.post_type in ("image", "video", "short") and not self.media:
            raise ValueError("미디어 게시물에는 파일이 필요합니다")


class UpdatePostRequest(BaseModel):
    content:   Optional[str]  = Field(None, max_length=2000)
    is_public: Optional[bool] = None


# ─── 게시물 응답 ──────────────────────────────────────────────────────────────

class PostResponse(BaseModel):
    id:            int
    author:        AuthorBrief
    content:       Optional[str] = None
    post_type:     str
    is_public:     bool
    like_count:    int
    comment_count: int
    view_count:    int
    media:         List[MediaResponse] = []
    is_liked:      bool = False   # 현재 요청자가 좋아요 눌렀는지
    created_at:    datetime
    updated_at:    datetime

    model_config = {"from_attributes": True}


# ─── 댓글 ─────────────────────────────────────────────────────────────────────

class CreateCommentRequest(BaseModel):
    content:   str            = Field(..., min_length=1, max_length=500)
    parent_id: Optional[int]  = None


class CommentResponse(BaseModel):
    id:         int
    post_id:    int
    author:     AuthorBrief
    parent_id:  Optional[int]           = None
    content:    str
    like_count: int
    replies:    List['CommentResponse'] = []
    created_at: datetime

    model_config = {"from_attributes": True}

CommentResponse.model_rebuild()


class CommentsPageResponse(BaseModel):
    comments: List[CommentResponse]
    total:    int
    has_next: bool


# ─── 페이지네이션 ─────────────────────────────────────────────────────────────

class FeedResponse(BaseModel):
    posts:    List[PostResponse]
    total:    int
    page:     int
    per_page: int
    has_next: bool
