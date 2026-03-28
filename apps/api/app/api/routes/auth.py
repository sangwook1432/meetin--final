import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.deps import get_db
from app.models.user import User
from app.models.preregistration import Preregistration
from app.models.ticket_transaction import TicketTransaction, TicketTxType
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    PhoneSendRequest,
    PhoneVerifyRequest,
    PhoneVerifyResponse,
    PhoneTokenInfoResponse,
)
from app.services.phone import normalize_phone_kr_to_e164, phone_hmac_hash, phone_last4
from app.core.crypto import encrypt_phone
import app.services.pass_auth as pass_auth

router = APIRouter()

_REFRESH_COOKIE = "refresh_token"
_REFRESH_MAX_AGE = 14 * 24 * 60 * 60  # 14일 (초)


def _set_refresh_cookie(response: Response, token: str) -> None:
    """Refresh Token을 HttpOnly 쿠키로 설정."""
    from app.core.config import settings
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=(settings.env != "local"),
        samesite="lax",
        max_age=_REFRESH_MAX_AGE,
        path="/auth",
    )


# ─── Rate Limiter ─────────────────────────────────────────────────
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    def _rate_limit(limit: str):
        return _limiter.limit(limit)
except ImportError:
    import functools
    def _rate_limit(limit: str):  # type: ignore[misc]
        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                return func(*args, **kwargs)
            return wrapper
        return decorator


# ─── 인라인 스키마 ────────────────────────────────────────────────

class FindEmailRequest(BaseModel):
    phone_token: str


class ResetPasswordRequest(BaseModel):
    phone_token: str
    new_password: str


# ─── 휴대폰 인증 ─────────────────────────────────────────────────

@router.post("/phone/send")
@_rate_limit("3/minute")
async def phone_send(request: Request, payload: PhoneSendRequest):
    """OTP 발송. PASS_API_KEY 미설정 시 서버 로그에 OTP 출력 (mock 모드)."""
    try:
        e164 = normalize_phone_kr_to_e164(payload.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = await pass_auth.send_otp(e164)
    if result is None:
        raise HTTPException(status_code=429, detail="인증번호 발송 횟수를 초과했습니다. 1시간 후 다시 시도해주세요.")
    if not result:
        raise HTTPException(status_code=500, detail="SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요.")
    return {"message": "인증번호가 발송되었습니다."}


@router.post("/phone/verify", response_model=PhoneVerifyResponse)
@_rate_limit("5/minute")
async def phone_verify(request: Request, payload: PhoneVerifyRequest):
    """OTP 검증 후 phone_token 발급 (10분 유효, 1회용).

    mock_name / mock_birth_date / mock_gender 전달 시 토큰에 함께 저장 (KG이니시스 연동 전 테스트용).
    """
    try:
        e164 = normalize_phone_kr_to_e164(payload.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    extra: dict | None = None
    if any([payload.mock_name, payload.mock_birth_date, payload.mock_gender]):
        extra = {
            "name": payload.mock_name,
            "birth_date": payload.mock_birth_date,
            "gender": payload.mock_gender,
        }

    token = await pass_auth.verify_otp(e164, payload.code, extra=extra)
    if not token:
        raise HTTPException(status_code=400, detail="인증번호가 올바르지 않거나 만료되었습니다.")
    return PhoneVerifyResponse(phone_token=token)


@router.get("/phone/token-info", response_model=PhoneTokenInfoResponse)
async def phone_token_info(token: str = Query(...)):
    """phone_token에서 인증된 사용자 정보 조회 (폼 자동완성용, 토큰 소비 안 함)."""
    data = await pass_auth.peek_phone_token_full(token)
    if not data:
        raise HTTPException(status_code=400, detail="유효하지 않은 토큰입니다.")

    age: int | None = None
    birth_date = data.get("birth_date")
    if birth_date and len(birth_date) == 8:
        try:
            birth_year = int(birth_date[:4])
            age = datetime.now().year - birth_year + 1  # 한국식 나이
        except ValueError:
            pass

    return PhoneTokenInfoResponse(
        phone=data.get("phone"),
        name=data.get("name"),
        birth_date=birth_date,
        gender=data.get("gender"),
        age=age,
    )


# ─── 회원가입 / 로그인 ────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
@_rate_limit("10/minute")
async def register(request: Request, response: Response, payload: RegisterRequest, db: Session = Depends(get_db)):
    username = payload.username  # field_validator에서 이미 lower() 처리됨

    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.")

    # 토큰 소비 전에 먼저 유효성 확인 (중복 검사 실패 시 토큰 보존)
    e164 = await pass_auth.peek_phone_token(payload.phone_token)
    if not e164:
        raise HTTPException(status_code=400, detail="휴대폰 인증이 필요합니다. 다시 인증해주세요.")

    phash = phone_hmac_hash(e164)
    if db.query(User).filter(User.phone_hash == phash).first():
        raise HTTPException(status_code=409, detail="이미 가입된 전화번호입니다.")

    # phone_token에 저장된 본인인증 데이터 추출 (소비 전에 먼저 조회)
    token_data = await pass_auth.peek_phone_token_full(payload.phone_token) or {}
    verified_name = token_data.get("name")
    verified_birth = token_data.get("birth_date")
    verified_age: int | None = None
    if verified_birth and len(verified_birth) == 8:
        try:
            verified_age = datetime.now().year - int(verified_birth[:4]) + 1
        except ValueError:
            pass
    from app.models.user import Gender as GenderEnum
    _g = token_data.get("gender")
    verified_gender = GenderEnum.MALE if _g == "M" else GenderEnum.FEMALE if _g == "F" else None

    # 모든 검증 통과 후 토큰 소비
    await pass_auth.consume_phone_token(payload.phone_token)

    # 사전예약 여부 확인 (가입 전에 미리 조회)
    prereg = db.query(Preregistration).filter(
        Preregistration.phone_hash == phash,
        Preregistration.granted == False,  # noqa: E712
    ).first()

    user = User(
        username=username,
        password_hash=hash_password(payload.password),
        phone_hash=phash,
        phone_last4=phone_last4(e164),
        phone_e164=encrypt_phone(e164),
        phone_verified=True,
        is_admin=False,  # 관리자는 DB에서 직접 지정
        real_name=verified_name,
        age=verified_age,
        gender=verified_gender,
    )
    db.add(user)
    db.flush()  # user.id 확보

    # 사전예약자이면 웰컴 매칭권 지급
    if prereg:
        from app.api.routes.preregister import WELCOME_TICKETS
        tickets = WELCOME_TICKETS[prereg.gender]
        user.matching_tickets += tickets
        db.add(TicketTransaction(
            user_id=user.id,
            tx_type=TicketTxType.WELCOME_BONUS,
            amount=tickets,
            tickets_after=user.matching_tickets,
            note=f"사전예약 웰컴 보너스 ({prereg.gender.value})",
        ))
        prereg.granted = True

    db.commit()
    db.refresh(user)

    access_token = create_access_token(user.id)
    _set_refresh_cookie(response, create_refresh_token(user.id))
    return TokenResponse(access_token=access_token)


@router.post("/login", response_model=TokenResponse)
@_rate_limit("10/minute")
def login(request: Request, response: Response, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username.lower().strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    _set_refresh_cookie(response, create_refresh_token(user.id))
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    rt = request.cookies.get(_REFRESH_COOKIE)
    if not rt:
        raise HTTPException(status_code=401, detail="No refresh token")

    try:
        decoded = decode_token(rt)
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

    _set_refresh_cookie(response, create_refresh_token(user.id))
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=_REFRESH_COOKIE, path="/auth")
    return {"status": "ok"}


# ─── 비밀번호 찾기 ────────────────────────────────────────────────

@router.post("/find-username")
@_rate_limit("5/minute")
async def find_username(request: Request, payload: FindEmailRequest, db: Session = Depends(get_db)):
    """휴대폰 인증 후 가입 아이디 찾기."""
    e164 = await pass_auth.consume_phone_token(payload.phone_token)
    if not e164:
        raise HTTPException(status_code=400, detail="휴대폰 인증이 필요합니다.")

    phash = phone_hmac_hash(e164)
    user = db.query(User).filter(User.phone_hash == phash).first()

    # 계정 미존재 시에도 200 — 전화번호 등록 여부 열거 방지
    if not user or not user.username:
        return {"masked_username": None}

    uname = user.username
    visible = uname[:2] if len(uname) >= 2 else uname
    masked_username = f"{visible}{'*' * max(3, len(uname) - 2)}"
    return {"masked_username": masked_username}


@router.post("/reset-password")
@_rate_limit("5/minute")
async def reset_password(request: Request, payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """휴대폰 인증 후 비밀번호 재설정."""
    e164 = await pass_auth.consume_phone_token(payload.phone_token)
    if not e164:
        raise HTTPException(status_code=400, detail="휴대폰 인증이 필요합니다.")

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="비밀번호는 8자 이상이어야 합니다.")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]", payload.new_password):
        raise HTTPException(status_code=400, detail="비밀번호에 특수문자를 1자 이상 포함해야 합니다.")

    phash = phone_hmac_hash(e164)
    user = db.query(User).filter(User.phone_hash == phash).first()

    # 계정 미존재 시에도 200 — 전화번호 등록 여부 열거 방지
    if not user:
        return {"status": "ok"}

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"status": "ok"}
