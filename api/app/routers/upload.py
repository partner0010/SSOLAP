"""
routers/upload.py — 파일 업로드 API
POST /upload/image   — 이미지 업로드 (jpg, png, webp, gif)
POST /upload/video   — 영상 업로드 (mp4, webm, mov)
POST /upload/avatar  — 프로필 사진 업로드 (이미지 전용, 최대 5MB)
"""
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.models.user import User
from app.routers.deps import get_current_user

router  = APIRouter(prefix="/upload", tags=["파일 업로드"])
logger  = logging.getLogger(__name__)

# ─── 허용 타입 ─────────────────────────────────────────────────────────────────
ALLOWED_IMAGE_TYPES = {
    "image/jpeg":  ".jpg",
    "image/png":   ".png",
    "image/webp":  ".webp",
    "image/gif":   ".gif",
}
ALLOWED_VIDEO_TYPES = {
    "video/mp4":       ".mp4",
    "video/webm":      ".webm",
    "video/quicktime": ".mov",
}

MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10MB
MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200MB
MAX_AVATAR_SIZE = 5 * 1024 * 1024   #  5MB


# ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _ensure_dir(subdir: str) -> Path:
    """업로드 디렉토리 생성 후 경로 반환"""
    path = Path(settings.UPLOAD_DIR) / subdir
    path.mkdir(parents=True, exist_ok=True)
    return path


async def _save_file(
    file: UploadFile,
    allowed_types: dict[str, str],
    max_size: int,
    subdir: str,
) -> dict:
    """
    파일 검증 후 저장
    반환: { url, filename, content_type, size }
    """
    # MIME 타입 검사
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"지원하지 않는 파일 형식입니다. 허용: {list(allowed_types.keys())}",
        )

    ext      = allowed_types[file.content_type]
    filename = f"{uuid.uuid4().hex}{ext}"
    dest_dir = _ensure_dir(subdir)
    dest     = dest_dir / filename

    # 청크 단위로 읽어 저장 (메모리 효율)
    size = 0
    try:
        with open(dest, "wb") as f:
            while chunk := await file.read(1024 * 256):  # 256KB 청크
                size += len(chunk)
                if size > max_size:
                    f.close()
                    dest.unlink(missing_ok=True)
                    mb = max_size // (1024 * 1024)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"파일 크기가 {mb}MB를 초과합니다",
                    )
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        dest.unlink(missing_ok=True)
        # 시스템 정보는 서버 로그에만 기록 (클라이언트에 노출 금지)
        logger.error("File save failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="파일 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        )

    url = f"/uploads/{subdir}/{filename}"
    return {
        "url":          url,
        "filename":     filename,
        "content_type": file.content_type,
        "size":         size,
    }


# ─── 이미지 업로드 ─────────────────────────────────────────────────────────────

@router.post("/image", summary="이미지 업로드")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    """
    이미지 파일 업로드 (jpg, png, webp, gif)
    최대 10MB

    반환:
    ```json
    { "url": "/uploads/images/abc123.jpg", "size": 123456 }
    ```
    """
    result = await _save_file(
        file,
        allowed_types=ALLOWED_IMAGE_TYPES,
        max_size=MAX_IMAGE_SIZE,
        subdir="images",
    )
    return JSONResponse(content=result)


# ─── 영상 업로드 ──────────────────────────────────────────────────────────────

@router.post("/video", summary="영상 업로드")
async def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    """
    영상 파일 업로드 (mp4, webm, mov)
    최대 200MB
    """
    result = await _save_file(
        file,
        allowed_types=ALLOWED_VIDEO_TYPES,
        max_size=MAX_VIDEO_SIZE,
        subdir="videos",
    )
    return JSONResponse(content=result)


# ─── 아바타 업로드 ─────────────────────────────────────────────────────────────

@router.post("/avatar", summary="프로필 사진 업로드")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    """
    프로필 사진 업로드 (이미지 전용, 최대 5MB)
    """
    result = await _save_file(
        file,
        allowed_types=ALLOWED_IMAGE_TYPES,
        max_size=MAX_AVATAR_SIZE,
        subdir="avatars",
    )
    return JSONResponse(content=result)
