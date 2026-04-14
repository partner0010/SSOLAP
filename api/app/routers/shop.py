"""
routers/shop.py — S포인트 샵 API
────────────────────────────────────────────────────────────
GET  /shop/items           — 구매 가능 아이템 목록
POST /shop/purchase/{item_id}  — 아이템 구매
GET  /shop/active          — 내 활성 아이템 목록
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.models.user import User
from app.models.post import Post
from app.routers.deps import get_current_user
from app.services.point_service import spend_points
from app.services.notification_service import create_notification

router = APIRouter(prefix="/shop", tags=["S포인트 샵"])


# ─── 상품 정의 (하드코딩 — DB 테이블 불필요) ─────────────────────────────────

SHOP_ITEMS: list[dict] = [
    {
        "id":          "boost_post",
        "name":        "게시물 부스트",
        "description": "내 게시물 하나를 24시간 동안 팔로워 피드 상단에 노출합니다.",
        "price":       500,
        "icon":        "▲",
        "category":    "boost",
        "requires_ref": True,   # ref_id(게시물 id) 필요
    },
    {
        "id":          "premium_badge",
        "name":        "프리미엄 뱃지",
        "description": "30일간 프로필에 ⭐ 프리미엄 뱃지가 표시됩니다.",
        "price":       1000,
        "icon":        "⭐",
        "category":    "profile",
        "requires_ref": False,
    },
    {
        "id":          "story_boost",
        "name":        "스토리 알림 부스트",
        "description": "팔로워 전원에게 내 최신 스토리 알림을 발송합니다.",
        "price":       200,
        "icon":        "◈",
        "category":    "story",
        "requires_ref": False,
    },
]

ITEMS_BY_ID = {item["id"]: item for item in SHOP_ITEMS}


# ─── 스키마 ───────────────────────────────────────────────────────────────────

class ShopItem(BaseModel):
    id:           str
    name:         str
    description:  str
    price:        int
    icon:         str
    category:     str
    requires_ref: bool


class PurchaseRequest(BaseModel):
    ref_id: Optional[int] = None   # boost_post 일 때 post_id


class PurchaseResult(BaseModel):
    item_id:       str
    item_name:     str
    spent:         int
    balance_after: int
    message:       str


class ActiveItem(BaseModel):
    item_id:    str
    item_name:  str
    expires_at: Optional[datetime] = None


class ActiveItemsResponse(BaseModel):
    items: list[ActiveItem]


# ─── 엔드포인트 ───────────────────────────────────────────────────────────────

@router.get("/items", response_model=list[ShopItem])
async def list_items():
    """구매 가능한 전체 상품 목록"""
    return [ShopItem(**item) for item in SHOP_ITEMS]


@router.post("/purchase/{item_id}", response_model=PurchaseResult)
async def purchase_item(
    item_id: str,
    body:    PurchaseRequest,
    db:      AsyncSession = Depends(get_db),
    me:      User         = Depends(get_current_user),
):
    """
    아이템 구매 — S포인트 차감 후 효과 적용

    - boost_post  : ref_id(post_id) 필수
    - premium_badge : ref_id 불필요
    - story_boost   : ref_id 불필요
    """
    item = ITEMS_BY_ID.get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다")

    if item["requires_ref"] and not body.ref_id:
        raise HTTPException(status_code=422, detail="ref_id(게시물 ID)가 필요합니다")

    now = datetime.now(timezone.utc)

    # ── 1. 포인트 차감 ────────────────────────────────────────────────────────
    tx = await spend_points(
        db,
        user=me,
        action=f"spend_{item_id}",
        amount=item["price"],
        description=f"{item['name']} 구매",
        ref_id=body.ref_id,
    )

    # ── 2. 아이템별 효과 적용 ─────────────────────────────────────────────────

    if item_id == "boost_post":
        post = await db.scalar(select(Post).where(Post.id == body.ref_id))
        if not post:
            raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다")
        if post.author_id != me.id:
            raise HTTPException(status_code=403, detail="본인 게시물만 부스트할 수 있습니다")

        # 이미 부스트 중이면 연장, 아니면 새로 설정
        current_end = post.boosted_until if (post.boosted_until and post.boosted_until > now) else now
        post.boosted_until = current_end + timedelta(hours=24)

        message = f"게시물이 24시간 동안 피드 상단에 노출됩니다 (만료: {post.boosted_until.strftime('%m/%d %H:%M')})"

    elif item_id == "premium_badge":
        current_end = me.badge_expires_at if (me.badge_expires_at and me.badge_expires_at > now) else now
        me.badge             = "premium"
        me.badge_expires_at  = current_end + timedelta(days=30)
        message = f"프리미엄 뱃지가 30일 연장됩니다 (만료: {me.badge_expires_at.strftime('%Y/%m/%d')})"

    elif item_id == "story_boost":
        # 팔로워에게 알림 발송 (최대 200명)
        from app.models.follow import Follow
        follower_ids_q = await db.execute(
            select(Follow.follower_id)
            .where(Follow.following_id == me.id)
            .limit(200)
        )
        follower_ids = [r for (r,) in follower_ids_q.all()]
        for fid in follower_ids:
            await create_notification(
                db,
                recipient_id=fid,
                noti_type="system",
                message=f"{me.display_name}님이 새 스토리를 올렸습니다 ✦",
                actor=me,
                link="/feed",
            )
        message = f"팔로워 {len(follower_ids)}명에게 스토리 알림이 발송되었습니다"

    else:
        message = "구매가 완료되었습니다"

    await db.commit()

    return PurchaseResult(
        item_id=item_id,
        item_name=item["name"],
        spent=item["price"],
        balance_after=tx.balance_after,
        message=message,
    )


@router.get("/active", response_model=ActiveItemsResponse)
async def get_active_items(
    db: AsyncSession = Depends(get_db),
    me: User         = Depends(get_current_user),
):
    """
    내 활성 아이템 목록
    - premium_badge: 뱃지 만료일
    - boost_post: 부스트 중인 게시물
    """
    now = datetime.now(timezone.utc)
    items: list[ActiveItem] = []

    # 뱃지
    if me.badge and me.badge_expires_at and me.badge_expires_at > now:
        items.append(ActiveItem(
            item_id="premium_badge",
            item_name="프리미엄 뱃지",
            expires_at=me.badge_expires_at,
        ))

    # 부스트 중인 게시물
    boosted_q = await db.execute(
        select(Post).where(
            and_(Post.author_id == me.id, Post.boosted_until > now)
        )
    )
    for post in boosted_q.scalars().all():
        items.append(ActiveItem(
            item_id="boost_post",
            item_name=f"게시물 부스트 (#{post.id})",
            expires_at=post.boosted_until,
        ))

    return ActiveItemsResponse(items=items)
