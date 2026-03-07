from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from app.core.deps import get_db, require_verified
from app.models.meeting import Meeting, MeetingStatus
from app.models.meeting_slot import MeetingSlot
from app.models.user import User, VerificationStatus
from app.models.replacement_request import ReplacementRequest, ReplacementStatus

router = APIRouter()


class ReplacementRequestIn(BaseModel):
    candidate_user_id: int


class ReplacementRespondIn(BaseModel):
    request_id: int
    accept: bool


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_member(db: Session, meeting_id: int, user_id: int) -> None:
    exists = db.execute(
        select(MeetingSlot.id).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == user_id,
        )
    ).first()
    if not exists:
        raise HTTPException(status_code=403, detail="You are not a member of this meeting.")


@router.post("/meetings/{meeting_id}/replacement/request")
def request_replacement(
    meeting_id: int,
    payload: ReplacementRequestIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    CONFIRMED 이후에만 대타 요청 가능.
    leaver(요청자) 기준 meeting당 최대 2회.
    """
    try:
        # lock meeting
        meeting = db.execute(
            select(Meeting).where(Meeting.id == meeting_id).with_for_update()
        ).scalar_one_or_none()
        if not meeting:
            raise HTTPException(404, "Meeting not found")
        if meeting.status != MeetingStatus.CONFIRMED:
            raise HTTPException(409, "Replacement is allowed only after CONFIRMED.")

        # lock slots
        slots = db.execute(
            select(MeetingSlot).where(MeetingSlot.meeting_id == meeting_id).with_for_update()
        ).scalars().all()

        _ensure_member(db, meeting_id, user.id)

        # attempt limit
        attempts = db.execute(
            select(func.count(ReplacementRequest.id)).where(
                ReplacementRequest.meeting_id == meeting_id,
                ReplacementRequest.leaver_user_id == user.id,
            )
        ).scalar_one()
        if attempts >= 2:
            raise HTTPException(409, "Replacement attempts limit reached (max 2).")

        candidate = db.get(User, payload.candidate_user_id)
        if not candidate:
            raise HTTPException(404, "Candidate not found")
        if candidate.verification_status != VerificationStatus.VERIFIED:
            raise HTTPException(409, "Candidate is not VERIFIED")
        if candidate.id == user.id:
            raise HTTPException(400, "You cannot request yourself")
        if any(s.user_id == candidate.id for s in slots):
            raise HTTPException(409, "Candidate is already a meeting member")

        req = ReplacementRequest(
            meeting_id=meeting_id,
            leaver_user_id=user.id,
            candidate_user_id=candidate.id,
            attempt_no=int(attempts) + 1,
            status=ReplacementStatus.PENDING,
            created_at=_now(),
            expires_at=_now() + timedelta(minutes=30),
        )
        db.add(req)
        db.commit()

        return {
            "request_id": req.id,
            "status": req.status.value,
            "attempt_no": req.attempt_no,
            "expires_at": req.expires_at,
        }

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Race detected; try again.")
    except Exception:
        db.rollback()
        raise


@router.post("/meetings/{meeting_id}/replacement/respond")
def respond_replacement(
    meeting_id: int,
    payload: ReplacementRespondIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    candidate가 수락하면 meeting_slots에서 leaver -> candidate로 교체.
    """
    try:
        meeting = db.execute(
            select(Meeting).where(Meeting.id == meeting_id).with_for_update()
        ).scalar_one_or_none()
        if not meeting:
            raise HTTPException(404, "Meeting not found")
        if meeting.status != MeetingStatus.CONFIRMED:
            raise HTTPException(409, "Replacement is allowed only after CONFIRMED.")

        req = db.execute(
            select(ReplacementRequest)
            .where(
                ReplacementRequest.id == payload.request_id,
                ReplacementRequest.meeting_id == meeting_id,
            )
            .with_for_update()
        ).scalar_one_or_none()
        if not req:
            raise HTTPException(404, "Replacement request not found")

        if req.candidate_user_id != user.id:
            raise HTTPException(403, "Not your replacement request")

        if req.status != ReplacementStatus.PENDING:
            return {"status": "already_handled"}

        if _now() > req.expires_at:
            req.status = ReplacementStatus.EXPIRED
            db.add(req)
            db.commit()
            return {"status": "expired"}

        if not payload.accept:
            req.status = ReplacementStatus.REJECTED
            db.add(req)
            db.commit()
            return {"status": "rejected"}

        slots = db.execute(
            select(MeetingSlot).where(MeetingSlot.meeting_id == meeting_id).with_for_update()
        ).scalars().all()

        # candidate already member?
        if any(s.user_id == user.id for s in slots):
            req.status = ReplacementStatus.CANCELED
            db.add(req)
            db.commit()
            return {"status": "candidate_already_member"}

        leaver_slot = next((s for s in slots if s.user_id == req.leaver_user_id), None)
        if not leaver_slot:
            req.status = ReplacementStatus.CANCELED
            db.add(req)
            db.commit()
            return {"status": "leaver_not_member_anymore"}

        # replace: 새 멤버(candidate)로 교체
        # ✅ confirmed 반드시 False로 리셋 — 이전 leaver의 confirmed=True를 물려받으면 안 됨
        # 이 사람이 아직 참가 의사를 표현하지 않았기 때문
        leaver_slot.user_id = user.id
        leaver_slot.confirmed = False
        req.status = ReplacementStatus.ACCEPTED
        db.add(req)

        db.commit()
        return {"status": "accepted"}

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Race detected; try again.")
    except Exception:
        db.rollback()
        raise