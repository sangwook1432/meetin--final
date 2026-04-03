"""
SOLAPI SMS OTP 서비스 (사전예약용)

흐름:
  1. send_otp(phone): 6자리 OTP 생성 → SOLAPI SMS 발송 → Redis 저장
  2. verify_otp(phone, otp): OTP 검증 → 성공 시 True / 실패 시 False

보안 정책:
  - OTP 만료: 5분 (300초)
  - 재요청 쿨타임: 60초
  - 전화번호당 최대 시도 횟수: 5회
  - OTP는 SHA-256 해시로 저장 (평문 미저장)
  - 인증 성공 시 OTP + 시도 카운터 즉시 삭제

SOLAPI 미설정 시 mock 모드:
  실제 발송 없이 OTP "000000" 저장 (로컬 개발용)

Redis 키 구조:
  sms_otp:{phone}          → hashed OTP   (TTL: 300s)
  sms_otp_attempts:{phone} → 시도 횟수     (TTL: 300s)
  sms_otp_cooldown:{phone} → "1"           (TTL: 60s)
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import random
import secrets
import time
from enum import Enum

import httpx

from app.core.config import settings

logger = logging.getLogger("meetin.sms_otp")

OTP_TTL = 300        # 5분
COOLDOWN_TTL = 60    # 60초 재요청 제한
MAX_ATTEMPTS = 5     # 최대 시도 횟수

SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send"


class SendOtpResult(str, Enum):
    OK = "ok"
    COOLDOWN = "cooldown"       # 재요청 쿨타임 중
    SEND_FAILED = "send_failed" # SOLAPI 발송 실패


# ── 인메모리 fallback (Redis 없는 로컬 환경) ─────────────────────────
_mem: dict[str, tuple[str, float]] = {}


def _mem_set(key: str, value: str, ttl: int) -> None:
    _mem[key] = (value, time.monotonic() + ttl)


def _mem_get(key: str) -> str | None:
    item = _mem.get(key)
    if not item:
        return None
    value, expire_at = item
    if time.monotonic() > expire_at:
        del _mem[key]
        return None
    return value


def _mem_del(key: str) -> None:
    _mem.pop(key, None)


# ── Redis / 인메모리 추상 레이어 ────────────────────────────────────
async def _store(key: str, value: str, ttl: int) -> None:
    from app.core.redis import get_redis
    r = get_redis()
    if r:
        await r.set(key, value, ex=ttl)
    else:
        _mem_set(key, value, ttl)


async def _fetch(key: str) -> str | None:
    from app.core.redis import get_redis
    r = get_redis()
    if r:
        return await r.get(key)
    return _mem_get(key)


async def _delete(key: str) -> None:
    from app.core.redis import get_redis
    r = get_redis()
    if r:
        await r.delete(key)
    else:
        _mem_del(key)


# ── 유틸 ─────────────────────────────────────────────────────────────
def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


async def _get_attempts(phone: str) -> int:
    raw = await _fetch(f"sms_otp_attempts:{phone}")
    try:
        return int(raw) if raw else 0
    except (ValueError, TypeError):
        return 0


# ── SOLAPI 발송 ──────────────────────────────────────────────────────
def _build_auth_header(api_key: str, api_secret: str) -> str:
    """HMAC-SHA256 인증 헤더 생성."""
    from datetime import datetime, timezone
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    salt = secrets.token_hex(16)
    signature = hmac.new(
        api_secret.encode("utf-8"),
        f"{timestamp}{salt}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"HMAC-SHA256 ApiKey={api_key}, Date={timestamp}, salt={salt}, signature={signature}"


async def _send_sms(to: str, text: str) -> bool:
    """SOLAPI를 통해 SMS 발송. 성공 시 True."""
    try:
        auth = _build_auth_header(settings.solapi_api_key, settings.solapi_api_secret)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                SOLAPI_SEND_URL,
                headers={
                    "Authorization": auth,
                    "Content-Type": "application/json",
                },
                json={
                    "message": {
                        "to": to,
                        "from": settings.solapi_from_number,
                        "text": text,
                    }
                },
            )
        if resp.status_code != 200:
            logger.error("[SMS] SOLAPI 발송 실패: %s %s", resp.status_code, resp.text)
            return False
        return True
    except Exception as exc:
        logger.error("[SMS] SOLAPI 요청 오류: %s", exc)
        return False


# ── 공개 API ─────────────────────────────────────────────────────────
async def send_otp(phone: str) -> SendOtpResult:
    """OTP 생성 후 SMS 발송.

    Args:
        phone: 01012345678 형태의 정규화된 번호

    Returns:
        SendOtpResult 열거값
    """
    # 쿨타임 확인
    if await _fetch(f"sms_otp_cooldown:{phone}"):
        logger.info("[SMS OTP] 쿨타임 중: %s", phone[-4:])
        return SendOtpResult.COOLDOWN

    otp = str(random.randint(100000, 999999))

    # mock 모드 (SOLAPI 미설정)
    if not settings.solapi_api_key or not settings.solapi_api_secret:
        logger.warning("[SMS OTP MOCK] SOLAPI 미설정. OTP=000000 저장 (phone=****%s)", phone[-4:])
        otp = "000000"
    else:
        text = f"[MEETIN.] 사전예약 인증번호: {otp} (5분 이내 입력)"
        ok = await _send_sms(phone, text)
        if not ok:
            return SendOtpResult.SEND_FAILED

    await _store(f"sms_otp:{phone}", _hash_otp(otp), OTP_TTL)
    await _store(f"sms_otp_attempts:{phone}", "0", OTP_TTL)
    await _store(f"sms_otp_cooldown:{phone}", "1", COOLDOWN_TTL)

    logger.info("[SMS OTP] OTP 발송 완료: ****%s", phone[-4:])
    return SendOtpResult.OK


async def verify_otp(phone: str, otp: str) -> tuple[bool, bool]:
    """OTP 검증.

    Args:
        phone: 01012345678 형태의 정규화된 번호
        otp:   사용자 입력값

    Returns:
        (success, exceeded)
        - success=True이면 인증 성공 (OTP + 카운터 삭제됨)
        - exceeded=True이면 시도 횟수 초과 (OTP 재발급 필요)
    """
    attempts = await _get_attempts(phone)

    if attempts >= MAX_ATTEMPTS:
        logger.warning("[SMS OTP] 시도 횟수 초과 상태: ****%s", phone[-4:])
        return False, True

    stored_hash = await _fetch(f"sms_otp:{phone}")
    if not stored_hash or stored_hash != _hash_otp(otp):
        new_attempts = attempts + 1
        await _store(f"sms_otp_attempts:{phone}", str(new_attempts), OTP_TTL)
        logger.warning("[SMS OTP] 인증 실패 (%d/%d): ****%s", new_attempts, MAX_ATTEMPTS, phone[-4:])
        exceeded = new_attempts >= MAX_ATTEMPTS
        return False, exceeded

    # 성공 → OTP + 카운터 즉시 삭제 (쿨타임은 유지)
    await _delete(f"sms_otp:{phone}")
    await _delete(f"sms_otp_attempts:{phone}")
    logger.info("[SMS OTP] 인증 성공: ****%s", phone[-4:])
    return True, False
