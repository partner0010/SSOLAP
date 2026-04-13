"""
services/connection_manager.py — WebSocket 연결 관리자

채팅방별로 활성 WebSocket 연결을 추적하고
메시지를 브로드캐스트한다.

멀티 프로세스/서버 환경에서는 Redis Pub/Sub로 교체 필요.
단일 서버(개발/소규모) 환경에서는 in-memory로 충분.
"""
import json
import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    채팅방별 WebSocket 연결 풀 관리

    self._rooms: { room_id -> set[WebSocket] }
    self._user_sockets: { user_id -> set[WebSocket] }  # DM 라우팅용
    """

    def __init__(self) -> None:
        # room_id → 연결된 WebSocket 집합
        self._rooms: dict[int, set[WebSocket]] = defaultdict(set)
        # user_id → 연결된 WebSocket 집합 (한 유저가 여러 탭 열 수 있음)
        self._user_sockets: dict[int, set[WebSocket]] = defaultdict(set)
        # WebSocket → (room_id, user_id) 역방향 맵핑 (빠른 정리용)
        self._meta: dict[WebSocket, tuple[int, int]] = {}

    # ─── 연결 관리 ────────────────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, room_id: int, user_id: int) -> None:
        """WebSocket 연결 수락 후 풀에 등록"""
        await websocket.accept()
        self._rooms[room_id].add(websocket)
        self._user_sockets[user_id].add(websocket)
        self._meta[websocket] = (room_id, user_id)
        logger.info(f"[WS] user={user_id} connected to room={room_id} | room_size={len(self._rooms[room_id])}")

    def disconnect(self, websocket: WebSocket) -> tuple[int, int] | None:
        """연결 해제 및 풀에서 제거. (room_id, user_id) 반환"""
        meta = self._meta.pop(websocket, None)
        if not meta:
            return None
        room_id, user_id = meta
        self._rooms[room_id].discard(websocket)
        self._user_sockets[user_id].discard(websocket)
        if not self._rooms[room_id]:
            del self._rooms[room_id]
        if not self._user_sockets[user_id]:
            del self._user_sockets[user_id]
        logger.info(f"[WS] user={user_id} disconnected from room={room_id}")
        return room_id, user_id

    # ─── 메시지 전송 ──────────────────────────────────────────────────────────

    async def broadcast_to_room(
        self,
        room_id: int,
        message: dict[str, Any],
        exclude: WebSocket | None = None,
    ) -> None:
        """채팅방 전체에 JSON 메시지 브로드캐스트"""
        payload = json.dumps(message, ensure_ascii=False, default=str)
        dead: list[WebSocket] = []

        for ws in list(self._rooms.get(room_id, [])):
            if ws is exclude:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        # 끊어진 연결 정리
        for ws in dead:
            self.disconnect(ws)

    async def send_to_user(
        self,
        user_id: int,
        message: dict[str, Any],
    ) -> None:
        """특정 유저의 모든 탭에 개인 메시지 전송"""
        payload = json.dumps(message, ensure_ascii=False, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._user_sockets.get(user_id, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    # ─── 통계 ─────────────────────────────────────────────────────────────────

    def room_online_count(self, room_id: int) -> int:
        return len(self._rooms.get(room_id, []))

    def total_connections(self) -> int:
        return len(self._meta)


# ─── 싱글톤 인스턴스 ──────────────────────────────────────────────────────────
manager = ConnectionManager()
