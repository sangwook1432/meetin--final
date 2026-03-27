"""
review.py — 미팅 후기 & 애프터 신청

POST /meetings/{id}/feedback        — 후기 제출 (만족/불만족 + 불편사항)
GET  /meetings/{id}/after-targets   — 상대 이성 프로필 목록
POST /meetings/{id}/after-request   — 애프터 신청
GET  /me/after-requests             — 쪽지함 (수신된 애프터 신청 목록)
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_phone, encrypt_phone
from app.core.deps import get_db, require_verified
from app.models.after_request import AfterRequest
from app.models.meeting import Meeting, MeetingStatus, Team
from app.models.meeting_feedback import MeetingFeedback
from app.models.meeting_schedule import MeetingSchedule
from app.models.meeting_slot import MeetingSlot
from app.models.notification import Notification, NotifType
from app.models.user import User

KST = timezone(timedelta(hours=9))

router = APIRouter()


# ─── helpers ──────────────────────────────────────────────────────

def _get_completed_meeting(db: Session, meeting_id: int) -> Meeting:
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.status == MeetingStatus.COMPLETED:
        return meeting
    # 스케줄러가 아직 실행되지 않은 경우를 대비해,
    # CONFIRMED 미팅이라도 확정 일정 시각이 지났으면 허용
    if meeting.status == MeetingStatus.CONFIRMED:
        schedule = db.execute(
            select(MeetingSchedule).where(
                MeetingSchedule.meeting_id == meeting_id,
                MeetingSchedule.confirmed == True,
            )
        ).scalar_one_or_none()
        if schedule and schedule.date and schedule.time:
            try:
                sdt = datetime.strptime(
                    f"{schedule.date} {schedule.time}", "%Y-%m-%d %H:%M"
                ).replace(tzinfo=KST)
                if sdt < datetime.now(KST):
                    return meeting
            except ValueError:
                pass
    raise HTTPException(status_code=400, detail="Meeting not completed yet")


def _assert_member(db: Session, meeting_id: int, user_id: int) -> MeetingSlot:
    slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == user_id,
        )
    ).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=403, detail="Not a member of this meeting")
    return slot


# ─── 후기 제출 ─────────────────────────────────────────────────────

@router.post("/meetings/{meeting_id}/feedback")
def submit_feedback(
    meeting_id: int,
    satisfied: bool = Query(...),
    complaint: str | None = Query(None, max_length=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified),
):
    _get_completed_meeting(db, meeting_id)
    _assert_member(db, meeting_id, current_user.id)

    existing = db.execute(
        select(MeetingFeedback).where(
            MeetingFeedback.meeting_id == meeting_id,
            MeetingFeedback.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if existing:
        existing.is_satisfied = satisfied
        existing.complaint = complaint if not satisfied else None
    else:
        db.add(MeetingFeedback(
            meeting_id=meeting_id,
            user_id=current_user.id,
            is_satisfied=satisfied,
            complaint=complaint if not satisfied else None,
        ))

    db.commit()
    return {"status": "ok"}


# ─── 상대 이성 프로필 목록 ─────────────────────────────────────────

@router.get("/meetings/{meeting_id}/after-targets")
def get_after_targets(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified),
):
    _get_completed_meeting(db, meeting_id)
    my_slot = _assert_member(db, meeting_id, current_user.id)

    opposite_team = Team.FEMALE if my_slot.team == Team.MALE else Team.MALE

    rows = db.execute(
        select(MeetingSlot, User)
        .join(User, User.id == MeetingSlot.user_id)
        .where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.team == opposite_team,
            MeetingSlot.user_id.isnot(None),
        )
    ).all()

    targets = []
    for slot, user in rows:
        entry_label = None
        if user.entry_year:
            y = user.entry_year % 100 if user.entry_year >= 100 else user.entry_year
            entry_label = f"{y:02d}학번"

        targets.append({
            "user_id": user.id,
            "nickname": user.nickname,
            "university": user.university,
            "major": user.major,
            "entry_label": entry_label,
            "age": user.age,
            "bio_short": user.bio_short,
            "photo_url_1": user.photo_url_1,
        })

    return {"targets": targets}


# ─── 애프터 신청 ───────────────────────────────────────────────────

class AfterRequestBody(BaseModel):
    receiver_id: int
    message: str


@router.post("/meetings/{meeting_id}/after-request")
def submit_after_request(
    meeting_id: int,
    body: AfterRequestBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified),
):
    if len(body.message) > 50:
        raise HTTPException(status_code=400, detail="Message too long (max 50 chars)")

    _get_completed_meeting(db, meeting_id)
    my_slot = _assert_member(db, meeting_id, current_user.id)

    # 수신자가 반대 팀 멤버인지 확인
    opposite_team = Team.FEMALE if my_slot.team == Team.MALE else Team.MALE
    receiver_slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == body.receiver_id,
            MeetingSlot.team == opposite_team,
        )
    ).scalar_one_or_none()
    if not receiver_slot:
        raise HTTPException(status_code=400, detail="Invalid receiver")

    if not current_user.phone_e164:
        raise HTTPException(status_code=400, detail="전화번호를 먼저 등록해주세요.")

    plain_phone = decrypt_phone(current_user.phone_e164)
    if not plain_phone:
        raise HTTPException(status_code=500, detail="전화번호를 불러오는 데 실패했습니다.")

    # 중복 신청 확인
    existing = db.execute(
        select(AfterRequest).where(
            AfterRequest.meeting_id == meeting_id,
            AfterRequest.sender_id == current_user.id,
            AfterRequest.receiver_id == body.receiver_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Already sent after request")

    db.add(AfterRequest(
        meeting_id=meeting_id,
        sender_id=current_user.id,
        receiver_id=body.receiver_id,
        message=body.message,
        sender_phone=encrypt_phone(plain_phone),  # 암호화하여 저장
    ))

    sender_name = current_user.nickname or "누군가"
    db.add(Notification(
        user_id=body.receiver_id,
        notif_type=NotifType.AFTER_REQUEST_RECEIVED,
        message=f"{sender_name}님이 애프터를 신청했어요. 쪽지함에서 확인해보세요!",
        meeting_id=meeting_id,
    ))

    db.commit()
    return {"status": "ok"}


# ─── 쪽지함 — 수신된 애프터 신청 목록 ────────────────────────────

@router.get("/me/after-requests")
def get_my_after_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified),
):
    rows = db.execute(
        select(AfterRequest, User)
        .join(User, User.id == AfterRequest.sender_id)
        .where(AfterRequest.receiver_id == current_user.id)
        .order_by(AfterRequest.created_at.desc())
    ).all()

    result = []
    for req, sender in rows:
        # 복호화 → E.164(+821012345678) → 국내 형식(01012345678)
        raw_e164 = decrypt_phone(req.sender_phone) if req.sender_phone else None
        if raw_e164 and raw_e164.startswith("+82"):
            phone_display = "0" + raw_e164.lstrip("+").removeprefix("82")
        else:
            # 마이그레이션으로 복구 불가했던 레코드 (NULL)
            phone_display = raw_e164 or None

        result.append({
            "id": req.id,
            "meeting_id": req.meeting_id,
            "sender_id": req.sender_id,
            "sender_nickname": sender.nickname,
            "sender_phone": phone_display,
            "message": req.message,
            "created_at": req.created_at.isoformat(),
        })

    return {"items": result}


@router.delete("/me/after-requests/{request_id}")
def delete_after_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified),
):
    """수신된 애프터 신청 삭제."""
    req = db.get(AfterRequest, request_id)
    if not req or req.receiver_id != current_user.id:
        raise HTTPException(404, "애프터 신청을 찾을 수 없습니다.")
    db.delete(req)
    db.commit()
    return {"status": "deleted"}
