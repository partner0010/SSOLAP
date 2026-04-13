"""
services/point_service.py — S포인트 비즈니스 로직

award_points()   — 포인트 지급 (공통)
spend_points()   — 포인트 차감 (공통)
daily_checkin()  — 일일 출석 체크인
"""
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User, UserPoints
from app.models.point import PointTransaction


# ─── 포인트 지급 ──────────────────────────────────────────────────────────────

async def award_points(
    db:          AsyncSession,
    user:        User,
    action:      str,
    amount:      int,
    description: str,
    ref_id:      int | None = None,
) -> PointTransaction:
    """
    포인트 지급 (공통)

    - 일일 획득 한도(DAILY_POINT_CAP) 초과 시 잔여분만 지급
    - UserPoints.balance, total_earned 업데이트
    - PointTransaction 기록
    """
    if amount <= 0:
        raise ValueError("award_points: amount는 양수여야 합니다")

    # 오늘 획득량 계산
    today_start = datetime.now(tz=timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    earned_today: int = await db.scalar(
        select(func.coalesce(func.sum(PointTransaction.amount), 0))
        .where(
            and_(
                PointTransaction.user_id == user.id,
                PointTransaction.amount > 0,
                PointTransaction.created_at >= today_start,
            )
        )
    ) or 0

    # 한도 적용
    remaining_cap = max(0, settings.DAILY_POINT_CAP - earned_today)
    actual_amount = min(amount, remaining_cap)

    if actual_amount <= 0:
        return None  # 한도 초과 — 조용히 건너뜀

    # UserPoints 갱신
    point_row = await _get_or_create_points(db, user)
    point_row.balance      += actual_amount
    point_row.total_earned += actual_amount
    await db.flush()

    tx = PointTransaction(
        user_id=user.id,
        action=action,
        amount=actual_amount,
        balance_after=point_row.balance,
        description=description,
        ref_id=ref_id,
    )
    db.add(tx)
    await db.flush()
    return tx


# ─── 포인트 차감 ──────────────────────────────────────────────────────────────

async def spend_points(
    db:          AsyncSession,
    user:        User,
    action:      str,
    amount:      int,
    description: str,
    ref_id:      int | None = None,
) -> PointTransaction:
    """
    포인트 차감 (공통)
    잔액 부족 시 402 Payment Required
    """
    if amount <= 0:
        raise ValueError("spend_points: amount는 양수여야 합니다")

    point_row = await _get_or_create_points(db, user)

    if point_row.balance < amount:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"S포인트가 부족합니다 (잔액: {point_row.balance}, 필요: {amount})",
        )

    point_row.balance    -= amount
    point_row.total_spent += amount
    await db.flush()

    tx = PointTransaction(
        user_id=user.id,
        action=action,
        amount=-amount,         # 음수로 기록
        balance_after=point_row.balance,
        description=description,
        ref_id=ref_id,
    )
    db.add(tx)
    await db.flush()
    return tx


# ─── 일일 출석 체크인 ──────────────────────────────────────────────────────────

async def daily_checkin(
    db:   AsyncSession,
    user: User,
) -> dict:
    """
    일일 출석 체크인

    - 하루 1회만 가능 (UTC 기준 자정 리셋)
    - POINT_CHECKIN_REWARD(10SP) 지급
    - 반환: { rewarded: int, balance: int, already_checked_in: bool }
    """
    today_start = datetime.now(tz=timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    tomorrow_start = today_start + timedelta(days=1)

    # 오늘 이미 체크인했는지
    existing = await db.scalar(
        select(PointTransaction).where(
            and_(
                PointTransaction.user_id == user.id,
                PointTransaction.action  == "daily_checkin",
                PointTransaction.created_at >= today_start,
                PointTransaction.created_at <  tomorrow_start,
            )
        )
    )
    if existing:
        point_row = await _get_or_create_points(db, user)
        return {
            "already_checked_in": True,
            "rewarded":           0,
            "balance":            point_row.balance,
            "next_checkin_at":    tomorrow_start.isoformat(),
        }

    # 체크인 포인트 지급
    tx = await award_points(
        db,
        user=user,
        action="daily_checkin",
        amount=settings.POINT_CHECKIN_REWARD,
        description="일일 출석 체크인 보상",
    )

    point_row = await _get_or_create_points(db, user)
    return {
        "already_checked_in": False,
        "rewarded":           tx.amount if tx else 0,
        "balance":            point_row.balance,
        "next_checkin_at":    tomorrow_start.isoformat(),
    }


# ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

async def _get_or_create_points(db: AsyncSession, user: User) -> UserPoints:
    """UserPoints 행 가져오기 (없으면 생성)"""
    point_row = await db.scalar(
        select(UserPoints).where(UserPoints.user_id == user.id)
    )
    if not point_row:
        point_row = UserPoints(user_id=user.id, balance=0)
        db.add(point_row)
        await db.flush()
    return point_row
