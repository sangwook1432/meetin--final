"""
Gmail SMTP 기반 이메일 OTP 서비스

흐름:
  1. POST /auth/email/send-otp: 이메일로 6자리 OTP 발송 (10분 유효)
  2. POST /auth/reset-password: 이메일 + OTP 검증 → 비밀번호 재설정

GMAIL_USER / GMAIL_APP_PASSWORD 미설정 시 mock 모드:
  실제 발송 없이 OTP "000000" 저장 (개발 환경용)
"""
from __future__ import annotations

import hashlib
import logging
import random
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger("meetin.email_otp")

OTP_TTL = 600       # 10분
MAX_ATTEMPTS = 5    # 최대 시도 횟수


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()

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


def _build_html(otp: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

        <!-- 로고 -->
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:22px;font-weight:900;color:#111827;letter-spacing:-0.5px;">
            MEETIN<span style="color:#2563eb;">.</span>
          </span>
        </td></tr>

        <!-- 카드 -->
        <tr><td style="background-color:#ffffff;border-radius:16px;padding:40px 36px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">

          <p style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#111827;text-align:center;">
            비밀번호 재설정
          </p>
          <p style="margin:0 0 32px 0;font-size:14px;color:#6b7280;text-align:center;line-height:1.6;">
            아래 인증코드를 입력해 비밀번호를 재설정하세요.
          </p>

          <!-- 인증코드 박스 -->
          <div style="background-color:#f0f5ff;border-radius:12px;padding:24px 16px;text-align:center;margin-bottom:32px;">
            <p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:#2563eb;letter-spacing:0.08em;text-transform:uppercase;">
              인증코드
            </p>
            <p style="margin:0;font-size:40px;font-weight:800;color:#1e3a8a;letter-spacing:0.15em;">
              {otp}
            </p>
          </div>

          <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;text-align:center;line-height:1.6;">
            이 코드는 <strong style="color:#111827;">10분간</strong> 유효합니다.
          </p>
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
            본인이 요청하지 않은 경우 이 메일을 무시해주세요.
          </p>

        </td></tr>

        <!-- 푸터 -->
        <tr><td align="center" style="padding-top:20px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            &copy; 2026 MEETIN. All rights reserved.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _build_plain(otp: str) -> str:
    return (
        f"MEETIN. 비밀번호 재설정\n\n"
        f"인증코드: {otp}\n\n"
        f"이 코드는 10분간 유효합니다.\n"
        f"본인이 요청하지 않은 경우 이 메일을 무시해주세요.\n\n"
        f"© 2026 MEETIN."
    )


def _send_gmail(to_email: str, otp: str) -> None:
    """Gmail SMTP SSL로 OTP 이메일 발송 (HTML + plain text 멀티파트)."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "[MEETIN.] 비밀번호 재설정 인증코드"
    msg["From"] = settings.gmail_user
    msg["To"] = to_email

    msg.attach(MIMEText(_build_plain(otp), "plain", "utf-8"))
    msg.attach(MIMEText(_build_html(otp), "html", "utf-8"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(settings.gmail_user, settings.gmail_app_password)
        server.sendmail(settings.gmail_user, to_email, msg.as_string())


async def send_otp(email: str) -> bool:
    """6자리 OTP 생성 → SHA-256 해시 저장 → Gmail 발송. 성공 시 True."""
    if not settings.gmail_user or not settings.gmail_app_password:
        logger.warning("[EMAIL OTP MOCK] Gmail 미설정. OTP=000000 저장 (발송 없음). email=%s", email)
        await _store(f"email_otp:{email}", _hash_otp("000000"), OTP_TTL)
        await _store(f"email_otp_attempts:{email}", "0", OTP_TTL)
        return True

    otp = str(random.randint(100000, 999999))
    try:
        _send_gmail(email, otp)
    except Exception as exc:
        logger.error("[EMAIL OTP] 발송 실패 (%s): %s", email, exc)
        return False

    # OTP는 해시로 저장, 시도 횟수 초기화
    await _store(f"email_otp:{email}", _hash_otp(otp), OTP_TTL)
    await _store(f"email_otp_attempts:{email}", "0", OTP_TTL)
    logger.info("[EMAIL OTP] 발송 성공: %s", email)
    return True


RESET_TOKEN_TTL = 300  # reset_token 유효 시간: 5분


async def _get_attempts(email: str) -> int:
    raw = await _fetch(f"email_otp_attempts:{email}")
    if raw is None:
        return 0
    try:
        return int(raw)
    except (ValueError, TypeError):
        return 0


async def verify_otp_and_issue_reset_token(email: str, otp: str) -> tuple[str | None, bool]:
    """OTP 검증 후 소비 → 비밀번호 재설정용 단기 토큰 발급.

    Returns:
        (reset_token, exceeded)
        - reset_token이 None이 아니면 성공
        - exceeded=True이면 시도 횟수 초과 (재발급 필요)
    """
    import secrets as _secrets

    attempts = await _get_attempts(email)

    # 이미 초과 상태
    if attempts >= MAX_ATTEMPTS:
        logger.warning("[EMAIL OTP] 시도 횟수 초과 상태: %s", email)
        return None, True

    stored_hash = await _fetch(f"email_otp:{email}")
    if not stored_hash or stored_hash != _hash_otp(otp):
        new_attempts = attempts + 1
        await _store(f"email_otp_attempts:{email}", str(new_attempts), OTP_TTL)
        logger.warning("[EMAIL OTP] 인증 실패 (%d/%d): %s", new_attempts, MAX_ATTEMPTS, email)
        # 이번 시도로 한도 도달 → exceeded 반환
        exceeded = new_attempts >= MAX_ATTEMPTS
        return None, exceeded

    # 성공 → OTP + 카운터 삭제, reset_token 발급
    await _delete(f"email_otp:{email}")
    await _delete(f"email_otp_attempts:{email}")

    reset_token = _secrets.token_urlsafe(32)
    await _store(f"email_reset_token:{email}", reset_token, RESET_TOKEN_TTL)
    logger.info("[EMAIL OTP] OTP 검증 성공, reset_token 발급: %s", email)
    return reset_token, False


async def consume_reset_token(email: str, token: str) -> bool:
    """reset_token 검증 후 소비 (1회용). 일치 시 True."""
    stored = await _fetch(f"email_reset_token:{email}")
    if not stored or stored != token:
        return False
    await _delete(f"email_reset_token:{email}")
    return True
