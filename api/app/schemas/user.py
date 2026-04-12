"""
schemas/user.py — Pydantic 요청/응답 스키마
DB 모델(SQLAlchemy)과 API 계층 사이의 데이터 변환 담당
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator
import re


# ─── 회원가입 요청 ─────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    username:         str = Field(..., min_length=3, max_length=20)
    display_name:     str = Field(..., min_length=1, max_length=30)
    email:            EmailStr
    password:         str = Field(..., min_length=8, max_length=100)
    password_confirm: str

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        """아이디: 영문/숫자/_ 만 허용"""
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("영문, 숫자, _ 만 사용 가능합니다")
        return v.lower()   # 소문자로 저장

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        """비밀번호: 영문 + 숫자 포함"""
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("영문과 숫자를 모두 포함해야 합니다")
        return v

    def validate_passwords_match(self) -> None:
        if self.password != self.password_confirm:
            raise ValueError("비밀번호가 일치하지 않습니다")


# ─── 로그인 응답 ───────────────────────────────────────────────────────────────
class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ─── 사용자 응답 (API 반환용) ──────────────────────────────────────────────────
class UserResponse(BaseModel):
    """
    사용자 공개 정보 — API 응답에 사용
    hashed_password 등 민감 정보 제외
    """
    id:              int
    username:        str
    display_name:    str
    email:           str
    bio:             Optional[str] = None
    avatar_url:      Optional[str] = None
    role:            str
    is_verified:     bool
    is_active:       bool
    follower_count:  int
    following_count: int
    post_count:      int
    point_balance:   int = 0   # UserPoints.balance
    created_at:      datetime

    model_config = {"from_attributes": True}  # SQLAlchemy 모델 → Pydantic 자동 변환


# ─── 프로필 업데이트 요청 ──────────────────────────────────────────────────────
class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=30)
    bio:          Optional[str] = Field(None, max_length=200)
    avatar_url:   Optional[str] = Field(None, max_length=500)
