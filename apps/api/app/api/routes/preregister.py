"""
preregister.py — 사전예약

- POST /preregister        : 전화번호 + 성별 사전 등록 (공개)
- GET  /admin/preregistrations : 사전예약 현황 조회 (관리자)
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.core.deps import get_db, require_admin
from app.core.crypto import encrypt_phone, decrypt_phone
from app.models.preregistration import Preregistration
from app.models.user import Gender
from app.services.phone import phone_hmac_hash
import app.services.pass_auth as pass_auth

router = APIRouter()

WELCOME_TICKETS = {
    Gender.FEMALE: 3,
    Gender.MALE: 1,
}

GENDER_QUOTA = {
    Gender.FEMALE: 150,
    Gender.MALE: 150,
}


class PreregisterIn(BaseModel):
    phone_token: str
    gender: Gender


@router.post("/preregister")
async def preregister(payload: PreregisterIn, db: Session = Depends(get_db)):
    """사전예약 등록. 휴대폰 인증 완료 후 발급된 phone_token 필요. 중복 등록 불가."""
    e164 = await pass_auth.peek_phone_token(payload.phone_token)
    if not e164:
        raise HTTPException(400, "휴대폰 인증이 필요합니다. 다시 인증해주세요.")

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

    # 모든 검증 통과 후 토큰 소비
    await pass_auth.consume_phone_token(payload.phone_token)

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
