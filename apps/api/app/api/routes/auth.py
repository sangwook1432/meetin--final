from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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
from app.core.crypto import encrypt_phone

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────

class FindEmailRequest(BaseModel):
    phone: str


class ResetPasswordRequest(BaseModel):
    phone: str
    new_password: str


# ─── Routes ──────────────────────────────────────────────────────

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
        phone_e164=encrypt_phone(e164),  # 알림 발송용 — 암호화 저장
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


@router.post("/find-email")
def find_email(payload: FindEmailRequest, db: Session = Depends(get_db)):
    """전화번호로 가입 이메일(아이디) 찾기 — MVP: 번호 일치 확인만"""
    try:
        e164 = normalize_phone_kr_to_e164(payload.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    phash = phone_hmac_hash(e164)
    user = db.query(User).filter(User.phone_hash == phash).first()
    if not user:
        raise HTTPException(status_code=404, detail="해당 전화번호로 가입된 계정을 찾을 수 없습니다.")

    # 이메일 마스킹: 앞 2자리만 공개  ex) ab***@univ.ac.kr
    local, domain = user.email.split("@", 1)
    visible = local[:2] if len(local) >= 2 else local
    masked_email = f"{visible}{'*' * max(3, len(local) - 2)}@{domain}"

    return {"masked_email": masked_email}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """전화번호 확인 후 비밀번호 재설정 — MVP: 번호 일치 확인만"""
    try:
        e164 = normalize_phone_kr_to_e164(payload.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    phash = phone_hmac_hash(e164)
    user = db.query(User).filter(User.phone_hash == phash).first()
    if not user:
        raise HTTPException(status_code=404, detail="해당 전화번호로 가입된 계정을 찾을 수 없습니다.")

    import re
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="비밀번호는 8자 이상이어야 합니다.")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]", payload.new_password):
        raise HTTPException(status_code=400, detail="비밀번호에 특수문자를 1자 이상 포함해야 합니다.")

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"status": "ok"}
