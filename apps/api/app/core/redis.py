"""
Redis 클라이언트 싱글턴.

REDIS_URL 환경변수가 설정된 경우에만 연결.
없으면 get_redis()가 None을 반환 → 각 사용처에서 fallback 처리.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("meetin.redis")

_redis = None  # redis.asyncio.Redis | None


async def init_redis() -> None:
    global _redis
    from app.core.config import settings
    if not settings.redis_url:
        logger.info("[REDIS] REDIS_URL not set — running in local (in-memory) mode")
        return
    try:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        await _redis.ping()
        logger.info("[REDIS] connected to %s", settings.redis_url)
    except Exception as exc:
        logger.error("[REDIS] connection failed: %s — falling back to in-memory mode", exc)
        _redis = None


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None
        logger.info("[REDIS] connection closed")


def get_redis():
    """현재 Redis 클라이언트 반환. 미연결 시 None."""
    return _redis
