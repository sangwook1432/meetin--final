import bcrypt
import hashlib
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError

from app.core.config import settings

def hash_password(password: str) -> str:
    # 1. SHA-256으로 해싱하여 길이 제한 문제 원천 차단
    pre_hashed = hashlib.sha256(password.encode('utf-8')).hexdigest().encode('utf-8')
    # 2. 순수 bcrypt 라이브러리를 직접 사용하여 안전하게 암호화 (passlib 제거)
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(pre_hashed, salt)
    return hashed_bytes.decode('utf-8')

def verify_password(password: str, password_hash: str) -> bool:
    # 검증할 때도 똑같이 SHA-256 압축 후 bcrypt 자체 검증 함수 사용
    pre_hashed = hashlib.sha256(password.encode('utf-8')).hexdigest().encode('utf-8')
    return bcrypt.checkpw(pre_hashed, password_hash.encode('utf-8'))

def create_token(*, subject: str, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,  # access | refresh
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)

def create_access_token(user_id: int) -> str:
    return create_token(
        subject=str(user_id),
        token_type="access",
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )

def create_refresh_token(user_id: int) -> str:
    return create_token(
        subject=str(user_id),
        token_type="refresh",
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
    )

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
    except JWTError as e:
        raise ValueError("Invalid token") from e