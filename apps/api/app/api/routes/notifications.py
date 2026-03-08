# apps/api/app/api/routes/notifications.py
"""
알림 API

엔드포인트:
  GET  /notifications          — 내 알림 목록 (최신순)
  POST /notifications/{id}/read — 읽음 처리
  POST /notifications/read-all  — 전체 읽음
  GET  /notifications/unread-count — 안 읽은 알림 개수 (벨 아이콘용)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """내 알림 목록 (최신순)"""
    q = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        q = q.where(Notification.is_read == False)
    q = q.order_by(Notification.id.desc()).offset(offset).limit(limit)

    notis = db.execute(q).scalars().all()

    return {
        "notifications": [
            {
                "id": n.id,
                "noti_type": n.noti_type.value,
                "title": n.title,
                "body": n.body,
                "is_read": n.is_read,
                "related_user_id": n.related_user_id,
                "related_meeting_id": n.related_meeting_id,
                "related_friend_id": n.related_friend_id,
                "created_at": n.created_at,
            }
            for n in notis
        ]
    }


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """안 읽은 알림 개수 (벨 아이콘 레드닷)"""
    from sqlalchemy import func
    cnt = db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == user.id,
            Notification.is_read == False,
        )
    ).scalar_one()
    return {"unread_count": cnt}


@router.post("/{noti_id}/read")
def mark_read(
    noti_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """특정 알림 읽음 처리"""
    n = db.get(Notification, noti_id)
    if not n or n.user_id != user.id:
        return {"status": "not_found"}
    n.is_read = True
    db.commit()
    return {"status": "read", "id": noti_id}


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """전체 알림 읽음 처리"""
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    db.commit()
    return {"status": "all_read"}
