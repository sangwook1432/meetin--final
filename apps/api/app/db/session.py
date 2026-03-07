"""
DB Session & Connection Pool

설정 근거:
  pool_size=10       : 일반 트래픽 대응. 커넥션 10개 상시 유지.
  max_overflow=20    : 피크 시 최대 30개(10+20)까지 일시적 허용.
  pool_timeout=30    : 30초 대기 후 TimeoutError (무한 대기 방지).
  pool_recycle=1800  : 30분마다 커넥션 재생성 (AWS RDS idle timeout 방어).
  pool_pre_ping=True : 쿼리 전 커넥션 살아있는지 확인 (stale connection 자동 교체).

운영 튜닝 포인트:
  - EC2 t3.small(2CPU) + RDS PostgreSQL 기준 위 값이 적절.
  - 트래픽 증가 시 pool_size=20, max_overflow=40 으로 증가.
  - PgBouncer(커넥션 풀러) 앞단에 두면 pool_size 를 줄여도 됨.

환경변수로 오버라이드 가능:
  DB_POOL_SIZE, DB_MAX_OVERFLOW, DB_POOL_TIMEOUT, DB_POOL_RECYCLE
"""

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool

from app.core.config import settings


# ─── 엔진 생성 ────────────────────────────────────────────────────

def _build_engine():
    # 환경 변수 오버라이드 지원
    pool_size      = int(getattr(settings, "db_pool_size",      10))
    max_overflow   = int(getattr(settings, "db_max_overflow",   20))
    pool_timeout   = int(getattr(settings, "db_pool_timeout",   30))
    pool_recycle   = int(getattr(settings, "db_pool_recycle",   1800))

    # SQLite는 멀티스레드 불가 → check_same_thread=False 필요 (테스트 전용)
    connect_args = {}
    if settings.database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(
        settings.database_url,
        # 커넥션 풀 설정
        poolclass=QueuePool,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        pool_recycle=pool_recycle,
        pool_pre_ping=True,          # 쿼리 전 커넥션 health check
        # 성능
        echo=False,                  # SQL 로그 비활성화 (운영)
        connect_args=connect_args,
    )

    # ── slow query 감지 이벤트 (100ms 초과 시 경고 로그) ──────────
    import logging
    import time

    slow_query_logger = logging.getLogger("meetin.db.slow")

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("query_start_time", []).append(time.monotonic())

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        total_ms = (time.monotonic() - conn.info["query_start_time"].pop()) * 1000
        if total_ms > 100:
            slow_query_logger.warning(
                "SLOW QUERY %.1fms | %s",
                total_ms,
                statement[:200].replace("\n", " "),
            )

    return engine


engine = _build_engine()

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,   # commit 후 객체 lazy reload 방지 → 성능 향상
)


# ─── 헬스체크용 DB ping ────────────────────────────────────────────

def db_ping() -> bool:
    """DB 연결 확인. /health 엔드포인트에서 호출."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
