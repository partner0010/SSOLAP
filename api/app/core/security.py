"""
core/security.py — JWT 생성/검증 + 비밀번호 해싱
passlib 대신 bcrypt를 직접 사용 (Python 3.13 호환)
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


# ─── 비밀번호 정책 ────────────────────────────────────────────────────────────

PASSWORD_MIN_LEN = 8

def validate_password_strength(password: str) -> None:
    """
    비밀번호 강도 검사 — 위반 시 ValueError 발생
    규칙: 8자 이상 / 영문 대문자 1개 이상 / 숫자 1개 이상 / 특수문자 1개 이상
    (한국 개인정보보호법 기술적 보호조치 기준 준수)
    """
    errors = []
    if len(password) < PASSWORD_MIN_LEN:
        errors.append(f"최소 {PASSWORD_MIN_LEN}자 이상이어야 합니다")
    if not re.search(r"[A-Za-z]", password):
        errors.append("영문자를 포함해야 합니다")
    if not re.search(r"\d", password):
        errors.append("숫자를 포함해야 합니다")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?`~]", password):
        errors.append("특수문자(!@#$%^&* 등)를 포함해야 합니다")
    if errors:
        raise ValueError(" / ".join(errors))


# ─── 비밀번호 해싱 (bcrypt 직접 사용) ────────────────────────────────────────

def hash_password(plain: str) -> str:
    """평문 비밀번호 → bcrypt 해시"""
    password_bytes = plain.encode("utf-8")
    salt = bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
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
