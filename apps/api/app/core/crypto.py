"""
전화번호 암호화/복호화 (Fernet — AES-128-CBC + HMAC-SHA256).

키 도출: SHA-256(b"phone_encrypt:" + PHONE_HMAC_SECRET) → base64url → Fernet key
별도 환경변수 없이 기존 PHONE_HMAC_SECRET에서 도메인 분리 파생.

사용:
    from app.core.crypto import encrypt_phone, decrypt_phone

    encrypted = encrypt_phone("+821012345678")   # DB 저장
    original  = decrypt_phone(encrypted)          # 알림 발송 시 복호화
"""
from __future__ import annotations

import base64
import hashlib


def _get_fernet():
    from cryptography.fernet import Fernet
    from app.core.config import settings

    raw = hashlib.sha256(
        b"phone_encrypt:" + settings.phone_hmac_secret.encode()
    ).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def encrypt_phone(phone: str) -> str:
    """E.164 전화번호를 암호화하여 반환."""
    return _get_fernet().encrypt(phone.encode()).decode()


def decrypt_phone(token: str) -> str | None:
    """암호화된 전화번호를 복호화. 실패 시 None 반환."""
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except Exception:
        return None
