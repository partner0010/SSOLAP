"""
routers/deps.py — FastAPI 공통 의존성 (Dependencies)
라우터에서 Depends()로 주입해서 사용
"""
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

# OAuth2 스키마 — /auth/login 엔드포인트에서 토큰을 발급받음
# Authorization: Bearer <token> 헤더를 자동으로 파싱
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: str           = Depends(oauth2_scheme),
    db:    AsyncSession  = Depends(get_db),
) -> User:
    """
    액세스 토큰 검증 → 현재 사용자 반환
    토큰이 없거나 유효하지 않으면 401 에러
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증 정보가 유효하지 않습니다",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_error
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise credentials_error

    # DB에서 사용자 조회 (포인트 정보 포함)
    user = await db.scalar(
        select(User).where(User.id == user_id)
        # 포인트 정보 eager loading (N+1 방지)
        # .options(selectinload(User.point_balance))  # 추후 활성화
    )

    if not user:
        raise credentials_error

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="정지된 계정입니다",
        )

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """활성 사용자만 허용 (편의 alias)"""
    return current_user


async def get_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """어드민 권한 필요 — 일반 유저가 호출하면 403"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다",
        )
    return current_user


# ── 선택적 인증 (토큰 없어도 통과, 있으면 유저 반환) ────────────────────────
oauth2_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_optional),
    db:    AsyncSession  = Depends(get_db),
) -> Optional[User]:
    """
    토큰이 있으면 검증 후 유저 반환
    토큰이 없으면 None 반환 (인증 불필요 엔드포인트에 사용)
    """
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user or not user.is_active:
        return None
    return user
