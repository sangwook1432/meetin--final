import hashlib
import bcrypt
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError

from app.core.config import settings


def hash_password(password: str) -> str:
    # 1. SHA-256으로 사전 해싱 (Bcrypt 72바이트 길이 제한 원천 차단)
    sha256_pw = hashlib.sha256(password.encode('utf-8')).hexdigest()
    
    # 2. 순수 bcrypt 라이브러리로 해싱 (DB 저장을 위해 문자열로 디코딩)
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(sha256_pw.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    # 1. 입력받은 평문 비밀번호를 동일하게 SHA-256으로 변환
    sha256_pw = hashlib.sha256(password.encode('utf-8')).hexdigest()
    
    # 2. bcrypt.checkpw로 검증 (비교를 위해 둘 다 bytes로 변환)
    return bcrypt.checkpw(
        sha256_pw.encode('utf-8'), 
        password_hash.encode('utf-8')
    )


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