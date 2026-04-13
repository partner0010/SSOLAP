# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM python:3.13-slim AS builder

WORKDIR /build

# 시스템 의존성 (psycopg2 빌드에 필요)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt


# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.13-slim AS runtime

WORKDIR /app

# psycopg2 런타임 의존성
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# 빌드 단계에서 설치된 패키지 복사
COPY --from=builder /install /usr/local

# 앱 소스 복사
COPY . .

# 업로드 디렉토리 생성
RUN mkdir -p /app/uploads

# 비루트 사용자로 실행 (보안)
RUN adduser --disabled-password --gecos "" appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# 프로덕션: Alembic 마이그레이션 후 Uvicorn 실행
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"]
