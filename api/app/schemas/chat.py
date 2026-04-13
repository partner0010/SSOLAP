"""
schemas/chat.py — 채팅 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


# ─── 채팅방 ───────────────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    name:           str  = Field(..., min_length=1, max_length=80)
    description:    Optional[str]  = Field(None, max_length=300)
    room_type:      str  = Field("group", pattern="^(group|channel)$")
    entry_type:     str  = Field("open",  pattern="^(open|password|point|invite)$")
    entry_password: Optional[str]  = Field(None, max_length=50)
    entry_fee:      int  = Field(0, ge=0)
    max_members:    int  = Field(500, ge=2, le=10000)
    is_public:      bool = True


class DmPartnerBrief(BaseModel):
    """DM 방에서 대화 상대방 정보"""
    id:           int
    username:     str
    display_name: str
    avatar_url:   Optional[str] = None

    model_config = {"from_attributes": True}


class RoomResponse(BaseModel):
    id:           int
    name:         str
    description:  Optional[str] = None
    room_type:    str
    entry_type:   str
    entry_fee:    int
    max_members:  int
    member_count: int
    is_public:    bool
    is_member:    bool = False
    online_count: int  = 0
    last_message: Optional["MessageResponse"] = None
    dm_partner:   Optional[DmPartnerBrief] = None   # direct 방 전용
    created_at:   datetime

    model_config = {"from_attributes": True}


# ─── 채팅 메시지 ──────────────────────────────────────────────────────────────

class SendMessageRequest(BaseModel):
    content:              str           = Field(..., min_length=1, max_length=2000)
    message_type:         str           = Field("text", pattern="^(text|image|video|secret)$")
    media_url:            Optional[str] = None
    secret_recipient_id:  Optional[int] = None   # 비밀 메시지 수신자


class SenderBrief(BaseModel):
    id:           int
    username:     str
    display_name: str
    avatar_url:   Optional[str] = None


class MessageResponse(BaseModel):
    id:                   int
    room_id:              int
    sender:               Optional[SenderBrief] = None
    message_type:         str
    content:              str
    media_url:            Optional[str] = None
    secret_recipient_id:  Optional[int] = None
    is_deleted:           bool
    created_at:           datetime

    model_config = {"from_attributes": True}


class MessageHistoryResponse(BaseModel):
    messages: List[MessageResponse]
    total:    int
    has_prev: bool   # 이전 메시지가 더 있는지 (위로 스크롤 로드)


# ─── 입장 요청 ────────────────────────────────────────────────────────────────

class JoinRoomRequest(BaseModel):
    password: Optional[str] = None   # entry_type == "password" 일 때


# ─── WebSocket 이벤트 (클라이언트 → 서버) ───────────────────────────────────

class WsIncomingEvent(BaseModel):
    """WebSocket으로 클라이언트가 보내는 이벤트"""
    type:    str   # "message" | "typing" | "read"
    content: Optional[str] = None
    message_type:        Optional[str] = None
    media_url:           Optional[str] = None
    secret_recipient_id: Optional[int] = None
