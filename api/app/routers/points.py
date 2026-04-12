"""
routers/points.py — S포인트 API
GET  /points/balance     — 잔액 + 오늘 획득량
GET  /points/history     — 거래 내역 (최신순)
POST /points/checkin     — 일일 출석 체크인
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User, UserPoints
from app.models.point import PointTransaction
from app.schemas.point import (
    PointBalanceResponse,
    PointHistoryResponse,
    PointTransactionResponse,
    CheckinResponse,
)
from app.routers.deps import get_current_user
from app.services.point_service import daily_checkin

router = APIRouter(prefix="/points", tags=["S포인트"])


# ─── 잔액 조회 ─────────────────────────────────────────────────────────────────

@router.get("/balance", response_model=PointBalanceResponse, summary="S포인트 잔액")
async def get_balance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PointBalanceResponse:
    """
    현재 포인트 잔액 + 오늘 획득량 + 한도 잔여량
    """
    # UserPoints 행
    point_row = await db.scalar(
        select(UserPoints).where(UserPoints.user_id == current_user.id)
    )

    balance      = point_row.balance       if point_row else 0
    total_earned = point_row.total_earned  if point_row else 0
    total_spent  = point_row.total_spent   if point_row else 0

    # 오늘 획득량
    today_start = datetime.now(tz=timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    earned_today: int = await db.scalar(
        select(func.coalesce(func.sum(PointTransaction.amount), 0))
        .where(
            and_(
                PointTransaction.user_id == current_user.id,
                PointTransaction.amount > 0,
                PointTransaction.created_at >= today_start,
            )
        )
    ) or 0

    return PointBalanceResponse(
        balance=balance,
        total_earned=total_earned,
        total_spent=total_spent,
        earned_today=earned_today,
        daily_cap=settings.DAILY_POINT_CAP,
        remaining_cap=max(0, settings.DAILY_POINT_CAP - earned_today),
    )


# ─── 거래 내역 ─────────────────────────────────────────────────────────────────

@router.get("/history", response_model=PointHistoryResponse, summary="포인트 거래 내역")
async def get_history(
    page:     int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PointHistoryResponse:
    offset = (page - 1) * per_page

    total = await db.scalar(
        select(func.count(PointTransaction.id))
        .where(PointTransaction.user_id == current_user.id)
    ) or 0

    txs = (await db.scalars(
        select(PointTransaction)
        .where(PointTransaction.user_id == current_user.id)
        .order_by(desc(PointTransaction.created_at))
        .offset(offset)
        .limit(per_page)
    )).all()

    return PointHistoryResponse(
        transactions=[
            PointTransactionResponse(
                id=tx.id,
                action=tx.action,
                amount=tx.amount,
                balance_after=tx.balance_after,
                description=tx.description,
                created_at=tx.created_at,
            )
            for tx in txs
        ],
        total=total,
        page=page,
        per_page=per_page,
        has_next=(offset + per_page) < total,
    )


# ─── 일일 출석 체크인 ──────────────────────────────────────────────────────────

@router.post("/checkin", response_model=CheckinResponse, summary="일일 출석 체크인")
async def checkin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckinResponse:
    """
    하루 1회 출석 체크인 — {POINT_CHECKIN_REWARD}SP 지급
    이미 체크인한 경우 already_checked_in=True 반환 (에러 아님)
    """
    result = await daily_checkin(db, current_user)
    await db.commit()
    return CheckinResponse(**result)
