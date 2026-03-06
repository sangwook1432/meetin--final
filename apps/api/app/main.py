from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

# ─── FastAPI 앱 ────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
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


@app.get("/health")
def health():
    return {"ok": True, "env": settings.env}
