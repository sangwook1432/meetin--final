import re
import hmac
import hashlib

from app.core.config import settings


def normalize_phone_domestic(raw: str) -> str:
    """한국 휴대폰 번호를 01012345678 형태로 정규화.

    입력 예:
      "010-1234-5678"    → "01012345678"
      "+82 10-1234-5678" → "01012345678"
      "821012345678"     → "01012345678"
    """
    if not raw:
        raise ValueError("Phone is required")
    digits = re.sub(r"\D", "", raw)
    # +82 / 82 접두사 → 0 변환
    if digits.startswith("82") and len(digits) == 12:
        digits = "0" + digits[2:]
    if not (digits.startswith("010") and len(digits) == 11):
        raise ValueError("올바른 휴대폰 번호를 입력해주세요. (010으로 시작하는 11자리)")
    return digits


def normalize_phone_kr_to_e164(raw: str) -> str:
    if not raw:
        raise ValueError("Phone is required")

    digits = re.sub(r"\D", "", raw)

    if digits.startswith("010") and len(digits) == 11:
        return "+82" + digits[1:]  # 010 -> +8210

    if digits.startswith("82") and len(digits) >= 10:
        return "+" + digits

    raise ValueError("Invalid KR phone format. Expect 010xxxxxxxx.")


def phone_hmac_hash(e164: str) -> str:
    return hmac.new(
        settings.phone_hmac_secret.encode("utf-8"),
        e164.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def phone_last4(e164: str) -> str:
    digits = re.sub(r"\D", "", e164)
    return digits[-4:]
