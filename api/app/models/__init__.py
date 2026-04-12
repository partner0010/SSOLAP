# models package — 모든 모델 임포트 (Alembic이 감지할 수 있도록)
from app.models.user import User, UserPoints

__all__ = ["User", "UserPoints"]
