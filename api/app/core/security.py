"""
core/security.py — JWT 생성/검증 + 비밀번호 해싱
passlib 대신 bcrypt를 직접 사용 (Python 3.13 호환)
"""
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


# ─── 비밀번호 해싱 (bcrypt 직접 사용) ────────────────────────────────────────

def hash_password(plain: str) -> str:
    """평문 비밀번호 → bcrypt 해시"""
    password_bytes = plain.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)  # 12 rounds = 보안 vs 성능 균형
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """입력 비밀번호와 저장된 해시 비교 (상수시간 비교 — 타이밍 공격 방어)"""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ─── JWT 토큰 ─────────────────────────────────────────────────────────────────

def create_access_token(
    subject: int | str,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """액세스 토큰 생성 (기본 60분 유효)"""
    now    = datetime.now(tz=timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: dict[str, Any] = {
        "sub":  str(subject),
        "iat":  now,
        "exp":  expire,
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: int | str) -> str:
    """리프레시 토큰 생성 (기본 30일 유효)"""
    now    = datetime.now(tz=timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload: dict[str, Any] = {
        "sub":  str(subject),
        "iat":  now,
        "exp":  expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """토큰 디코드 & 검증 — 만료/변조 시 JWTError 발생"""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
