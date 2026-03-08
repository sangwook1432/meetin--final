# apps/api/app/api/routes/friends.py
"""
친구 관계 API

플로우:
  1. POST /friends/request  — 전화번호로 친구 신청
  2. POST /friends/{id}/accept — 수락
  3. POST /friends/{id}/reject — 거절
  4. GET  /friends           — 내 친구 목록 (ACCEPTED)
  5. GET  /friends/requests  — 받은 신청 목록 (PENDING)
  6. DELETE /friends/{id}    — 친구 삭제
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.friend import Friend, FriendStatus
from app.models.notification import Notification, NotiType
from app.services.phone import normalize_phone_kr_to_e164, phone_hmac_hash

router = APIRouter(prefix="/friends", tags=["friends"])


# ── Schemas ──────────────────────────────────────────────────

class FriendRequestIn(BaseModel):
    phone: str = Field(..., description="상대방 전화번호 (010-XXXX-XXXX 형식)")


class FriendOut(BaseModel):
    friend_id: int          # Friend 테이블 row id
    user_id: int            # 친구 user.id
    nickname: str | None
    university: str | None
    major: str | None
    gender: str | None
    photo_url_1: str | None
    status: str             # ACCEPTED / PENDING / REJECTED


# ── Helpers ──────────────────────────────────────────────────

def _find_user_by_phone(db: Session, phone_raw: str) -> User:
    """전화번호로 유저 조회 (없으면 404)"""
    try:
        e164 = normalize_phone_kr_to_e164(phone_raw)
    except ValueError as e:
        raise HTTPException(400, str(e))

    h = phone_hmac_hash(e164)
    user = db.execute(select(User).where(User.phone_hash == h)).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "해당 전화번호로 등록된 사용자를 찾을 수 없습니다.")
    return user


def _send_notification(
    db: Session,
    user_id: int,
    noti_type: NotiType,
    title: str,
    body: str,
    related_user_id: int | None = None,
    related_friend_id: int | None = None,
):
    n = Notification(
        user_id=user_id,
        noti_type=noti_type,
        title=title,
        body=body,
        related_user_id=related_user_id,
        related_friend_id=related_friend_id,
    )
    db.add(n)


# ── Endpoints ────────────────────────────────────────────────

@router.post("/request")
def send_friend_request(
    payload: FriendRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """전화번호로 친구 신청"""
    addressee = _find_user_by_phone(db, payload.phone)

    if addressee.id == user.id:
        raise HTTPException(400, "자기 자신에게 친구 신청할 수 없습니다.")

    # 중복 체크 (이미 신청했거나, 상대가 나에게 이미 신청)
    existing = db.execute(
        select(Friend).where(
            or_(
                (Friend.requester_id == user.id) & (Friend.addressee_id == addressee.id),
                (Friend.requester_id == addressee.id) & (Friend.addressee_id == user.id),
            )
        )
    ).scalar_one_or_none()

    if existing:
        if existing.status == FriendStatus.ACCEPTED:
            raise HTTPException(409, "이미 친구입니다.")
        if existing.status == FriendStatus.PENDING:
            raise HTTPException(409, "이미 친구 신청이 진행 중입니다.")
        # REJECTED → 재신청 허용 (기존 row 업데이트)
        existing.requester_id = user.id
        existing.addressee_id = addressee.id
        existing.status = FriendStatus.PENDING
        db.flush()
        friend = existing
    else:
        friend = Friend(
            requester_id=user.id,
            addressee_id=addressee.id,
            status=FriendStatus.PENDING,
        )
        db.add(friend)
        db.flush()

    # 알림: 상대방에게 친구 신청 알림
    _send_notification(
        db,
        user_id=addressee.id,
        noti_type=NotiType.FRIEND_REQUEST,
        title="친구 신청이 왔어요!",
        body=f"{user.nickname or user.email.split('@')[0]}님이 친구 신청을 보냈습니다.",
        related_user_id=user.id,
        related_friend_id=friend.id,
    )

    db.commit()
    return {"status": "requested", "friend_id": friend.id, "addressee_id": addressee.id}


@router.post("/{friend_id}/accept")
def accept_friend_request(
    friend_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """친구 신청 수락"""
    friend = db.get(Friend, friend_id)
    if not friend:
        raise HTTPException(404, "친구 신청을 찾을 수 없습니다.")
    if friend.addressee_id != user.id:
        raise HTTPException(403, "이 신청을 수락할 권한이 없습니다.")
    if friend.status != FriendStatus.PENDING:
        raise HTTPException(409, f"이미 처리된 신청입니다. (현재: {friend.status.value})")

    friend.status = FriendStatus.ACCEPTED

    # 알림: 신청자에게 수락 알림
    _send_notification(
        db,
        user_id=friend.requester_id,
        noti_type=NotiType.FRIEND_ACCEPTED,
        title="친구 신청이 수락됐어요!",
        body=f"{user.nickname or user.email.split('@')[0]}님이 친구 신청을 수락했습니다.",
        related_user_id=user.id,
        related_friend_id=friend.id,
    )

    db.commit()
    return {"status": "accepted", "friend_id": friend.id}


@router.post("/{friend_id}/reject")
def reject_friend_request(
    friend_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """친구 신청 거절"""
    friend = db.get(Friend, friend_id)
    if not friend:
        raise HTTPException(404, "친구 신청을 찾을 수 없습니다.")
    if friend.addressee_id != user.id:
        raise HTTPException(403, "이 신청을 처리할 권한이 없습니다.")
    if friend.status != FriendStatus.PENDING:
        raise HTTPException(409, f"이미 처리된 신청입니다. (현재: {friend.status.value})")

    friend.status = FriendStatus.REJECTED
    db.commit()
    return {"status": "rejected", "friend_id": friend.id}


@router.get("")
def list_friends(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """내 친구 목록 (ACCEPTED만)"""
    rows = db.execute(
        select(Friend).where(
            or_(Friend.requester_id == user.id, Friend.addressee_id == user.id),
            Friend.status == FriendStatus.ACCEPTED,
        )
    ).scalars().all()

    result = []
    for row in rows:
        friend_user_id = row.addressee_id if row.requester_id == user.id else row.requester_id
        fu = db.get(User, friend_user_id)
        if fu:
            result.append({
                "friend_id": row.id,
                "user_id": fu.id,
                "nickname": fu.nickname,
                "university": fu.university,
                "major": fu.major,
                "gender": fu.gender.value if fu.gender else None,
                "photo_url_1": fu.photo_url_1,
                "status": row.status.value,
            })

    return {"friends": result}


@router.get("/requests")
def list_friend_requests(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """내가 받은 친구 신청 목록 (PENDING)"""
    rows = db.execute(
        select(Friend).where(
            Friend.addressee_id == user.id,
            Friend.status == FriendStatus.PENDING,
        )
    ).scalars().all()

    result = []
    for row in rows:
        fu = db.get(User, row.requester_id)
        if fu:
            result.append({
                "friend_id": row.id,
                "user_id": fu.id,
                "nickname": fu.nickname,
                "university": fu.university,
                "major": fu.major,
                "gender": fu.gender.value if fu.gender else None,
                "photo_url_1": fu.photo_url_1,
                "status": row.status.value,
                "created_at": row.created_at,
            })

    return {"requests": result}


@router.delete("/{friend_id}")
def delete_friend(
    friend_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """친구 삭제 (양방향)"""
    friend = db.get(Friend, friend_id)
    if not friend:
        raise HTTPException(404, "친구 관계를 찾을 수 없습니다.")
    if user.id not in (friend.requester_id, friend.addressee_id):
        raise HTTPException(403, "이 친구 관계를 삭제할 권한이 없습니다.")

    db.delete(friend)
    db.commit()
    return {"status": "deleted"}
