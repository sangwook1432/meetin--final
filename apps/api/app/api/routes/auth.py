from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.deps import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshRequest
from app.services.phone import normalize_phone_kr_to_e164, phone_hmac_hash, phone_last4

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    try:
        e164 = normalize_phone_kr_to_e164(payload.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    phash = phone_hmac_hash(e164)
    if db.query(User).filter(User.phone_hash == phash).first():
        raise HTTPException(status_code=409, detail="Phone already registered")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        phone_hash=phash,
        phone_last4=phone_last4(e164),
        phone_e164=e164,           # 알림 발송용 원문 번호 저장
        phone_verified=False,
        is_admin=(email in settings.admin_email_set()),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    try:
        decoded = decode_token(payload.refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if decoded.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    sub = decoded.get("sub")
    if not sub or not str(sub).isdigit():
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.get(User, int(sub))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )
