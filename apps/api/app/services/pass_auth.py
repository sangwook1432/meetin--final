"""
PASS 휴대폰 본인인증 서비스 (SMS OTP)

Solapi REST API 사용:
  https://developers.solapi.com/references/messages-v4

PASS_API_KEY / PASS_API_SECRET 미설정 시 mock 모드 (콘솔 OTP 출력).

phone_token 내부 구조 (JSON):
  {"phone": "+821012345678", "name": "홍길동", "birth_date": "19990101", "gender": "M"}
  KG이니시스 계약 전: mock_name / mock_birth_date / mock_gender 를 verify_otp에 전달
  KG이니시스 계약 후: inicis 콜백에서 직접 토큰 발급 예정
"""
from __future__ import annotations

import hashlib
import hmac as _hmac
import json
import logging
import re
import secrets
import time
from datetime import datetime, timezone

import httpx

from app.core.config import settings

logger = logging.getLogger("meetin.pass_auth")

SOLAPI_URL = "https://api.solapi.com/messages/v4/send"

OTP_TTL = 300        # OTP 유효 시간: 5분
TOKEN_TTL = 600      # phone_token 유효 시간: 10분
SEND_LIMIT = 5       # 번호당 최대 발송 횟수 (SEND_WINDOW 내)
SEND_WINDOW = 3600   # 발송 횟수 집계 윈도우: 1시간
ATTEMPT_LIMIT = 5    # 번호당 최대 인증 시도 횟수 (ATTEMPT_WINDOW 내)
ATTEMPT_WINDOW = 600 # 시도 횟수 집계 윈도우: 10분


# ── 인메모리 fallback (Redis 없는 개발 환경) ────────────────────────
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


async def _increment(key: str, ttl: int) -> int:
    """카운터 1 증가 후 현재값 반환. 첫 증가 시 TTL 설정."""
    from app.core.redis import get_redis
    r = get_redis()
    if r:
        val = await r.incr(key)
        if val == 1:
            await r.expire(key, ttl)
        return val
    # 인메모리 fallback
    item = _mem.get(key)
    if item:
        count_str, expire_at = item
        if time.monotonic() < expire_at:
            new_count = int(count_str) + 1
            _mem[key] = (str(new_count), expire_at)
            return new_count
    _mem[key] = ("1", time.monotonic() + ttl)
    return 1


# ── Solapi 인증 헤더 ────────────────────────────────────────────────
def _solapi_auth_header() -> str:
    date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    salt = secrets.token_hex(16)
    data = f"date={date}&salt={salt}"
    sig = _hmac.new(
        settings.pass_api_secret.encode(),
        data.encode(),
        hashlib.sha256,
    ).hexdigest()
    return (
        f"HMAC-SHA256 apiKey={settings.pass_api_key}, "
        f"date={date}, salt={salt}, signature={sig}"
    )


async def _send_sms(phone_e164: str, otp: str) -> bool:
    kr_phone = re.sub(r"^\+82", "0", phone_e164)
    payload = {
        "message": {
            "to": kr_phone,
            "from": settings.pass_sender_number,
            "text": f"[MEETIN] 인증번호: {otp} (5분 이내 입력)",
        }
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                SOLAPI_URL,
                json=payload,
                headers={"Authorization": _solapi_auth_header()},
            )
        if resp.status_code == 200:
            return True
        logger.error("[PASS] SMS 발송 실패: %s %s", resp.status_code, resp.text)
        return False
    except Exception as exc:
        logger.error("[PASS] SMS 발송 오류: %s", exc)
        return False


# ── 공개 API ────────────────────────────────────────────────────────
async def send_otp(phone_e164: str) -> bool:
    """OTP 생성 후 SMS 발송. PASS_API_KEY 미설정 시 mock 모드.

    Returns:
        True  — 발송 성공
        False — SMS 발송 실패 (API 오류)
        None  — 발송 횟수 초과 (호출자에서 429 반환 권장)
    """
    # 번호당 발송 횟수 제한
    count = await _increment(f"otp_send:{phone_e164}", SEND_WINDOW)
    if count > SEND_LIMIT:
        logger.warning("[PASS] 발송 횟수 초과: ****%s (%d회)", phone_e164[-4:], count)
        return None  # type: ignore[return-value]

    # 암호학적으로 안전한 6자리 OTP 생성
    otp = "".join(str(secrets.randbelow(10)) for _ in range(6))
    await _store(f"otp:{phone_e164}", otp, OTP_TTL)

    if not settings.pass_api_key:
        logger.warning(
            "[PASS MOCK] phone=****%s OTP=%s (5분 유효)",
            phone_e164[-4:],
            otp,
        )
        return True

    return await _send_sms(phone_e164, otp)


async def verify_otp(
    phone_e164: str,
    code: str,
    extra: dict | None = None,
) -> str | None:
    """OTP 검증. 성공 시 1회용 phone_token 반환, 실패/잠금 시 None.

    extra: KG이니시스 mock 데이터 {"name": ..., "birth_date": ..., "gender": ...}
    """
    attempts_key = f"otp_attempts:{phone_e164}"

    # 시도 횟수 초과 시 즉시 거부
    current = await _fetch(attempts_key)
    if current is not None and int(current) >= ATTEMPT_LIMIT:
        logger.warning("[PASS] 시도 횟수 초과: ****%s", phone_e164[-4:])
        return None

    # 시도 횟수 증가
    await _increment(attempts_key, ATTEMPT_WINDOW)

    stored = await _fetch(f"otp:{phone_e164}")
    # timing attack 방지: compare_digest 사용
    if not stored or not _hmac.compare_digest(stored, code):
        return None

    # 성공: OTP·시도 횟수 삭제, phone_token 발급
    await _delete(f"otp:{phone_e164}")
    await _delete(attempts_key)

    data: dict = {"phone": phone_e164}
    if extra:
        data.update({k: v for k, v in extra.items() if v is not None})

    token = secrets.token_urlsafe(32)
    await _store(f"phone_token:{token}", json.dumps(data, ensure_ascii=False), TOKEN_TTL)
    return token


def _parse_token_data(raw: str) -> dict:
    """저장된 토큰 값을 파싱. 구 형식(평문 E.164)도 호환."""
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, ValueError):
        pass
    # 구 형식: 평문 E.164 문자열
    return {"phone": raw}


async def peek_phone_token(token: str) -> str | None:
    """phone_token이 유효한지 확인 (소비하지 않음). 유효 시 phone_e164 반환."""
    raw = await _fetch(f"phone_token:{token}")
    if not raw:
        return None
    return _parse_token_data(raw).get("phone")


async def peek_phone_token_full(token: str) -> dict | None:
    """phone_token 전체 데이터 조회 (소비하지 않음).
    반환: {"phone": ..., "name": ..., "birth_date": ..., "gender": ...}
    """
    raw = await _fetch(f"phone_token:{token}")
    if not raw:
        return None
    return _parse_token_data(raw)


async def consume_phone_token(token: str) -> str | None:
    """phone_token 검증 후 소비 (1회용). 유효 시 phone_e164 반환."""
    key = f"phone_token:{token}"
    raw = await _fetch(key)
    if not raw:
        return None
    await _delete(key)
    return _parse_token_data(raw).get("phone")
