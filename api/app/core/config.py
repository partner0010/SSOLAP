"""
core/config.py — 환경변수 & 설정 관리
pydantic-settings로 .env 파일을 자동으로 읽어 타입 검증
"""
import sys
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

_INSECURE_DEFAULT_KEY = "CHANGE_ME_IN_PRODUCTION_USE_OPENSSL_RAND_HEX_32"


class Settings(BaseSettings):
    # ── 앱 기본 ───────────────────────────────────────────────────────────────
    APP_NAME:    str  = "SSOLAP API"
    APP_VERSION: str  = "0.1.0"
    DEBUG:       bool = False          # 프로덕션 기본값 False — .env에서 DEBUG=true 로 켜기

    # ── 데이터베이스 ──────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./ssolap_dev.db"

    # ── JWT 인증 ──────────────────────────────────────────────────────────────
    SECRET_KEY:                  str = _INSECURE_DEFAULT_KEY
    ALGORITHM:                   str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS:   int = 30

    # ── bcrypt 설정 ───────────────────────────────────────────────────────────
    BCRYPT_ROUNDS: int = 12  # 개발: 10 으로 낮춰 속도 향상 가능 (프로덕션: 12)

    # ── Redis (선택) ──────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"

    # ── AI ────────────────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""

    # ── 파일 업로드 ────────────────────────────────────────────────────────────
    UPLOAD_DIR:       str = "./uploads"
    MAX_FILE_SIZE_MB: int = 50

    # ── CORS ──────────────────────────────────────────────────────────────────
    # 쉼표 구분 문자열로 받아서 리스트로 변환
    # .env 예: CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
    # capacitor:// — Android/iOS Capacitor 앱 오리진
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "capacitor://localhost,https://localhost"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS_ORIGINS 문자열 → 리스트 변환"""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── S포인트 ──────────────────────────────────────────────────────────────
    DAILY_POINT_CAP:      int = 500
    POINT_CHECKIN_REWARD: int = 10
    POINT_POST_REWARD:    int = 20
    POINT_COMMENT_REWARD: int = 5

    # ── 보안 검증 ─────────────────────────────────────────────────────────────
    @model_validator(mode="after")
    def _validate_secret_key(self) -> "Settings":
        if not self.DEBUG and self.SECRET_KEY == _INSECURE_DEFAULT_KEY:
            # 프로덕션에서 기본 키 사용 시 서버 시작 거부
            print(
                "\n[FATAL] SECRET_KEY is set to the insecure default value.\n"
                "  Set a real 32-byte key in .env:  SECRET_KEY=<openssl rand -hex 32>\n"
                "  Or enable DEBUG=true for local dev.\n",
                file=sys.stderr,
            )
            sys.exit(1)
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
