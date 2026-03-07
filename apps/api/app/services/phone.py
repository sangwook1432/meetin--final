import re
import hmac
import hashlib

from app.core.config import settings


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
