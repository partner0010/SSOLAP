"""
services/notification_service.py — 알림 생성 서비스

각 이벤트(팔로우, 좋아요, 댓글)에서 호출해 알림을 생성하고
WebSocket으로 실시간 푸시한다.
"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.user import User


async def create_notification(
    db:           AsyncSession,
    recipient_id: int,
    noti_type:    str,
    message:      str,
    actor:        User | None = None,
    link:         str | None  = None,
) -> Notification | None:
    """
    알림 생성 공통 함수

    - 자기 자신에게는 알림 생성 안 함
    - DB 저장 후 WebSocket 푸시 (연결된 경우)
    """
    # 자기 자신 알림 차단
    if actor and actor.id == recipient_id:
        return None

    noti = Notification(
        recipient_id=recipient_id,
        actor_id=actor.id if actor else None,
        noti_type=noti_type,
        message=message,
        link=link,
    )
    db.add(noti)
    await db.flush()

    # 실시간 WebSocket 푸시 (import here to avoid circular)
    try:
        from app.services.notification_ws import push_notification
        await push_notification(recipient_id, noti)
    except Exception:
        pass  # WS 실패해도 DB 저장은 성공

    return noti


# ─── 이벤트별 헬퍼 ────────────────────────────────────────────────────────────

async def notify_follow(db: AsyncSession, actor: User, target_user_id: int) -> None:
    """A가 B를 팔로우했을 때"""
    await create_notification(
        db,
        recipient_id=target_user_id,
        noti_type="follow",
        message=f"{actor.display_name}님이 팔로우하기 시작했습니다",
        actor=actor,
        link=f"/profile/{actor.username}",
    )


async def notify_like(
    db: AsyncSession, actor: User, post_author_id: int, post_id: int,
) -> None:
    """A가 B의 게시물에 좋아요"""
    await create_notification(
        db,
        recipient_id=post_author_id,
        noti_type="like",
        message=f"{actor.display_name}님이 회원님의 게시물을 좋아합니다",
        actor=actor,
        link=f"/post/{post_id}",
    )


async def notify_comment(
    db: AsyncSession, actor: User, post_author_id: int,
    post_id: int, comment_id: int,
) -> None:
    """A가 B의 게시물에 댓글"""
    await create_notification(
        db,
        recipient_id=post_author_id,
        noti_type="comment",
        message=f"{actor.display_name}님이 회원님의 게시물에 댓글을 남겼습니다",
        actor=actor,
        link=f"/post/{post_id}#comment-{comment_id}",
    )


async def notify_comment_reply(
    db: AsyncSession, actor: User, parent_comment_author_id: int,
    post_id: int, comment_id: int,
) -> None:
    """A가 B의 댓글에 대댓글"""
    await create_notification(
        db,
        recipient_id=parent_comment_author_id,
        noti_type="comment_reply",
        message=f"{actor.display_name}님이 회원님의 댓글에 답글을 남겼습니다",
        actor=actor,
        link=f"/post/{post_id}#comment-{comment_id}",
    )


async def notify_point_earned(
    db: AsyncSession, recipient_id: int, amount: int, reason: str,
) -> None:
    """포인트 획득 알림"""
    await create_notification(
        db,
        recipient_id=recipient_id,
        noti_type="point_earned",
        message=f"+{amount} SP — {reason}",
        link="/points",
    )
