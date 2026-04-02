"""
Gmail SMTP 기반 이메일 OTP 서비스

흐름:
  1. POST /auth/email/send-otp: 이메일로 6자리 OTP 발송 (10분 유효)
  2. POST /auth/reset-password: 이메일 + OTP 검증 → 비밀번호 재설정

GMAIL_USER / GMAIL_APP_PASSWORD 미설정 시 mock 모드:
  실제 발송 없이 OTP "000000" 저장 (개발 환경용)
"""
from __future__ import annotations

import logging
import random
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger("meetin.email_otp")

OTP_TTL = 600  # 10분

# ── 인메모리 fallback (Redis 없는 환경) ────────────────────────────
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


def _send_gmail(to_email: str, otp: str) -> None:
    """Gmail SMTP SSL로 OTP 이메일 발송."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "[MEETIN.] 비밀번호 재설정 인증코드"
    msg["From"] = settings.gmail_user
    msg["To"] = to_email

    body = (
        f"안녕하세요, MEETIN. 입니다.\n\n"
        f"비밀번호 재설정 인증코드: {otp}\n\n"
        f"이 코드는 10분간 유효합니다.\n"
        f"본인이 요청하지 않은 경우 이 이메일을 무시해주세요.\n\n"
        f"— MEETIN. 팀"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(settings.gmail_user, settings.gmail_app_password)
        server.sendmail(settings.gmail_user, to_email, msg.as_string())


async def send_otp(email: str) -> bool:
    """6자리 OTP 생성 → 저장 → Gmail 발송. 성공 시 True."""
    if not settings.gmail_user or not settings.gmail_app_password:
        logger.warning("[EMAIL OTP MOCK] Gmail 미설정. OTP=000000 저장 (발송 없음). email=%s", email)
        await _store(f"email_otp:{email}", "000000", OTP_TTL)
        return True

    otp = str(random.randint(100000, 999999))
    try:
        _send_gmail(email, otp)
    except Exception as exc:
        logger.error("[EMAIL OTP] 발송 실패 (%s): %s", email, exc)
        return False

    await _store(f"email_otp:{email}", otp, OTP_TTL)
    logger.info("[EMAIL OTP] 발송 성공: %s", email)
    return True


async def verify_otp(email: str, otp: str) -> bool:
    """OTP 검증 후 소비 (1회용). 일치 시 True."""
    stored = await _fetch(f"email_otp:{email}")
    if not stored or stored != otp:
        return False
    await _delete(f"email_otp:{email}")
    return True
