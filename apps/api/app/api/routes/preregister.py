"""
preregister.py — 사전예약

- POST /preregister/send-otp  : SMS OTP 발송 (공개)
- POST /preregister           : OTP 검증 + 사전예약 등록 (공개)
- GET  /preregister/stats     : 사전예약 현황 (공개)
- GET  /admin/preregistrations: 사전예약 현황 조회 (관리자)
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.core.deps import get_db, require_admin
from app.core.crypto import encrypt_phone, decrypt_phone
from app.models.preregistration import Preregistration
from app.models.user import Gender
from app.services.phone import normalize_phone_domestic, normalize_phone_kr_to_e164, phone_hmac_hash
from app.services.sms_otp import SendOtpResult, send_otp, verify_otp

router = APIRouter()

WELCOME_TICKETS = {
    Gender.FEMALE: 2,
    Gender.MALE: 1,
}

GENDER_QUOTA = {
    Gender.FEMALE: 150,
    Gender.MALE: 150,
}


class SendOtpIn(BaseModel):
    phone: str  # 사용자 입력 (하이픈 포함 가능)


class PreregisterIn(BaseModel):
    phone: str   # 사용자 입력 (하이픈 포함 가능)
    otp: str     # 6자리 인증번호
    gender: Gender


# ── OTP 발송 ─────────────────────────────────────────────────────────

@router.post("/preregister/send-otp")
async def preregister_send_otp(payload: SendOtpIn):
    """사전예약용 SMS OTP 발송.

    - 60초 재요청 제한
    - SOLAPI 미설정 시 mock 모드 (OTP=000000, 발송 없음)
    """
    try:
        phone = normalize_phone_domestic(payload.phone)
    except ValueError as e:
        raise HTTPException(400, str(e))

    result = await send_otp(phone)

    if result == SendOtpResult.COOLDOWN:
        raise HTTPException(429, "잠시 후 다시 요청해주세요. (60초 후 재발송 가능)")
    if result == SendOtpResult.SEND_FAILED:
        raise HTTPException(500, "SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요.")

    return {"status": "sent"}


# ── 사전예약 등록 ────────────────────────────────────────────────────

@router.post("/preregister")
async def preregister(payload: PreregisterIn, db: Session = Depends(get_db)):
    """OTP 검증 후 사전예약 등록. 중복 등록 불가."""
    try:
        phone = normalize_phone_domestic(payload.phone)
    except ValueError as e:
        raise HTTPException(400, str(e))

    success, exceeded = await verify_otp(phone, payload.otp.strip())

    if exceeded:
        raise HTTPException(429, "인증 시도 횟수를 초과했습니다. 인증번호를 다시 받아주세요.")
    if not success:
        raise HTTPException(400, "인증번호가 올바르지 않거나 만료되었습니다.")

    # E.164로 변환 후 해시 (회원가입 매칭 기준과 동일 포맷)
    e164 = normalize_phone_kr_to_e164(phone)
    phash = phone_hmac_hash(e164)

    existing = db.execute(
        select(Preregistration).where(Preregistration.phone_hash == phash)
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(409, "이미 사전예약된 번호입니다.")

    # 정원 확인
    current_count = db.execute(
        select(func.count()).select_from(Preregistration).where(
            Preregistration.gender == payload.gender
        )
    ).scalar_one()
    if current_count >= GENDER_QUOTA[payload.gender]:
        gender_label = "여자" if payload.gender == Gender.FEMALE else "남자"
        raise HTTPException(409, f"{gender_label} 사전예약 정원이 마감되었습니다.")

    db.add(Preregistration(
        phone_hash=phash,
        phone_encrypted=encrypt_phone(e164),
        gender=payload.gender,
    ))
    db.commit()

    tickets = WELCOME_TICKETS[payload.gender]
    return {
        "status": "registered",
        "welcome_tickets": tickets,
        "message": f"사전예약 완료! 앱 출시 시 매칭권 {tickets}개가 지급됩니다.",
    }


# ── 통계 / 관리자 ────────────────────────────────────────────────────

@router.get("/preregister/stats")
def preregister_stats(db: Session = Depends(get_db)):
    """사전예약 현황 공개 조회 (정원 대비 현재 인원)."""
    male_count = db.execute(
        select(func.count()).select_from(Preregistration).where(
            Preregistration.gender == Gender.MALE
        )
    ).scalar_one()
    female_count = db.execute(
        select(func.count()).select_from(Preregistration).where(
            Preregistration.gender == Gender.FEMALE
        )
    ).scalar_one()
    return {
        "male": male_count,
        "female": female_count,
        "male_max": GENDER_QUOTA[Gender.MALE],
        "female_max": GENDER_QUOTA[Gender.FEMALE],
    }


@router.get("/admin/preregistrations")
def list_preregistrations(
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """사전예약 현황 (관리자)."""
    rows = db.execute(select(Preregistration).order_by(Preregistration.created_at.desc())).scalars().all()

    male_total   = sum(1 for r in rows if r.gender == Gender.MALE)
    female_total = sum(1 for r in rows if r.gender == Gender.FEMALE)
    granted      = sum(1 for r in rows if r.granted)

    entries = [
        {
            "id": r.id,
            "phone": decrypt_phone(r.phone_encrypted) if r.phone_encrypted else None,
            "gender": r.gender.value,
            "granted": r.granted,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]

    return {
        "total": len(rows),
        "male": male_total,
        "female": female_total,
        "granted": granted,
        "pending": len(rows) - granted,
        "entries": entries,
    }
