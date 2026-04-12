"""
routers/chat.py — 채팅 API + WebSocket

REST:
  GET  /chat/rooms              — 내 채팅방 목록
  GET  /chat/rooms/explore      — 공개 채팅방 탐색
  POST /chat/rooms              — 채팅방 생성
  POST /chat/rooms/{id}/join    — 채팅방 입장
  POST /chat/rooms/{id}/leave   — 채팅방 퇴장
  GET  /chat/rooms/{id}/messages — 메시지 히스토리

WebSocket:
  WS   /chat/ws/{room_id}       — 실시간 채팅 연결
"""
import json
from typing import Optional

from fastapi import (
    APIRouter, Depends, HTTPException, Query,
    WebSocket, WebSocketDisconnect, status,
)
from jose import JWTError
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.chat import ChatRoom, ChatMember, ChatMessage
from app.routers.deps import get_current_user, get_optional_user
from app.schemas.chat import (
    CreateRoomRequest,
    RoomResponse,
    JoinRoomRequest,
    MessageResponse,
    MessageHistoryResponse,
    SenderBrief,
    WsIncomingEvent,
)
from app.services.connection_manager import manager
from app.services.point_service import spend_points

router = APIRouter(prefix="/chat", tags=["채팅"])


# ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _to_msg_response(msg: ChatMessage) -> MessageResponse:
    return MessageResponse(
        id=msg.id,
        room_id=msg.room_id,
        sender=SenderBrief(
            id=msg.sender.id,
            username=msg.sender.username,
            display_name=msg.sender.display_name,
            avatar_url=msg.sender.avatar_url,
        ) if msg.sender else None,
        message_type=msg.message_type,
        content=msg.content if not msg.is_deleted else "삭제된 메시지입니다",
        media_url=msg.media_url if not msg.is_deleted else None,
        secret_recipient_id=msg.secret_recipient_id,
        is_deleted=msg.is_deleted,
        created_at=msg.created_at,
    )


async def _is_member(db: AsyncSession, room_id: int, user_id: int) -> bool:
    row = await db.scalar(
        select(ChatMember).where(
            and_(ChatMember.room_id == room_id, ChatMember.user_id == user_id)
        )
    )
    return row is not None


# ─── 내 채팅방 목록 ───────────────────────────────────────────────────────────

@router.get("/rooms", response_model=list[RoomResponse], summary="내 채팅방 목록")
async def get_my_rooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RoomResponse]:
    # 내가 속한 room_id 목록
    member_rows = (await db.scalars(
        select(ChatMember.room_id).where(ChatMember.user_id == current_user.id)
    )).all()
    if not member_rows:
        return []

    rooms = (await db.scalars(
        select(ChatRoom)
        .options(selectinload(ChatRoom.owner))
        .where(ChatRoom.id.in_(list(member_rows)))
        .order_by(desc(ChatRoom.id))
    )).all()

    result = []
    for room in rooms:
        # 마지막 메시지
        last_msg = await db.scalar(
            select(ChatMessage)
            .options(selectinload(ChatMessage.sender))
            .where(ChatMessage.room_id == room.id)
            .order_by(desc(ChatMessage.created_at))
            .limit(1)
        )
        result.append(RoomResponse(
            id=room.id,
            name=room.name,
            description=room.description,
            room_type=room.room_type,
            entry_type=room.entry_type,
            entry_fee=room.entry_fee,
            max_members=room.max_members,
            member_count=room.member_count,
            is_public=room.is_public,
            is_member=True,
            online_count=manager.room_online_count(room.id),
            last_message=_to_msg_response(last_msg) if last_msg else None,
            created_at=room.created_at,
        ))
    return result


# ─── 공개 채팅방 탐색 ─────────────────────────────────────────────────────────

@router.get("/rooms/explore", response_model=list[RoomResponse], summary="공개 채팅방 탐색")
async def explore_rooms(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> list[RoomResponse]:
    offset = (page - 1) * per_page
    rooms = (await db.scalars(
        select(ChatRoom)
        .where(and_(ChatRoom.is_public.is_(True), ChatRoom.room_type != "direct"))
        .order_by(desc(ChatRoom.member_count))
        .offset(offset)
        .limit(per_page)
    )).all()

    joined_ids: set[int] = set()
    if current_user:
        rows = (await db.scalars(
            select(ChatMember.room_id).where(ChatMember.user_id == current_user.id)
        )).all()
        joined_ids = set(rows)

    return [
        RoomResponse(
            id=r.id, name=r.name, description=r.description,
            room_type=r.room_type, entry_type=r.entry_type,
            entry_fee=r.entry_fee, max_members=r.max_members,
            member_count=r.member_count, is_public=r.is_public,
            is_member=r.id in joined_ids,
            online_count=manager.room_online_count(r.id),
            created_at=r.created_at,
        )
        for r in rooms
    ]


# ─── 채팅방 생성 ──────────────────────────────────────────────────────────────

@router.post("/rooms", response_model=RoomResponse, status_code=201, summary="채팅방 생성")
async def create_room(
    body: CreateRoomRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RoomResponse:
    room = ChatRoom(
        owner_id=current_user.id,
        name=body.name,
        description=body.description,
        room_type=body.room_type,
        entry_type=body.entry_type,
        entry_password=body.entry_password,
        entry_fee=body.entry_fee,
        max_members=body.max_members,
        is_public=body.is_public,
        member_count=1,
    )
    db.add(room)
    await db.flush()

    # 방장을 member로 추가
    db.add(ChatMember(room_id=room.id, user_id=current_user.id, role="owner"))
    await db.commit()
    await db.refresh(room)

    return RoomResponse(
        id=room.id, name=room.name, description=room.description,
        room_type=room.room_type, entry_type=room.entry_type,
        entry_fee=room.entry_fee, max_members=room.max_members,
        member_count=room.member_count, is_public=room.is_public,
        is_member=True, online_count=0, created_at=room.created_at,
    )


# ─── 채팅방 입장 ──────────────────────────────────────────────────────────────

@router.post("/rooms/{room_id}/join", summary="채팅방 입장")
async def join_room(
    room_id: int,
    body: JoinRoomRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    room = await db.get(ChatRoom, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다")
    if not room.is_public:
        raise HTTPException(status_code=403, detail="비공개 채팅방입니다")
    if room.member_count >= room.max_members:
        raise HTTPException(status_code=400, detail="채팅방 정원이 초과됐습니다")

    # 이미 멤버인지
    if await _is_member(db, room_id, current_user.id):
        return {"joined": True, "message": "이미 입장한 방입니다"}

    # 비밀번호 확인
    if room.entry_type == "password":
        if not body.password or body.password != room.entry_password:
            raise HTTPException(status_code=403, detail="비밀번호가 올바르지 않습니다")

    # 포인트 입장료 차감
    if room.entry_type == "point" and room.entry_fee > 0:
        await spend_points(
            db, user=current_user,
            action="spend_room_entry",
            amount=room.entry_fee,
            description=f"채팅방 입장: {room.name}",
            ref_id=room.id,
        )

    db.add(ChatMember(room_id=room_id, user_id=current_user.id, role="member"))
    room.member_count += 1
    await db.commit()
    return {"joined": True, "message": f"{room.name}에 입장했습니다"}


# ─── 채팅방 퇴장 ──────────────────────────────────────────────────────────────

@router.post("/rooms/{room_id}/leave", summary="채팅방 퇴장")
async def leave_room(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    member = await db.scalar(
        select(ChatMember).where(
            and_(ChatMember.room_id == room_id, ChatMember.user_id == current_user.id)
        )
    )
    if not member:
        raise HTTPException(status_code=400, detail="입장한 방이 아닙니다")

    await db.delete(member)

    room = await db.get(ChatRoom, room_id)
    if room:
        room.member_count = max(0, room.member_count - 1)

    await db.commit()
    return {"left": True}


# ─── 메시지 히스토리 ──────────────────────────────────────────────────────────

@router.get("/rooms/{room_id}/messages", response_model=MessageHistoryResponse, summary="메시지 히스토리")
async def get_messages(
    room_id: int,
    before_id: Optional[int] = Query(None, description="이 ID보다 오래된 메시지 조회 (위로 스크롤)"),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageHistoryResponse:
    if not await _is_member(db, room_id, current_user.id):
        raise HTTPException(status_code=403, detail="채팅방 멤버가 아닙니다")

    filters = [ChatMessage.room_id == room_id, ChatMessage.message_type != "secret"]
    if before_id:
        filters.append(ChatMessage.id < before_id)

    # 비밀 메시지는 자신이 보낸 것 또는 수신자인 것만
    secret_filter = and_(
        ChatMessage.message_type == "secret",
        (ChatMessage.sender_id == current_user.id) |
        (ChatMessage.secret_recipient_id == current_user.id),
    )

    total = await db.scalar(
        select(func.count(ChatMessage.id)).where(ChatMessage.room_id == room_id)
    ) or 0

    messages = (await db.scalars(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .where(
            ChatMessage.room_id == room_id,
            (and_(*filters)) | secret_filter,
            *([ChatMessage.id < before_id] if before_id else []),
        )
        .order_by(desc(ChatMessage.id))
        .limit(limit)
    )).all()

    # 오래된 것이 위로 오도록 역순
    messages = list(reversed(messages))

    # 마지막 읽은 메시지 업데이트
    if messages:
        member = await db.scalar(
            select(ChatMember).where(
                and_(ChatMember.room_id == room_id, ChatMember.user_id == current_user.id)
            )
        )
        if member:
            member.last_read_message_id = messages[-1].id
            await db.commit()

    return MessageHistoryResponse(
        messages=[_to_msg_response(m) for m in messages],
        total=total,
        has_prev=bool(before_id and len(messages) == limit),
    )


# ─── WebSocket ────────────────────────────────────────────────────────────────

@router.websocket("/ws/{room_id}")
async def websocket_chat(
    websocket: WebSocket,
    room_id: int,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    실시간 채팅 WebSocket 엔드포인트

    연결: ws://localhost:8000/chat/ws/{room_id}?token=<access_token>

    클라이언트 → 서버 (JSON):
      { "type": "message", "content": "안녕!", "message_type": "text" }
      { "type": "typing" }
      { "type": "secret", "content": "...", "secret_recipient_id": 123 }

    서버 → 클라이언트 (JSON):
      { "event": "message", "data": { ...MessageResponse } }
      { "event": "typing",  "data": { "user_id": 1, "username": "..." } }
      { "event": "join",    "data": { "user_id": 1, "username": "..." } }
      { "event": "leave",   "data": { "user_id": 1, "username": "..." } }
      { "event": "error",   "data": { "detail": "..." } }
    """
    # ── JWT 토큰 검증 ─────────────────────────────────────────────────
    user: Optional[User] = None
    if token:
        try:
            payload = decode_token(token)
            if payload.get("type") == "access":
                user_id = int(payload["sub"])
                user = await db.scalar(select(User).where(User.id == user_id))
        except (JWTError, Exception):
            pass

    if not user or not user.is_active:
        await websocket.close(code=4001, reason="인증 실패")
        return

    # ── 멤버십 확인 ───────────────────────────────────────────────────
    if not await _is_member(db, room_id, user.id):
        await websocket.close(code=4003, reason="채팅방 멤버가 아닙니다")
        return

    # ── 연결 등록 ─────────────────────────────────────────────────────
    await manager.connect(websocket, room_id, user.id)

    # 입장 알림 브로드캐스트
    await manager.broadcast_to_room(room_id, {
        "event": "join",
        "data": {
            "user_id":      user.id,
            "username":     user.username,
            "display_name": user.display_name,
            "online_count": manager.room_online_count(room_id),
        },
    }, exclude=websocket)

    try:
        while True:
            raw = await websocket.receive_text()

            # ── JSON 파싱 ────────────────────────────────────────────
            try:
                evt = WsIncomingEvent.model_validate_json(raw)
            except Exception:
                await websocket.send_text(json.dumps({
                    "event": "error",
                    "data":  {"detail": "잘못된 메시지 형식입니다"},
                }))
                continue

            # ── 타이핑 이벤트 ────────────────────────────────────────
            if evt.type == "typing":
                await manager.broadcast_to_room(room_id, {
                    "event": "typing",
                    "data":  {"user_id": user.id, "username": user.username},
                }, exclude=websocket)
                continue

            # ── 메시지 전송 ──────────────────────────────────────────
            if evt.type in ("message", "secret"):
                if not evt.content or not evt.content.strip():
                    continue

                msg_type = "secret" if evt.type == "secret" else (evt.message_type or "text")

                # 비밀 메시지 수신자 확인
                recipient_id = evt.secret_recipient_id if msg_type == "secret" else None
                if msg_type == "secret" and recipient_id:
                    is_recv_member = await _is_member(db, room_id, recipient_id)
                    if not is_recv_member:
                        await websocket.send_text(json.dumps({
                            "event": "error",
                            "data": {"detail": "수신자가 채팅방 멤버가 아닙니다"},
                        }))
                        continue

                # DB 저장
                msg = ChatMessage(
                    room_id=room_id,
                    sender_id=user.id,
                    message_type=msg_type,
                    content=evt.content.strip(),
                    media_url=evt.media_url,
                    secret_recipient_id=recipient_id,
                )
                db.add(msg)
                await db.flush()
                await db.refresh(msg)

                # sender 관계 로드
                msg_with_sender = await db.scalar(
                    select(ChatMessage)
                    .options(selectinload(ChatMessage.sender))
                    .where(ChatMessage.id == msg.id)
                )
                await db.commit()

                msg_data = _to_msg_response(msg_with_sender).model_dump()
                msg_data["created_at"] = msg_data["created_at"].isoformat()

                # 비밀 메시지: 발신자 + 수신자에게만
                if msg_type == "secret" and recipient_id:
                    await manager.send_to_user(user.id, {"event": "message", "data": msg_data})
                    await manager.send_to_user(recipient_id, {"event": "message", "data": msg_data})
                else:
                    # 전체 브로드캐스트
                    await manager.broadcast_to_room(room_id, {
                        "event": "message",
                        "data":  msg_data,
                    })

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
        await manager.broadcast_to_room(room_id, {
            "event": "leave",
            "data": {
                "user_id":      user.id,
                "username":     user.username,
                "online_count": manager.room_online_count(room_id),
            },
        })
