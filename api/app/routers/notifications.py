"""
routers/notifications.py — 알림 API + WebSocket

REST:
  GET  /notifications          — 알림 목록 (최신순, 페이지네이션)
  GET  /notifications/unread   — 미읽음 카운트
  POST /notifications/read-all — 전체 읽음 처리
  PUT  /notifications/{id}/read — 단건 읽음 처리

WebSocket:
  WS   /notifications/ws       — 실시간 알림 수신
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select, func, and_, update, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.notification import Notification
from app.routers.deps import get_current_user
from app.services.notification_ws import noti_manager

router = APIRouter(prefix="/notifications", tags=["알림"])


# ─── 스키마 (인라인) ──────────────────────────────────────────────────────────
from datetime import datetime
from pydantic import BaseModel


class ActorBrief(BaseModel):
    id:           int
    username:     str
    display_name: str
    avatar_url:   Optional[str] = None


class NotiResponse(BaseModel):
    id:         int
    noti_type:  str
    message:    str
    link:       Optional[str] = None
    is_read:    bool
    actor:      Optional[ActorBrief] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotiListResponse(BaseModel):
    notifications: list[NotiResponse]
    total:         int
    unread_count:  int
    has_next:      bool


# ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _to_noti(n: Notification) -> NotiResponse:
    return NotiResponse(
        id=n.id,
        noti_type=n.noti_type,
        message=n.message,
        link=n.link,
        is_read=n.is_read,
        actor=ActorBrief(
            id=n.actor.id,
            username=n.actor.username,
            display_name=n.actor.display_name,
            avatar_url=n.actor.avatar_url,
        ) if n.actor else None,
        created_at=n.created_at,
    )


# ─── 알림 목록 ────────────────────────────────────────────────────────────────

@router.get("", response_model=NotiListResponse, summary="알림 목록")
async def get_notifications(
    page:     int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    unread_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotiListResponse:
    offset = (page - 1) * per_page

    filters = [Notification.recipient_id == current_user.id]
    if unread_only:
        filters.append(Notification.is_read.is_(False))

    total = await db.scalar(
        select(func.count(Notification.id)).where(and_(*filters))
    ) or 0

    unread_count = await db.scalar(
        select(func.count(Notification.id)).where(
            and_(
                Notification.recipient_id == current_user.id,
                Notification.is_read.is_(False),
            )
        )
    ) or 0

    notis = (await db.scalars(
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(and_(*filters))
        .order_by(desc(Notification.created_at))
        .offset(offset)
        .limit(per_page)
    )).all()

    return NotiListResponse(
        notifications=[_to_noti(n) for n in notis],
        total=total,
        unread_count=unread_count,
        has_next=(offset + per_page) < total,
    )


# ─── 미읽음 카운트 ─────────────────────────────────────────────────────────────

@router.get("/unread", summary="미읽음 알림 수")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    count = await db.scalar(
        select(func.count(Notification.id)).where(
            and_(
                Notification.recipient_id == current_user.id,
                Notification.is_read.is_(False),
            )
        )
    ) or 0
    return {"unread_count": count}


# ─── 전체 읽음 처리 ───────────────────────────────────────────────────────────

@router.post("/read-all", summary="전체 읽음 처리")
async def read_all(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await db.execute(
        update(Notification)
        .where(
            and_(
                Notification.recipient_id == current_user.id,
                Notification.is_read.is_(False),
            )
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "전체 읽음 처리 완료"}


# ─── 단건 읽음 처리 ───────────────────────────────────────────────────────────

@router.put("/{noti_id}/read", summary="단건 읽음 처리")
async def read_one(
    noti_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    noti = await db.get(Notification, noti_id)
    if noti and noti.recipient_id == current_user.id:
        noti.is_read = True
        await db.commit()
    return {"read": True}


# ─── WebSocket 실시간 알림 ────────────────────────────────────────────────────

@router.websocket("/ws")
async def notification_ws(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    실시간 알림 WebSocket
    연결: ws://localhost:8000/notifications/ws?token=<access_token>

    서버 → 클라이언트:
      { "event": "notification", "data": { ...NotiResponse } }
      { "event": "unread_count", "data": { "count": 3 } }
    """
    # JWT 인증 — 토큰 없거나 유효하지 않으면 즉시 연결 거부
    if not token:
        await websocket.close(code=4001, reason="token required")
        return

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=4001, reason="invalid token type")
            return
        user: Optional[User] = await db.scalar(
            select(User).where(User.id == int(payload["sub"]))
        )
    except (JWTError, ValueError, KeyError):
        await websocket.close(code=4001, reason="token invalid or expired")
        return

    if not user or not user.is_active:
        await websocket.close(code=4001, reason="user inactive")
        return

    await noti_manager.connect(websocket, user.id)

    # 연결 직후 미읽음 카운트 전송
    unread = await db.scalar(
        select(func.count(Notification.id)).where(
            and_(
                Notification.recipient_id == user.id,
                Notification.is_read.is_(False),
            )
        )
    ) or 0
    try:
        import json
        await websocket.send_text(json.dumps({
            "event": "unread_count",
            "data":  {"count": unread},
        }))
    except Exception:
        pass

    try:
        # 연결 유지 — 클라이언트가 보내는 메시지는 ping 정도만 처리
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text('{"event":"pong"}')
    except WebSocketDisconnect:
        pass
    finally:
        noti_manager.disconnect(websocket)
