"""
routers/auth.py — 인증 API 라우터
POST /auth/signup   — 회원가입
POST /auth/login    — 로그인 (JWT 발급)
POST /auth/refresh  — 액세스 토큰 갱신
POST /auth/logout   — 로그아웃 (서버 측 처리)
GET  /auth/me       — 내 정보 조회
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.user import User, UserPoints
from app.schemas.user import (
    SignupRequest,
    TokenResponse,
    RefreshRequest,
    UserResponse,
)
from app.routers.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["인증"])


# ─── 회원가입 ─────────────────────────────────────────────────────────────────
@router.post(
    "/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="회원가입",
)
async def signup(
    body: SignupRequest,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    새 계정 생성

    - username, email 중복 체크
    - 비밀번호 bcrypt 해싱
    - 초기 포인트 잔액 행 생성
    """
    # 비밀번호 일치 확인
    body.validate_passwords_match()

    # ── 중복 체크 ─────────────────────────────────────────────────────────────
    exists_username = await db.scalar(
        select(User).where(User.username == body.username.lower())
    )
    if exists_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 아이디입니다",
        )

    exists_email = await db.scalar(
        select(User).where(User.email == body.email.lower())
    )
    if exists_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 이메일입니다",
        )

    # ── 유저 생성 ─────────────────────────────────────────────────────────────
    new_user = User(
        username=body.username.lower(),
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
        display_name=body.display_name,
        role="user",
    )
    db.add(new_user)
    await db.flush()  # ID 확보 (commit 전에 INSERT)

    # 포인트 잔액 행 초기화
    point_row = UserPoints(user_id=new_user.id, balance=0)
    db.add(point_row)

    await db.commit()
    await db.refresh(new_user)

    return _to_response(new_user)


# ─── 로그인 ────────────────────────────────────────────────────────────────────
@router.post(
    "/login",
    response_model=TokenResponse,
    summary="로그인 (JWT 발급)",
)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession  = Depends(get_db),
) -> TokenResponse:
    """
    OAuth2 폼 방식 로그인
    username: 아이디 또는 이메일
    password: 비밀번호
    """
    # 아이디 또는 이메일로 유저 검색
    user = await db.scalar(
        select(User).where(
            (User.username == form.username.lower()) |
            (User.email    == form.username.lower())
        )
    )

    # 존재하지 않거나 비밀번호 불일치 → 같은 에러 메시지 (보안)
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="아이디 또는 비밀번호가 올바르지 않습니다",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 계정 정지 확인
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="정지된 계정입니다. 고객센터에 문의해주세요",
        )

    # 마지막 로그인 시각 업데이트
    user.last_login_at = datetime.now(tz=timezone.utc)
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(
            subject=user.id,
            extra_claims={"username": user.username, "role": user.role},
        ),
        refresh_token=create_refresh_token(subject=user.id),
    )


# ─── 토큰 갱신 ────────────────────────────────────────────────────────────────
@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="액세스 토큰 갱신",
)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    리프레시 토큰으로 새 액세스 토큰 발급
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="리프레시 토큰이 유효하지 않습니다",
    )

    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise credentials_error
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise credentials_error

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise credentials_error

    return TokenResponse(
        access_token=create_access_token(
            subject=user.id,
            extra_claims={"username": user.username, "role": user.role},
        ),
        refresh_token=create_refresh_token(subject=user.id),
    )


# ─── 로그아웃 ─────────────────────────────────────────────────────────────────
@router.post("/logout", summary="로그아웃")
async def logout() -> dict:
    """
    서버 측 로그아웃 처리
    JWT는 stateless라 실제 무효화는 클라이언트(쿠키 삭제)가 담당
    추후 Redis 블랙리스트 구현 예정
    """
    return {"message": "로그아웃 완료"}


# ─── 내 정보 ──────────────────────────────────────────────────────────────────
@router.get(
    "/me",
    response_model=UserResponse,
    summary="내 정보 조회",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """현재 로그인한 사용자 정보 반환"""
    return _to_response(current_user)


# ─── 헬퍼 ─────────────────────────────────────────────────────────────────────
def _to_response(user: User) -> UserResponse:
    """User 모델 → UserResponse 변환 (포인트 포함)"""
    balance = user.point_balance.balance if user.point_balance else 0
    return UserResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        bio=user.bio,
        avatar_url=user.avatar_url,
        role=user.role,
        is_verified=user.is_verified,
        is_active=user.is_active,
        follower_count=user.follower_count,
        following_count=user.following_count,
        post_count=user.post_count,
        point_balance=balance,
        created_at=user.created_at,
    )
