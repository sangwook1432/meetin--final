from contextlib import asynccontextmanager

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.api.router import router

# ─── Sentry 초기화 (SENTRY_DSN 설정 시 활성화) ────────────────────
if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.env,
        integrations=[
            FastApiIntegration(),
            SqlalchemyIntegration(),
        ],
        # 성능 트레이싱: 10% 샘플링 (운영 환경 부하 고려)
        traces_sample_rate=0.1 if settings.env == "production" else 1.0,
        send_default_pii=False,  # 개인정보 미포함
    )

# ─── 로깅 설정 ────────────────────────────────────────────────────
import logging
import json
import time
import uuid

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(message)s",  # JSON 포맷터에서 직접 처리
)
logger = logging.getLogger("meetin")


class JsonFormatter(logging.Formatter):
    """구조화된 JSON 로그 포맷터"""
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            log_obj["exc"] = self.formatException(record.exc_info)
        # 추가 필드 (request_id, user_id 등)
        for key in ("request_id", "user_id", "path", "method", "duration_ms", "status_code"):
            if hasattr(record, key):
                log_obj[key] = getattr(record, key)
        return json.dumps(log_obj, ensure_ascii=False)


# 핸들러에 JSON 포맷터 적용
for handler in logging.root.handlers:
    handler.setFormatter(JsonFormatter())


# ─── Lifespan: Redis + Scheduler ─────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Redis 연결 (REDIS_URL 없으면 no-op)
    from app.core.redis import init_redis, close_redis
    await init_redis()

    # 2. 스케줄러 시작
    try:
        from app.services.scheduler import start_scheduler
        start_scheduler()
        logger.info("[APP] Scheduler started")
    except ImportError:
        logger.warning("[APP] APScheduler not installed — scheduler disabled")
    except Exception as e:
        logger.error("[APP] Failed to start scheduler: %s", e, exc_info=True)

    yield  # 앱 실행

    # 종료: 스케줄러 → Redis 순서로 정리
    try:
        from app.services.scheduler import stop_scheduler
        stop_scheduler()
        logger.info("[APP] Scheduler stopped")
    except Exception:
        pass

    await close_redis()


# ─── FastAPI 앱 ────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Rate Limiting (slowapi) ──────────────────────────────────────
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware

    limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
    logger.info("Rate limiting enabled (slowapi)")
except ImportError:
    logger.warning("slowapi not installed — rate limiting disabled. Run: pip install slowapi")


# ─── 글로벌 에러 핸들러 ───────────────────────────────────────────

def _error_response(status_code: int, detail: str | list, request_id: str | None = None) -> JSONResponse:
    """통일된 에러 응답 포맷 반환.

    {
        "error": {
            "status": 422,
            "detail": "...",
            "request_id": "abc12345"   ← 디버깅용
        }
    }
    """
    body = {
        "error": {
            "status": status_code,
            "detail": detail,
        }
    }
    if request_id:
        body["error"]["request_id"] = request_id
    return JSONResponse(status_code=status_code, content=body)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """FastAPI/Starlette HTTPException → 통일된 포맷으로 변환"""
    request_id = getattr(request.state, "request_id", None)
    return _error_response(exc.status_code, exc.detail, request_id)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Pydantic 유효성 검사 실패 → 읽기 쉬운 메시지로 변환 (422)"""
    request_id = getattr(request.state, "request_id", None)
    errors = []
    for err in exc.errors():
        loc = " → ".join(str(v) for v in err["loc"] if v != "body")
        errors.append(f"{loc}: {err['msg']}" if loc else err["msg"])
    detail = errors if len(errors) > 1 else (errors[0] if errors else "Validation error")
    return _error_response(422, detail, request_id)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """처리되지 않은 예외 → 500 (스택트레이스는 로그에만)"""
    request_id = getattr(request.state, "request_id", None)
    logger.error(
        "Unhandled exception: %s",
        exc,
        exc_info=True,
        extra={"request_id": request_id} if request_id else {},
    )
    return _error_response(500, "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", request_id)


# ─── Request ID + 구조화 로깅 미들웨어 ───────────────────────────
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())[:8]
    start = time.time()

    # request_id 를 Request state 에 저장 (엔드포인트에서도 참조 가능)
    request.state.request_id = request_id

    response = await call_next(request)

    duration_ms = round((time.time() - start) * 1000, 1)
    log_record = logging.LogRecord(
        name="meetin.http",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg=f"{request.method} {request.url.path} {response.status_code}",
        args=(),
        exc_info=None,
    )
    log_record.request_id = request_id
    log_record.method = request.method
    log_record.path = request.url.path
    log_record.status_code = response.status_code
    log_record.duration_ms = duration_ms
    logger.handle(log_record)

    response.headers["X-Request-ID"] = request_id
    return response


app.include_router(router)

# ─── 업로드 파일 정적 서빙 ────────────────────────────────────────
_upload_dir = "/app/uploads"
os.makedirs(_upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_upload_dir), name="uploads")


@app.get("/health")
def health():
    """헬스체크 엔드포인트 — DB 연결 상태 포함"""
    from app.db.session import db_ping
    db_ok = db_ping()
    return {
        "ok": db_ok,
        "env": settings.env,
        "db": "ok" if db_ok else "error",
        "version": "3.0.0",
    }
