"""
admin_reports.py — 신고 관리 (관리자 전용)

- GET  /admin/reports              : 신고 목록 조회
- POST /admin/reports/{id}/confirm : 신고 확정 (피신고자 forfeit + 전원 환급)
- POST /admin/reports/{id}/reject  : 신고 기각
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.deps import get_db, require_admin
from app.models.chat_report import ChatReport, ReportStatus
from app.models.chat_room import ChatRoom
from app.models.meeting import Meeting
from app.models.notification import Notification, NotifType
from app.models.user import User

router = APIRouter()


def _apply_penalty(db: Session, user: User, report: ChatReport) -> None:
    """
    신고 확정 시 경고 누적 및 제재 적용.
      1회: 경고 알림
      2회: 7일 정지
      3회+: 영구 정지
    피신고자에게 알림 발송.
    """
    reason_label = REASON_LABEL.get(report.reason.value, report.reason.value)
    user.warning_count = (user.warning_count or 0) + 1
    count = user.warning_count

    if count == 1:
        penalty_msg = (
            f"'{reason_label}' 관련 신고가 확정되어 경고가 누적되었습니다. "
            f"(누적 경고 {count}회) 재발 시 서비스 이용이 제한됩니다."
        )
    elif count == 2:
        user.suspended_until = _now() + timedelta(days=7)
        until_str = user.suspended_until.strftime("%Y년 %m월 %d일 %H:%M")
        penalty_msg = (
            f"'{reason_label}' 관련 신고가 확정되어 7일간 서비스 이용이 정지됩니다. "
            f"({until_str}까지 이용 제한)"
        )
    else:
        user.is_banned = True
        penalty_msg = (
            f"'{reason_label}' 관련 신고가 확정되어 서비스 이용이 영구 정지됩니다. "
            f"(누적 경고 {count}회)"
        )

    db.add(Notification(
        user_id=user.id,
        notif_type=NotifType.ACCOUNT_PENALTY,
        message=penalty_msg,
        meeting_id=report.meeting_id,
    ))

REASON_LABEL = {
    "SEXUAL_CONTENT": "성적 발언",
    "HARASSMENT":     "욕설/비하",
    "SPAM":           "도배",
    "OTHER":          "기타",
}


class AdminNoteIn(BaseModel):
    note: str = ""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _report_out(r: ChatReport, reporter: User | None, reported: User | None) -> dict:
    return {
        "id": r.id,
        "room_id": r.room_id,
        "meeting_id": r.meeting_id,
        "reporter_user_id": r.reporter_user_id,
        "reporter_nickname": reporter.nickname if reporter else None,
        "reported_user_id": r.reported_user_id,
        "reported_nickname": reported.nickname if reported else None,
        "reported_warning_count": reported.warning_count if reported else 0,
        "reported_is_banned": reported.is_banned if reported else False,
        "reported_suspended_until": reported.suspended_until.isoformat() if (reported and reported.suspended_until) else None,
        "evidence_message_id": r.evidence_message_id,
        "evidence_content": r.evidence_content,
        "reason": r.reason.value,
        "reason_label": REASON_LABEL.get(r.reason.value, r.reason.value),
        "detail": r.detail,
        "status": r.status.value,
        "admin_note": r.admin_note,
        "created_at": r.created_at.isoformat(),
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
    }


@router.get("/reports")
def list_reports(
    status: str = Query("PENDING"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """신고 목록 조회 (관리자)."""
    try:
        status_enum = ReportStatus(status)
    except ValueError:
        raise HTTPException(400, f"올바르지 않은 status: {status}")

    reports = db.execute(
        select(ChatReport)
        .where(ChatReport.status == status_enum)
        .order_by(ChatReport.created_at.desc())
        .limit(limit)
    ).scalars().all()

    result = []
    for r in reports:
        reporter = db.get(User, r.reporter_user_id) if r.reporter_user_id else None
        reported = db.get(User, r.reported_user_id) if r.reported_user_id else None
        result.append(_report_out(r, reporter, reported))

    return {"reports": result}


@router.post("/reports/{report_id}/confirm")
async def confirm_report(
    report_id: int,
    payload: AdminNoteIn,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """신고 확정: 피신고자 forfeit + 나머지 환급 + 미팅 취소."""
    from app.api.routes.chats import _execute_forfeit_cancel
    from app.api.routes.wallet import forfeit_ticket

    report = db.get(ChatReport, report_id)
    if not report:
        raise HTTPException(404, "신고를 찾을 수 없습니다.")
    if report.status != ReportStatus.PENDING:
        raise HTTPException(400, "이미 처리된 신고입니다.")

    reported_user = db.get(User, report.reported_user_id) if report.reported_user_id else None
    if not reported_user:
        raise HTTPException(400, "피신고자 정보를 찾을 수 없습니다. (탈퇴한 유저)")

    room = db.get(ChatRoom, report.room_id) if report.room_id else None

    if room:
        meeting = db.get(Meeting, room.meeting_id)
        if meeting:
            reason_label = REASON_LABEL.get(report.reason.value, report.reason.value)
            meeting_title = meeting.title or "미팅"
            system_msg = (
                f"[SYSTEM] '{reason_label}' 관련 신고가 접수되어 "
                f"'{meeting_title}' 미팅이 취소되었습니다."
            )
            await _execute_forfeit_cancel(
                db, room.id, meeting, reported_user,
                system_msg,
            )
    else:
        # 채팅방이 이미 사라진 경우 — forfeit 트랜잭션 기록만
        if report.meeting_id:
            forfeit_ticket(db, reported_user, report.meeting_id)
            db.commit()

    report.status = ReportStatus.CONFIRMED
    report.admin_note = payload.note
    report.resolved_at = _now()

    # ─── 제재 적용 ────────────────────────────────────────────────
    _apply_penalty(db, reported_user, report)

    db.commit()

    return {"ok": True}


@router.post("/reports/{report_id}/reject")
def reject_report(
    report_id: int,
    payload: AdminNoteIn,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """신고 기각: 상태 변경만, 사이드이펙트 없음."""
    report = db.get(ChatReport, report_id)
    if not report:
        raise HTTPException(404, "신고를 찾을 수 없습니다.")
    if report.status != ReportStatus.PENDING:
        raise HTTPException(400, "이미 처리된 신고입니다.")

    report.status = ReportStatus.REJECTED
    report.admin_note = payload.note
    report.resolved_at = _now()
    db.commit()

    return {"ok": True}
