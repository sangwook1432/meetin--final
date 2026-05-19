import json
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.deps import get_db, get_current_user, require_verified
from app.models.user import User, VerificationStatus
from app.models.verification_doc import VerificationDoc, DocType, DocStatus
from app.core.crypto import decrypt_phone
from app.core.storage import upload_file, compress_image
from app.schemas.user import UserPublic, ProfileUpdateRequest
from app.schemas.verification import DocUploadRequest, VerificationDocOut

router = APIRouter()

# magic bytes: 확장자 위조 방지
_MAGIC: dict[str, bytes] = {
    "jpg":  b"\xff\xd8\xff",
    "jpeg": b"\xff\xd8\xff",
    "png":  b"\x89PNG\r\n\x1a\n",
    "pdf":  b"%PDF",
}

def _check_magic(content: bytes, ext: str) -> bool:
    magic = _MAGIC.get(ext)
    if magic is None:
        return False
    return content[:len(magic)] == magic


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)):
    raw_e164 = decrypt_phone(user.phone_e164) if user.phone_e164 else None
    # E.164 (+821012345678) → 국내 형식 (01012345678)
    phone_display: str | None = None
    if raw_e164:
        phone_display = raw_e164.lstrip("+").removeprefix("82")
        if not phone_display.startswith("0"):
            phone_display = "0" + phone_display

    data = UserPublic.model_validate(user)
    data.phone = phone_display
    return data


_PROFILE_ALLOWED_FIELDS = {
    "email", "nickname", "gender", "major", "entry_year", "age",
    "preferred_area", "bio_short", "lookalike_type", "lookalike_value",
}
# university는 학교 인증과 직결되므로 임의 변경 금지 — 변경하려면 재인증 플로우 필요

@router.patch("/me/profile", response_model=UserPublic)
def update_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)

    if "email" in data and data["email"] is not None:
        import re
        email = data["email"].strip().lower()
        if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
            raise HTTPException(400, "올바른 이메일 주소를 입력해주세요.")
        conflict = db.query(User).filter(User.email == email, User.id != user.id).first()
        if conflict:
            raise HTTPException(409, "이미 사용 중인 이메일입니다.")
        data["email"] = email

    for k, v in data.items():
        if k not in _PROFILE_ALLOWED_FIELDS:
            raise HTTPException(400, f"수정할 수 없는 필드입니다: {k}")
        setattr(user, k, v)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/photos/upload")
async def upload_photo(
    slot: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """프로필 사진 업로드. slot=1 또는 2."""
    if slot not in (1, 2):
        raise HTTPException(400, "slot은 1 또는 2여야 합니다.")

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("jpg", "jpeg", "png"):
        raise HTTPException(400, "JPG, PNG 파일만 업로드 가능합니다.")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "파일 크기는 5MB를 초과할 수 없습니다.")

    if not _check_magic(content, ext):
        raise HTTPException(400, "파일 내용이 선택한 형식과 일치하지 않습니다.")

    content, ext = compress_image(content, max_px=1000)
    save_name = f"photo_{user.id}_{slot}_{uuid.uuid4().hex[:8]}.{ext}"
    photo_url = upload_file(content, save_name, ext)
    if slot == 1:
        user.photo_url_1 = photo_url
    else:
        user.photo_url_2 = photo_url
    db.add(user)
    db.commit()

    return {"photo_url": photo_url}


@router.post("/me/cover/upload")
async def upload_cover(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_verified),
):
    """배경 커버 사진 업로드."""
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("jpg", "jpeg", "png"):
        raise HTTPException(400, "JPG, PNG 파일만 업로드 가능합니다.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "파일 크기는 10MB를 초과할 수 없습니다.")

    if not _check_magic(content, ext):
        raise HTTPException(400, "파일 내용이 선택한 형식과 일치하지 않습니다.")

    content, ext = compress_image(content, max_px=1200)
    save_name = f"cover_{user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    user.cover_url = upload_file(content, save_name, ext)
    db.add(user)
    db.commit()

    return {"cover_url": user.cover_url}


class QAUpdateRequest(BaseModel):
    answers: dict[str, str]  # {"1": "ENFP", "2": "#...", ...}


@router.patch("/me/qa")
def update_qa(
    body: QAUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_verified),
):
    """10문 10답 답변 저장. answers: {\"1\": \"...\", ..., \"10\": \"...\"}"""
    # 1~10 키만 허용, 답변 최대 100자
    cleaned = {}
    for k, v in body.answers.items():
        if k in {str(i) for i in range(1, 11)} and isinstance(v, str):
            cleaned[k] = v[:100]
    user.qa_answers = json.dumps(cleaned, ensure_ascii=False)
    db.add(user)
    db.commit()
    return {"status": "ok"}


@router.delete("/me", status_code=200)
def delete_account(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    회원 탈퇴.
    - 지갑 잔액이 남아 있으면 거절 (먼저 출금 필요)
    - CONFIRMED 미팅(채팅방 활성화) 멤버이면 거절 (미팅 완료/취소 후 재시도)
    - RECRUITING/FULL/WAITING_CONFIRM 활성 슬롯은 자동 비우기 (매칭권 미소모 상태)
    - 보유 매칭권 EXPIRED 트랜잭션 기록 후 0으로 소멸 (약관 명시)
    - PII 익명화 후 is_banned=True 처리 (소프트 삭제)
    """
    from app.models.meeting import Meeting, MeetingStatus
    from app.models.meeting_slot import MeetingSlot
    from app.models.ticket_transaction import TicketTransaction, TicketTxType

    if user.is_banned:
        raise HTTPException(400, "이미 탈퇴된 계정입니다.")
    if user.balance > 1000:
        raise HTTPException(
            400,
            f"환불 가능한 지갑 잔액({user.balance:,}원)이 남아 있어 탈퇴할 수 없습니다. 잔액을 소진하거나 환불 신청 후 다시 시도해 주세요.",
        )

    # CONFIRMED 미팅 멤버이면 차단 (채팅방 파기 책임 회피 방지)
    confirmed_slot = db.execute(
        select(MeetingSlot)
        .join(Meeting, Meeting.id == MeetingSlot.meeting_id)
        .where(
            MeetingSlot.user_id == user.id,
            Meeting.status == MeetingStatus.CONFIRMED,
        )
        .limit(1)
    ).scalar_one_or_none()
    if confirmed_slot:
        raise HTTPException(
            400,
            "확정된 미팅(채팅방 활성)에 참여 중입니다. 미팅 종료 또는 취소 후 탈퇴해주세요.",
        )

    # RECRUITING / FULL / WAITING_CONFIRM 슬롯은 자동 비우기 (매칭권 미소모 상태)
    leavable_statuses = [
        MeetingStatus.RECRUITING,
        MeetingStatus.FULL,
        MeetingStatus.WAITING_CONFIRM,
    ]
    active_slots = db.execute(
        select(MeetingSlot)
        .join(Meeting, Meeting.id == MeetingSlot.meeting_id)
        .where(
            MeetingSlot.user_id == user.id,
            Meeting.status.in_(leavable_statuses),
        )
        .with_for_update()
    ).scalars().all()

    for my_slot in active_slots:
        meeting = db.execute(
            select(Meeting).where(Meeting.id == my_slot.meeting_id).with_for_update()
        ).scalar_one()
        all_slots = db.execute(
            select(MeetingSlot).where(MeetingSlot.meeting_id == meeting.id).with_for_update()
        ).scalars().all()

        my_slot.user_id = None
        my_slot.confirmed = False

        # WAITING_CONFIRM에서 빠지면 남은 멤버 confirmed 리셋 (전원 재확정 필요)
        if meeting.status == MeetingStatus.WAITING_CONFIRM:
            for s in all_slots:
                if s.user_id is not None:
                    s.confirmed = False

        remaining_ids = [s.user_id for s in all_slots if s.user_id is not None]

        if not remaining_ids:
            db.delete(meeting)
            continue

        # 호스트 재할당 — 같은 팀 우선
        if meeting.host_user_id == user.id:
            same_team = [s.user_id for s in all_slots if s.user_id is not None and s.team == my_slot.team]
            meeting.host_user_id = same_team[0] if same_team else remaining_ids[0]

        # 상태 재계산
        filled = len(remaining_ids)
        capacity = len(all_slots)
        if filled < capacity:
            meeting.status = MeetingStatus.RECRUITING
        elif meeting.status != MeetingStatus.CONFIRMED:
            meeting.status = MeetingStatus.WAITING_CONFIRM

    # 매칭권 소멸 (이력 기록)
    if user.matching_tickets > 0:
        expired_amount = user.matching_tickets
        db.add(TicketTransaction(
            user_id=user.id,
            tx_type=TicketTxType.EXPIRED,
            amount=-expired_amount,
            tickets_after=0,
            note="회원 탈퇴로 매칭권 소멸",
        ))
        user.matching_tickets = 0

    # PII 익명화
    user.username = None
    user.email = None
    user.phone_e164 = None
    user.nickname = f"탈퇴한 사용자"
    user.real_name = None
    user.photo_url_1 = None
    user.photo_url_2 = None
    user.bio_short = None
    user.bank_name = None
    user.account_number = None
    user.account_holder = None
    # 재로그인 불가 처리
    user.is_banned = True

    db.add(user)
    db.commit()
    return {"status": "deleted"}


@router.post("/me/docs", response_model=VerificationDocOut)
def upload_doc(
    payload: DocUploadRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """레거시: URL 방식 (하위 호환)"""
    doc = VerificationDoc(
        user_id=user.id,
        doc_type=payload.doc_type,
        file_url=payload.file_url,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.post("/me/docs/upload", response_model=VerificationDocOut)
async def upload_doc_file(
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    JPG/PNG 파일 업로드 방식으로 재학증명서 제출.
    실제 배포 시 S3/R2 등 외부 스토리지로 변경 권장.
    MVP: /tmp/uploads 에 저장 후 상대 경로를 file_url 로 기록.
    """
    # doc_type 검증
    try:
        doc_type_enum = DocType(doc_type)
    except ValueError:
        raise HTTPException(400, f"doc_type은 {[e.value for e in DocType]} 중 하나여야 합니다.")

    # 파일 형식 검증
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("jpg", "jpeg", "png", "pdf"):
        raise HTTPException(400, "JPG, PNG, PDF 파일만 업로드 가능합니다.")

    # 파일 저장
    save_name = f"{user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB 제한
        raise HTTPException(400, "파일 크기는 10MB를 초과할 수 없습니다.")

    if not _check_magic(content, ext):
        raise HTTPException(400, "파일 내용이 선택한 형식과 일치하지 않습니다.")

    file_url = upload_file(content, save_name, ext)

    # SUBMITTED(미검토) 상태의 기존 doc이 있으면 file_url만 교체
    existing_doc = db.execute(
        select(VerificationDoc)
        .where(
            VerificationDoc.user_id == user.id,
            VerificationDoc.status == DocStatus.SUBMITTED,
        )
        .order_by(VerificationDoc.id.desc())
    ).scalars().first()

    if existing_doc:
        existing_doc.file_url = file_url
        doc = existing_doc
    else:
        # 새 doc은 항상 INSERT (REJECTED 이력은 보존)
        doc = VerificationDoc(
            user_id=user.id,
            doc_type=doc_type_enum,
            file_url=file_url,
        )
        db.add(doc)

    # 반려된 유저가 재제출하면 다시 심사 대기 상태로 복귀 → admin 목록에 재노출
    if user.verification_status == VerificationStatus.REJECTED:
        user.verification_status = VerificationStatus.PENDING

    db.commit()
    db.refresh(doc)
    return doc
