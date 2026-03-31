"""
포트원(PortOne v1) 휴대폰 본인인증 서비스

흐름:
  1. 프론트에서 IMP.certification() 호출 → imp_uid 수신
  2. 백엔드로 imp_uid 전달
  3. 백엔드가 포트원 REST API로 imp_uid 검증
  4. 검증 성공 시 phone_token 발급 (10분 유효, 1회용)

IMP_REST_API_KEY / IMP_REST_API_SECRET 미설정 시 mock 모드:
  imp_uid 검증을 건너뛰고 imp_uid를 전화번호로 사용하는 테스트 토큰 발급
"""
from __future__ import annotations

import json
import logging
import secrets
import time

import httpx

from app.core.config import settings

logger = logging.getLogger("meetin.pass_auth")

TOKEN_TTL = 600  # phone_token 유효 시간: 10분

PORTONE_TOKEN_URL       = "https://api.iamport.kr/users/getToken"
PORTONE_CERT_URL        = "https://api.iamport.kr/certifications/{imp_uid}"
PORTONE_TOKEN_CACHE_KEY = "portone:access_token"
PORTONE_TOKEN_TTL       = 25 * 60  # 25분 (30분 만료 5분 전 갱신)


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


# ── 포트원 액세스 토큰 발급 (캐싱) ─────────────────────────────────
async def _get_portone_token() -> str:
    """포트원 access_token 반환. Redis(또는 인메모리)에 25분 캐싱.

    포트원 스펙:
      - 만료 전 재요청 시 기존 토큰 반환 (만료 1분 전이면 5분 연장)
      - 25분 TTL로 캐싱하면 30분 만료 전에 항상 갱신됨
    """
    cached = await _fetch(PORTONE_TOKEN_CACHE_KEY)
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            PORTONE_TOKEN_URL,
            json={
                "imp_key": settings.imp_rest_api_key,
                "imp_secret": settings.imp_rest_api_secret,
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"포트원 토큰 발급 실패: {resp.status_code} {resp.text}")
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"포트원 토큰 오류: {data.get('message')}")

    access_token: str = data["response"]["access_token"]
    await _store(PORTONE_TOKEN_CACHE_KEY, access_token, PORTONE_TOKEN_TTL)
    return access_token


# ── 포트원 본인인증 조회 ─────────────────────────────────────────────
async def _get_certification(imp_uid: str, access_token: str) -> dict:
    url = PORTONE_CERT_URL.format(imp_uid=imp_uid)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            url,
            headers={"Authorization": access_token},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"본인인증 조회 실패: {resp.status_code} {resp.text}")
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"본인인증 오류: {data.get('message')}")
    return data["response"]


# ── 공개 API ────────────────────────────────────────────────────────
async def certify(imp_uid: str) -> str | None:
    """
    포트원 imp_uid 검증 후 phone_token 발급.

    Returns:
        phone_token (str) — 성공
        None               — 실패 (이미 사용된 imp_uid, 인증 만료 등)

    mock 모드 (IMP_REST_API_KEY 미설정):
        imp_uid를 phone로 사용하는 테스트 토큰 발급
    """
    if not settings.imp_rest_api_key:
        # mock 모드: imp_uid를 전화번호처럼 취급
        logger.warning("[PASS MOCK] imp_uid=%s → phone_token 발급 (검증 없음)", imp_uid)
        data = {
            "phone": imp_uid,
            "name": "테스트",
            "birth_date": "19990101",
            "gender": "M",
        }
        token = secrets.token_urlsafe(32)
        await _store(
            f"phone_token:{token}",
            json.dumps(data, ensure_ascii=False),
            TOKEN_TTL,
        )
        return token

    try:
        access_token = await _get_portone_token()
        cert = await _get_certification(imp_uid, access_token)
    except RuntimeError as exc:
        logger.error("[PASS] 포트원 검증 오류: %s", exc)
        return None

    # 이미 사용된 imp_uid 재사용 방지
    used_key = f"cert_used:{imp_uid}"
    if await _fetch(used_key):
        logger.warning("[PASS] 이미 사용된 imp_uid: %s", imp_uid)
        return None
    await _store(used_key, "1", TOKEN_TTL)

    # 포트원 응답에서 본인인증 데이터 추출
    # phone: E.164 또는 010-xxxx-xxxx 형식
    raw_phone: str = cert.get("phone", "")
    # 포트원은 01012345678 형식으로 내려줌 → E.164 변환
    from app.services.phone import normalize_phone_kr_to_e164
    try:
        phone_e164 = normalize_phone_kr_to_e164(raw_phone)
    except ValueError:
        phone_e164 = raw_phone  # 변환 실패 시 원본 사용

    birth: str = cert.get("birthday", "") or ""        # YYYY-MM-DD
    birth_date = birth.replace("-", "") if birth else ""  # YYYYMMDD

    gender_raw: str = cert.get("gender", "") or ""
    gender = "M" if gender_raw == "male" else "F" if gender_raw == "female" else None

    data = {
        "phone": phone_e164,
        "name": cert.get("name") or "",
        "birth_date": birth_date,
        "gender": gender,
    }

    token = secrets.token_urlsafe(32)
    await _store(
        f"phone_token:{token}",
        json.dumps(data, ensure_ascii=False),
        TOKEN_TTL,
    )
    logger.info("[PASS] 본인인증 성공: ****%s", phone_e164[-4:] if len(phone_e164) >= 4 else "")
    return token


def _parse_token_data(raw: str) -> dict:
    """저장된 토큰 값을 파싱. 구 형식(평문 E.164)도 호환."""
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, ValueError):
        pass
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
