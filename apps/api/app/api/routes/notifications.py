from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, or_

from app.core.deps import get_db, require_verified
from app.models.notification import Notification

router = APIRouter()


@router.get("/notifications/me")
def get_my_notifications(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """안 읽은 알림 목록 반환"""
    now = datetime.now(timezone.utc)
    notifs = db.execute(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.is_read == False,
            or_(Notification.send_at == None, Notification.send_at <= now),
        ).order_by(Notification.created_at.desc())
    ).scalars().all()

    return {
        "notifications": [
            {
                "id": n.id,
                "notif_type": n.notif_type.value,
                "message": n.message,
                "meeting_id": n.meeting_id,
                "created_at": n.created_at,
            }
            for n in notifs
        ]
    }


@router.post("/notifications/{notif_id}/read")
def mark_notification_read(
    notif_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """알림 읽음 처리"""
    notif = db.execute(
        select(Notification).where(
            Notification.id == notif_id,
            Notification.user_id == user.id,
        )
    ).scalar_one_or_none()

    if not notif:
        raise HTTPException(404, "알림을 찾을 수 없습니다.")

    notif.is_read = True
    db.commit()
    return {"status": "ok"}
