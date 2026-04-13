"""
schemas/point.py — S포인트 Pydantic 스키마
"""
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel


class PointBalanceResponse(BaseModel):
    balance:       int
    total_earned:  int
    total_spent:   int
    earned_today:  int
    daily_cap:     int
    remaining_cap: int

    model_config = {"from_attributes": True}


class PointTransactionResponse(BaseModel):
    id:            int
    action:        str
    amount:        int        # 양수=획득, 음수=소비
    balance_after: int
    description:   Optional[str] = None
    created_at:    datetime

    model_config = {"from_attributes": True}


class PointHistoryResponse(BaseModel):
    transactions: List[PointTransactionResponse]
    total:        int
    page:         int
    per_page:     int
    has_next:     bool


class CheckinResponse(BaseModel):
    already_checked_in: bool
    rewarded:           int
    balance:            int
    next_checkin_at:    str
