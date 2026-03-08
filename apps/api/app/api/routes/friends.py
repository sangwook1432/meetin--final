"""
friends.py — 친구 관계 + 미팅 초대 API

엔드포인트:
  POST /friends/request          : 친구 요청 (전화번호로)
  GET  /friends                  : 내 친구 목록 (ACCEPTED)
  GET  /friends/pending          : 받은 친구 요청
  POST /friends/{id}/accept      : 친구 요청 수락
  POST /friends/{id}/reject      : 친구 요청 거절

  POST /invitations/meeting       : 미팅에 친구 초대
  GET  /invitations/me            : 내가 받은 초대 목록
  POST /invitations/{id}/respond  : 초대 수락/거절
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, or_

from app.core.deps import get_db, require_verified
from app.models.friendship import Friendship, FriendStatus
from app.models.meeting_invitation import MeetingInvitation, InviteType, InviteStatus
from app.models.meeting import Meeting, MeetingStatus
from app.models.meeting_slot import MeetingSlot
from app.models.user import User
from app.services.phone import normalize_phone_kr_to_e164, phone_hmac_hash

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────

class FriendRequestIn(BaseModel):
    phone: str   # 상대방 전화번호


class MeetingInviteIn(BaseModel):
    meeting_id: int
    invitee_phone: str   # 초대받는 친구 전화번호


class InviteRespondIn(BaseModel):
    accept: bool


# ─── Helpers ─────────────────────────────────────────────────────

def _get_user_by_phone(db: Session, phone: str) -> User:
    """전화번호로 유저 조회 (없으면 404)"""
    try:
        e164 = normalize_phone_kr_to_e164(phone)
    except ValueError as e:
        raise HTTPException(400, str(e))
    phash = phone_hmac_hash(e164)
    u = db.execute(select(User).where(User.phone_hash == phash)).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "해당 전화번호로 가입된 유저가 없습니다.")
    return u


def _are_friends(db: Session, uid1: int, uid2: int) -> bool:
    f = db.execute(
        select(Friendship).where(
            Friendship.status == FriendStatus.ACCEPTED,
            or_(
                (Friendship.requester_id == uid1) & (Friendship.addressee_id == uid2),
                (Friendship.requester_id == uid2) & (Friendship.addressee_id == uid1),
            )
        )
    ).scalar_one_or_none()
    return f is not None


# ─── 친구 요청 ────────────────────────────────────────────────────

@router.post("/friends/request")
def request_friend(
    payload: FriendRequestIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    target = _get_user_by_phone(db, payload.phone)
    if target.id == user.id:
        raise HTTPException(400, "자기 자신에게 친구 요청할 수 없습니다.")

    existing = db.execute(
        select(Friendship).where(
            or_(
                (Friendship.requester_id == user.id) & (Friendship.addressee_id == target.id),
                (Friendship.requester_id == target.id) & (Friendship.addressee_id == user.id),
            )
        )
    ).scalar_one_or_none()

    if existing:
        if existing.status == FriendStatus.ACCEPTED:
            return {"status": "already_friends"}
        if existing.status == FriendStatus.PENDING:
            return {"status": "already_requested"}

    fs = Friendship(requester_id=user.id, addressee_id=target.id)
    db.add(fs)
    db.commit()
    return {"status": "requested", "target_nickname": target.nickname or target.email}


@router.get("/friends")
def list_friends(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    rows = db.execute(
        select(Friendship).where(
            Friendship.status == FriendStatus.ACCEPTED,
            or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id),
        )
    ).scalars().all()

    friend_ids = [
        r.addressee_id if r.requester_id == user.id else r.requester_id
        for r in rows
    ]
    if not friend_ids:
        return {"friends": []}

    friends = db.execute(select(User).where(User.id.in_(friend_ids))).scalars().all()
    return {
        "friends": [
            {
                "id": f.id,
                "nickname": f.nickname,
                "gender": f.gender.value if f.gender else None,
                "university": f.university,
                "phone_last4": f.phone_last4,
                "verification_status": f.verification_status.value,
            }
            for f in friends
        ]
    }


@router.get("/friends/pending")
def pending_requests(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    rows = db.execute(
        select(Friendship).where(
            Friendship.addressee_id == user.id,
            Friendship.status == FriendStatus.PENDING,
        )
    ).scalars().all()

    requester_ids = [r.requester_id for r in rows]
    requesters = {}
    if requester_ids:
        us = db.execute(select(User).where(User.id.in_(requester_ids))).scalars().all()
        requesters = {u.id: u for u in us}

    return {
        "requests": [
            {
                "friendship_id": r.id,
                "requester_id": r.requester_id,
                "nickname": requesters.get(r.requester_id, {}).nickname if hasattr(requesters.get(r.requester_id, {}), 'nickname') else None,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


@router.post("/friends/{friendship_id}/accept")
def accept_friend(
    friendship_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    f = db.get(Friendship, friendship_id)
    if not f or f.addressee_id != user.id:
        raise HTTPException(404, "친구 요청을 찾을 수 없습니다.")
    if f.status != FriendStatus.PENDING:
        raise HTTPException(400, "이미 처리된 요청입니다.")
    f.status = FriendStatus.ACCEPTED
    db.commit()
    return {"status": "accepted"}


@router.post("/friends/{friendship_id}/reject")
def reject_friend(
    friendship_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    f = db.get(Friendship, friendship_id)
    if not f or f.addressee_id != user.id:
        raise HTTPException(404, "친구 요청을 찾을 수 없습니다.")
    db.delete(f)
    db.commit()
    return {"status": "rejected"}


# ─── 미팅 초대 ────────────────────────────────────────────────────

@router.post("/invitations/meeting")
def invite_friend_to_meeting(
    payload: MeetingInviteIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """친구를 미팅에 초대 (친구여야 함, 동성이어야 함)"""
    meeting = db.get(Meeting, payload.meeting_id)
    if not meeting:
        raise HTTPException(404, "미팅을 찾을 수 없습니다.")
    if meeting.status not in (MeetingStatus.RECRUITING, MeetingStatus.FULL):
        raise HTTPException(400, "모집 중인 미팅에만 초대 가능합니다.")

    # 내가 해당 미팅 멤버인지 확인
    my_slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == payload.meeting_id,
            MeetingSlot.user_id == user.id,
        )
    ).scalar_one_or_none()
    if not my_slot:
        raise HTTPException(403, "내가 속한 미팅에만 친구를 초대할 수 있습니다.")

    # 초대받는 사람 조회
    target = _get_user_by_phone(db, payload.invitee_phone)
    if target.id == user.id:
        raise HTTPException(400, "자기 자신은 초대할 수 없습니다.")

    # 친구 관계 확인
    if not _are_friends(db, user.id, target.id):
        raise HTTPException(403, "친구 관계인 유저만 초대할 수 있습니다.")

    # 동성 확인
    if target.gender != user.gender:
        raise HTTPException(400, "같은 성별의 친구만 초대할 수 있습니다.")

    # 이미 미팅 멤버인지
    already = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == payload.meeting_id,
            MeetingSlot.user_id == target.id,
        )
    ).scalar_one_or_none()
    if already:
        return {"status": "already_member"}

    # 빈자리 확인
    empty_slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == payload.meeting_id,
            MeetingSlot.team == my_slot.team,
            MeetingSlot.user_id.is_(None),
        )
    ).scalar_one_or_none()
    if not empty_slot:
        raise HTTPException(409, "내 팀에 빈자리가 없습니다.")

    # 초대 생성 (idempotent)
    existing_invite = db.execute(
        select(MeetingInvitation).where(
            MeetingInvitation.meeting_id == payload.meeting_id,
            MeetingInvitation.invitee_id == target.id,
            MeetingInvitation.invite_type == InviteType.FRIEND,
            MeetingInvitation.status == InviteStatus.PENDING,
        )
    ).scalar_one_or_none()

    if existing_invite:
        return {"status": "already_invited", "invitation_id": existing_invite.id}

    inv = MeetingInvitation(
        meeting_id=payload.meeting_id,
        inviter_id=user.id,
        invitee_id=target.id,
        invite_type=InviteType.FRIEND,
        status=InviteStatus.PENDING,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return {"status": "invited", "invitation_id": inv.id}


@router.get("/invitations/me")
def my_invitations(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """내가 받은 초대 목록"""
    invites = db.execute(
        select(MeetingInvitation).where(
            MeetingInvitation.invitee_id == user.id,
            MeetingInvitation.status == InviteStatus.PENDING,
        ).order_by(MeetingInvitation.id.desc())
    ).scalars().all()

    # 초대한 사람 이름 조회
    inviter_ids = list({i.inviter_id for i in invites})
    inviters = {}
    if inviter_ids:
        us = db.execute(select(User).where(User.id.in_(inviter_ids))).scalars().all()
        inviters = {u.id: u for u in us}

    return {
        "invitations": [
            {
                "id": inv.id,
                "meeting_id": inv.meeting_id,
                "invite_type": inv.invite_type.value,
                "inviter_nickname": inviters.get(inv.inviter_id, type("", (), {"nickname": None})()).nickname,
                "expires_at": inv.expires_at,
                "created_at": inv.created_at,
            }
            for inv in invites
        ]
    }


@router.post("/invitations/{invitation_id}/respond")
def respond_invitation(
    invitation_id: int,
    payload: InviteRespondIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """초대 수락 / 거절"""
    inv = db.execute(
        select(MeetingInvitation).where(
            MeetingInvitation.id == invitation_id,
            MeetingInvitation.invitee_id == user.id,
        ).with_for_update()
    ).scalar_one_or_none()

    if not inv:
        raise HTTPException(404, "초대를 찾을 수 없습니다.")
    if inv.status != InviteStatus.PENDING:
        raise HTTPException(400, "이미 처리된 초대입니다.")
    if inv.expires_at and datetime.now(timezone.utc) > inv.expires_at:
        inv.status = InviteStatus.EXPIRED
        db.commit()
        raise HTTPException(410, "초대가 만료되었습니다.")

    if not payload.accept:
        inv.status = InviteStatus.REJECTED
        db.commit()
        return {"status": "rejected"}

    # 수락: 미팅에 자동 참가
    meeting = db.execute(
        select(Meeting).where(Meeting.id == inv.meeting_id).with_for_update()
    ).scalar_one_or_none()

    if not meeting or meeting.status not in (MeetingStatus.RECRUITING, MeetingStatus.FULL):
        inv.status = InviteStatus.EXPIRED
        db.commit()
        raise HTTPException(409, "더 이상 참가할 수 없는 미팅입니다.")

    # 이미 참가했는지 체크
    already = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == inv.meeting_id,
            MeetingSlot.user_id == user.id,
        )
    ).scalar_one_or_none()
    if already:
        inv.status = InviteStatus.ACCEPTED
        db.commit()
        return {"status": "already_member", "meeting_id": inv.meeting_id}

    # 성별로 팀 결정
    from app.models.meeting import Team
    from app.core.deps import get_db
    if not user.gender:
        raise HTTPException(400, "프로필 성별을 먼저 설정해주세요.")
    my_team = Team.MALE if str(user.gender).upper() == "MALE" else Team.FEMALE

    # 빈 슬롯 배정
    empty_slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == inv.meeting_id,
            MeetingSlot.team == my_team,
            MeetingSlot.user_id.is_(None),
        ).with_for_update()
    ).scalar_one_or_none()

    if not empty_slot:
        inv.status = InviteStatus.EXPIRED
        db.commit()
        raise HTTPException(409, "빈자리가 없습니다.")

    empty_slot.user_id = user.id
    inv.status = InviteStatus.ACCEPTED

    # 상태 재계산
    all_slots = db.execute(
        select(MeetingSlot).where(MeetingSlot.meeting_id == inv.meeting_id)
    ).scalars().all()
    filled = sum(1 for s in all_slots if s.user_id is not None)
    if filled >= len(all_slots) and meeting.status != MeetingStatus.CONFIRMED:
        meeting.status = MeetingStatus.WAITING_CONFIRM

    db.commit()
    return {"status": "accepted", "meeting_id": inv.meeting_id}
