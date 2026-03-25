from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.core.deps import get_db, require_admin
from app.models.user import User, VerificationStatus
from app.models.verification_doc import VerificationDoc, DocStatus
from app.models.meeting_feedback import MeetingFeedback
from app.schemas.verification import (
    AdminVerificationAction,
    AdminUserVerificationOut,
    VerificationDocOut,
)

router = APIRouter()


# ─────────────────────────────────────────────────────────────────
# 대기 중인 유저 목록 (페이지네이션)
# ─────────────────────────────────────────────────────────────────

@router.get("/verifications", response_model=list[AdminUserVerificationOut])
def list_verifications(
    status: VerificationStatus = VerificationStatus.PENDING,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    특정 verification_status 유저 목록.
    기본값 = PENDING (신규 심사 대기)
    """
    q = (
        db.query(
            User.id.label("user_id"),
            User.username,
            User.nickname,
            User.university,
            User.major,
            User.entry_year,
            User.age,
            User.verification_status,
            func.count(VerificationDoc.id).label("doc_count"),
        )
        .outerjoin(VerificationDoc, VerificationDoc.user_id == User.id)
        .filter(User.verification_status == status)
        .group_by(User.id)
        .order_by(User.id.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = q.all()
    return [
        AdminUserVerificationOut(
            user_id=r.user_id,
            username=r.username,
            nickname=getattr(r, "nickname", None),
            university=r.university,
            major=r.major,
            entry_year=r.entry_year,
            age=r.age,
            verification_status=r.verification_status,
            doc_count=int(r.doc_count or 0),
        )
        for r in rows
    ]


# ─────────────────────────────────────────────────────────────────
# 특정 유저의 제출 서류 목록
# ─────────────────────────────────────────────────────────────────

@router.get("/verifications/{user_id}/docs", response_model=list[VerificationDocOut])
def get_user_docs(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """유저가 제출한 서류 목록 + file_url 포함"""
    docs = db.execute(
        select(VerificationDoc)
        .where(VerificationDoc.user_id == user_id)
        .order_by(VerificationDoc.id.desc())
    ).scalars().all()
    return docs


# ─────────────────────────────────────────────────────────────────
# 승인
# ─────────────────────────────────────────────────────────────────

@router.post("/verifications/{user_id}/approve")
def approve(
    user_id: int,
    payload: AdminVerificationAction,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    유저 재학 인증 승인.
    - verification_status = VERIFIED
    - 해당 유저 모든 서류 = REVIEWED
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.verification_status == VerificationStatus.VERIFIED:
        return {"ok": True, "already_verified": True}

    user.verification_status = VerificationStatus.VERIFIED

    db.query(VerificationDoc).filter(VerificationDoc.user_id == user_id).update(
        {"status": DocStatus.REVIEWED, "note": payload.note or "승인"}
    )

    db.add(user)
    db.commit()
    return {"ok": True, "user_id": user_id, "admin_id": admin.id}


# ─────────────────────────────────────────────────────────────────
# 반려
# ─────────────────────────────────────────────────────────────────

@router.post("/verifications/{user_id}/reject")
def reject(
    user_id: int,
    payload: AdminVerificationAction,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    유저 재학 인증 반려.
    - verification_status = REJECTED
    - 반려 사유(note) 저장
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.verification_status = VerificationStatus.REJECTED

    db.query(VerificationDoc).filter(VerificationDoc.user_id == user_id).update(
        {"status": DocStatus.REVIEWED, "note": payload.note or "반려"}
    )

    db.add(user)
    db.commit()
    return {"ok": True, "user_id": user_id, "admin_id": admin.id}


# ─────────────────────────────────────────────────────────────────
# 관리자 대시보드 요약
# ─────────────────────────────────────────────────────────────────

@router.get("/feedbacks")
def list_feedbacks(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """불만족 피드백 목록 (관리자 전용)"""
    feedbacks = db.execute(
        select(MeetingFeedback)
        .where(MeetingFeedback.is_satisfied == False)
        .order_by(MeetingFeedback.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).scalars().all()
    return [
        {
            "id": f.id,
            "meeting_id": f.meeting_id,
            "user_id": f.user_id,
            "complaint": f.complaint,
            "created_at": f.created_at.isoformat(),
        }
        for f in feedbacks
    ]


@router.get("/verifications/stats")
def verification_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """심사 현황 요약 (대시보드용)"""
    counts = db.query(
        User.verification_status,
        func.count(User.id).label("count"),
    ).group_by(User.verification_status).all()

    return {
        "stats": {row.verification_status.value: row.count for row in counts}
    }
