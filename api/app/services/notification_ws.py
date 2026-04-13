"""
services/notification_ws.py — 알림 실시간 WebSocket 푸시

ConnectionManager와 별도로 알림 전용 유저 연결 풀을 관리.
채팅 ConnectionManager와 분리해 역할을 명확히 한다.
"""
import json
from collections import defaultdict
from datetime import datetime

from fastapi import WebSocket


class NotificationConnectionManager:
    """유저별 WebSocket 연결 풀 (알림 전용)"""

    def __init__(self) -> None:
        self._users: dict[int, set[WebSocket]] = defaultdict(set)
        self._meta:  dict[WebSocket, int]       = {}

    async def connect(self, ws: WebSocket, user_id: int) -> None:
        await ws.accept()
        self._users[user_id].add(ws)
        self._meta[ws] = user_id

    def disconnect(self, ws: WebSocket) -> int | None:
        user_id = self._meta.pop(ws, None)
        if user_id is not None:
            self._users[user_id].discard(ws)
            if not self._users[user_id]:
                del self._users[user_id]
        return user_id

    async def send_to_user(self, user_id: int, data: dict) -> None:
        payload = json.dumps(data, ensure_ascii=False, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._users.get(user_id, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def is_online(self, user_id: int) -> bool:
        return bool(self._users.get(user_id))


# 싱글톤
noti_manager = NotificationConnectionManager()


async def push_notification(recipient_id: int, noti: "Notification") -> None:
    """알림 생성 후 WebSocket으로 실시간 전송"""
    if not noti_manager.is_online(recipient_id):
        return
    await noti_manager.send_to_user(recipient_id, {
        "event": "notification",
        "data": {
            "id":         noti.id,
            "noti_type":  noti.noti_type,
            "message":    noti.message,
            "link":       noti.link,
            "is_read":    noti.is_read,
            "created_at": noti.created_at.isoformat() if isinstance(noti.created_at, datetime) else str(noti.created_at),
        },
    })
