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
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, func

from app.core.deps import get_db, require_verified
from app.models.friendship import Friendship, FriendStatus
from app.models.meeting_invitation import MeetingInvitation, InviteType, InviteStatus
from app.models.meeting import Meeting, MeetingStatus
from app.models.meeting_slot import MeetingSlot
from app.models.notification import Notification, NotifType
from app.models.user import User
from app.services.phone import normalize_phone_kr_to_e164, phone_hmac_hash

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────

class FriendRequestIn(BaseModel):
    phone: str   # 상대방 전화번호


class MeetingInviteIn(BaseModel):
    meeting_id: int
    invitee_phone: str   # 초대받는 친구 전화번호


class MeetingInviteByIdIn(BaseModel):
    meeting_id: int
    invitee_id: int   # user ID (전화번호 대신)


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
    return {"status": "requested", "target_nickname": target.nickname or target.username}


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
                "nickname": requesters[r.requester_id].nickname if r.requester_id in requesters else None,
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


@router.delete("/friends/{friend_user_id}")
def delete_friend(
    friend_user_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """친구 삭제 — 양방향으로 끊음."""
    f = db.execute(
        select(Friendship).where(
            Friendship.status == FriendStatus.ACCEPTED,
            or_(
                (Friendship.requester_id == user.id) & (Friendship.addressee_id == friend_user_id),
                (Friendship.requester_id == friend_user_id) & (Friendship.addressee_id == user.id),
            ),
        )
    ).scalar_one_or_none()
    if not f:
        raise HTTPException(404, "친구 관계를 찾을 수 없습니다.")
    db.delete(f)
    db.commit()
    return {"status": "deleted"}


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

    # 선호학교 제한 검증 (상대팀만 적용)
    if not meeting.preferred_universities_any:
        _allowed = [u.strip() for u in (meeting.preferred_universities_raw or "").split(",") if u.strip()]
        if _allowed:
            host_user = db.get(User, meeting.host_user_id)
            if host_user and host_user.gender:
                from app.models.meeting import Team
                host_team = Team.MALE if (getattr(host_user.gender, "name", None) == "MALE" or host_user.gender == Team.MALE) else Team.FEMALE
                target_team = Team.MALE if (getattr(target.gender, "name", None) == "MALE" or target.gender == Team.MALE) else Team.FEMALE
                opposite = Team.FEMALE if host_team == Team.MALE else Team.MALE
                if target_team == opposite:
                    if not target.university or target.university.strip() not in _allowed:
                        raise HTTPException(
                            403,
                            f"이 미팅은 특정 학교 학생만 초대할 수 있습니다. "
                            f"(허용: {', '.join(_allowed)})",
                        )

    # 초대 생성 (upsert — 유니크 제약 위반 방지)
    existing_invite = db.execute(
        select(MeetingInvitation).where(
            MeetingInvitation.meeting_id == payload.meeting_id,
            MeetingInvitation.invitee_id == target.id,
            MeetingInvitation.invite_type == InviteType.FRIEND,
        )
    ).scalar_one_or_none()

    if existing_invite:
        if existing_invite.status == InviteStatus.PENDING:
            return {"status": "already_invited", "invitation_id": existing_invite.id}
        # 거절/만료된 이전 초대 → 재초대 (upsert)
        existing_invite.inviter_id = user.id
        existing_invite.status = InviteStatus.PENDING
        existing_invite.expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        db.commit()
        db.refresh(existing_invite)
        return {"status": "invited", "invitation_id": existing_invite.id}

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


@router.post("/invitations/meeting-by-id")
def invite_friend_to_meeting_by_id(
    payload: MeetingInviteByIdIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """친구를 미팅에 초대 (user ID 기반, 친구여야 함, 동성이어야 함)"""
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
    target = db.get(User, payload.invitee_id)
    if not target:
        raise HTTPException(404, "해당 유저를 찾을 수 없습니다.")
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

    # 선호학교 제한 검증 (상대팀만 적용)
    if not meeting.preferred_universities_any:
        _allowed = [u.strip() for u in (meeting.preferred_universities_raw or "").split(",") if u.strip()]
        if _allowed:
            host_user = db.get(User, meeting.host_user_id)
            if host_user and host_user.gender:
                from app.models.meeting import Team
                host_team = Team.MALE if (getattr(host_user.gender, "name", None) == "MALE" or host_user.gender == Team.MALE) else Team.FEMALE
                target_team = Team.MALE if (getattr(target.gender, "name", None) == "MALE" or target.gender == Team.MALE) else Team.FEMALE
                opposite = Team.FEMALE if host_team == Team.MALE else Team.MALE
                if target_team == opposite:
                    if not target.university or target.university.strip() not in _allowed:
                        raise HTTPException(
                            403,
                            f"이 미팅은 특정 학교 학생만 초대할 수 있습니다. "
                            f"(허용: {', '.join(_allowed)})",
                        )

    # 학번 범위 검증 (상대팀에만 적용)
    host_user = db.get(User, meeting.host_user_id)
    if host_user and host_user.gender:
        from app.models.meeting import Team as MTeam
        host_team_v = MTeam.MALE if (getattr(host_user.gender, "name", None) == "MALE" or host_user.gender == MTeam.MALE) else MTeam.FEMALE
        target_team_v = MTeam.MALE if (getattr(target.gender, "name", None) == "MALE" or target.gender == MTeam.MALE) else MTeam.FEMALE
        is_opposite = target_team_v != host_team_v
        if is_opposite and (meeting.entry_year_min is not None or meeting.entry_year_max is not None):
            user_year = target.entry_year % 100 if target.entry_year and target.entry_year >= 100 else target.entry_year
            if user_year is None:
                raise HTTPException(403, "초대받는 친구의 학번이 등록되지 않아 초대할 수 없습니다.")
            if meeting.entry_year_min is not None and user_year < meeting.entry_year_min:
                raise HTTPException(403, f"이 미팅은 {meeting.entry_year_min}학번 이상만 초대할 수 있습니다.")
            if meeting.entry_year_max is not None and user_year > meeting.entry_year_max:
                raise HTTPException(403, f"이 미팅은 {meeting.entry_year_max}학번 이하만 초대할 수 있습니다.")

    # 초대 생성 (upsert — 유니크 제약 위반 방지)
    # status 무관하게 기존 레코드를 찾아, 있으면 재활성화 / 없으면 신규 생성
    existing_invite = db.execute(
        select(MeetingInvitation).where(
            MeetingInvitation.meeting_id == payload.meeting_id,
            MeetingInvitation.invitee_id == target.id,
            MeetingInvitation.invite_type == InviteType.FRIEND,
        )
    ).scalar_one_or_none()

    if existing_invite:
        if existing_invite.status == InviteStatus.PENDING:
            return {"status": "already_invited", "invitation_id": existing_invite.id}
        # 거절/만료된 이전 초대 → 재초대 (upsert)
        existing_invite.inviter_id = user.id
        existing_invite.status = InviteStatus.PENDING
        existing_invite.expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        db.commit()
        db.refresh(existing_invite)
        return {"status": "invited", "invitation_id": existing_invite.id}

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
            MeetingInvitation.status.in_([InviteStatus.PENDING, InviteStatus.DEPOSIT_PENDING]),
        ).order_by(MeetingInvitation.id.desc())
    ).scalars().all()

    # 이미 해당 미팅에 참여 중인 초대는 자동 만료 처리
    valid_invites = []
    for inv in invites:
        already_joined = db.execute(
            select(MeetingSlot).where(
                MeetingSlot.meeting_id == inv.meeting_id,
                MeetingSlot.user_id == user.id,
            )
        ).scalar_one_or_none()
        if already_joined:
            inv.status = InviteStatus.EXPIRED
        else:
            valid_invites.append(inv)
    db.commit()
    invites = valid_invites

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
                "status": inv.status.value,
                "inviter_nickname": inviters[inv.inviter_id].nickname if inv.inviter_id in inviters else None,
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
    if inv.status not in (InviteStatus.PENDING, InviteStatus.DEPOSIT_PENDING):
        raise HTTPException(400, "이미 처리된 초대입니다.")
    if inv.expires_at and datetime.now(timezone.utc) > inv.expires_at:
        inv.status = InviteStatus.EXPIRED
        db.commit()
        raise HTTPException(410, "초대가 만료되었습니다.")

    # DEPOSIT_PENDING 상태에서 거절 = 수락 취소 (A가 재초대 가능하도록 PENDING으로 복원)
    if inv.status == InviteStatus.DEPOSIT_PENDING and not payload.accept:
        inv.status = InviteStatus.PENDING
        db.commit()
        return {"status": "cancelled_deposit", "message": "매칭권 소모를 취소했습니다. 초대자가 다시 초대할 수 있습니다."}

    if not payload.accept:
        inv.status = InviteStatus.REJECTED

        if inv.invite_type == InviteType.REPLACE:
            from app.models.chat_room import ChatRoom
            from app.models.chat_message import ChatMessage

            db.flush()  # status 변경을 DB에 반영한 뒤 카운트

            # inviter의 총 REPLACE 초대 횟수 (방금 거절된 것 포함)
            inviter_total = db.execute(
                select(func.count()).select_from(MeetingInvitation).where(
                    MeetingInvitation.meeting_id == inv.meeting_id,
                    MeetingInvitation.inviter_id == inv.inviter_id,
                    MeetingInvitation.invite_type == InviteType.REPLACE,
                )
            ).scalar_one()

            # inviter의 남은 PENDING 횟수
            inviter_pending = db.execute(
                select(func.count()).select_from(MeetingInvitation).where(
                    MeetingInvitation.meeting_id == inv.meeting_id,
                    MeetingInvitation.inviter_id == inv.inviter_id,
                    MeetingInvitation.invite_type == InviteType.REPLACE,
                    MeetingInvitation.status == InviteStatus.PENDING,
                )
            ).scalar_one()

            chat_room = db.execute(
                select(ChatRoom).where(ChatRoom.meeting_id == inv.meeting_id)
            ).scalar_one_or_none()
            invitee_nick = user.nickname or f"#{user.id}"

            if inviter_total >= 3 and inviter_pending == 0:
                # 기회 소진 → 자동 퇴장 (매칭권 추가 차감 없음)
                from app.api.routes.wallet import forfeit_ticket
                inviter = db.get(User, inv.inviter_id)
                meeting_obj = db.execute(
                    select(Meeting).where(Meeting.id == inv.meeting_id).with_for_update()
                ).scalar_one_or_none()

                if inviter and meeting_obj:
                    forfeit_ticket(db, inviter, meeting_obj.id)

                    inviter_slot = db.execute(
                        select(MeetingSlot).where(
                            MeetingSlot.meeting_id == meeting_obj.id,
                            MeetingSlot.user_id == inviter.id,
                        ).with_for_update()
                    ).scalar_one_or_none()

                    if inviter_slot:
                        inviter_slot.user_id = None
                        inviter_slot.confirmed = False

                    meeting_obj.status = MeetingStatus.RECRUITING

                    all_slots = db.execute(
                        select(MeetingSlot).where(MeetingSlot.meeting_id == meeting_obj.id)
                    ).scalars().all()
                    for s in all_slots:
                        if s.user_id is not None:
                            s.confirmed = False

                    if meeting_obj.host_user_id == inviter.id:
                        remaining_members = [s.user_id for s in all_slots if s.user_id is not None]
                        if remaining_members:
                            meeting_obj.host_user_id = remaining_members[0]

                    if chat_room:
                        inviter_nick = inviter.nickname or f"#{inviter.id}"
                        db.add(ChatMessage(
                            room_id=chat_room.id,
                            sender_user_id=0,
                            content=(
                                f"[SYSTEM] {invitee_nick}님이 대체 인원 초대를 거절했습니다. "
                                f"{inviter_nick}님의 초대 기회가 모두 소진되어 자동으로 퇴장 처리되었습니다."
                            ),
                            created_at=datetime.now(timezone.utc),
                        ))
            else:
                remaining = 3 - inviter_total
                if chat_room:
                    db.add(ChatMessage(
                        room_id=chat_room.id,
                        sender_user_id=0,
                        content=(
                            f"[SYSTEM] {invitee_nick}님이 대체 인원 초대를 거절했습니다. "
                            f"초대 기회가 {remaining}번 남았습니다."
                        ),
                        created_at=datetime.now(timezone.utc),
                    ))

        db.commit()
        return {"status": "rejected"}

    meeting = db.execute(
        select(Meeting).where(Meeting.id == inv.meeting_id).with_for_update()
    ).scalar_one_or_none()
    if not meeting:
        inv.status = InviteStatus.EXPIRED
        db.commit()
        raise HTTPException(409, "미팅을 찾을 수 없습니다.")

    # ── 대체인원 초대 수락 (REPLACE) ─────────────────────────────
    if inv.invite_type == InviteType.REPLACE:
        if meeting.status != MeetingStatus.CONFIRMED:
            inv.status = InviteStatus.EXPIRED
            db.commit()
            raise HTTPException(409, "더 이상 대체 참가할 수 없는 미팅입니다.")

        # 이미 참가 중인지 체크
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

        # inviter(나가는 사람) 슬롯이 아직 있는지 확인
        inviter_slot = db.execute(
            select(MeetingSlot).where(
                MeetingSlot.meeting_id == inv.meeting_id,
                MeetingSlot.user_id == inv.inviter_id,
            )
        ).scalar_one_or_none()

        if not inviter_slot:
            inv.status = InviteStatus.EXPIRED
            db.commit()
            raise HTTPException(409, "초대한 멤버가 이미 채팅방을 나갔습니다.")

        # 슬롯은 아직 건드리지 않음 — 매칭권 납부 후 교체
        # 초대 상태를 DEPOSIT_PENDING으로 변경하여 매칭권 납부 대기 표시
        inv.status = InviteStatus.DEPOSIT_PENDING

        db.commit()
        return {
            "status": "ticket_required",
            "message": "매칭권을 소모하면 대체 참가가 완료됩니다.",
            "meeting_id": inv.meeting_id,
            "invitation_id": inv.id,
        }

    # ── 친구 초대 수락 (FRIEND) ───────────────────────────────────
    if meeting.status not in (MeetingStatus.RECRUITING, MeetingStatus.FULL):
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

    # 성별로 팀 결정 (.name 속성 사용 — str() 변환은 Python 버전별로 다름)
    from app.models.meeting import Team
    if not user.gender:
        raise HTTPException(400, "프로필 성별을 먼저 설정해주세요.")
    my_team = Team.MALE if (getattr(user.gender, "name", None) == "MALE" or user.gender == Team.MALE) else Team.FEMALE

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
        for slot in all_slots:
            if slot.user_id is not None:
                db.add(Notification(
                    user_id=slot.user_id,
                    notif_type=NotifType.WAITING_CONFIRM,
                    message="미팅 인원이 충족되었습니다. 매칭권을 소모하여 채팅방을 만들 수 있습니다.",
                    meeting_id=inv.meeting_id,
                ))

    db.commit()
    return {"status": "accepted", "meeting_id": inv.meeting_id}


@router.post("/invitations/{invitation_id}/replace_confirm")
def replace_confirm(
    invitation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    대체인원 보증금 결제 + 슬롯 교체 완료.

    플로우 (단일 호출):
      알림에서 수락 → 보증금 확인 모달 → 예 → replace_confirm 직접 호출
      → 보증금 차감 → 슬롯 교체(A→B, confirmed=True) → A 보증금 환급 → ACCEPTED
    """
    inv = db.execute(
        select(MeetingInvitation).where(
            MeetingInvitation.id == invitation_id,
            MeetingInvitation.invitee_id == user.id,
            MeetingInvitation.invite_type == InviteType.REPLACE,
            MeetingInvitation.status.in_([InviteStatus.PENDING, InviteStatus.DEPOSIT_PENDING]),
        ).with_for_update()
    ).scalar_one_or_none()

    if not inv:
        raise HTTPException(404, "결제 대기 중인 대체 초대를 찾을 수 없습니다.")

    if inv.expires_at and datetime.now(timezone.utc) > inv.expires_at:
        inv.status = InviteStatus.EXPIRED
        db.commit()
        raise HTTPException(410, "초대가 만료되었습니다.")

    meeting = db.execute(
        select(Meeting).where(Meeting.id == inv.meeting_id).with_for_update()
    ).scalar_one_or_none()
    if not meeting or meeting.status != MeetingStatus.CONFIRMED:
        inv.status = InviteStatus.EXPIRED
        db.commit()
        if meeting and meeting.status == MeetingStatus.CANCELLED:
            raise HTTPException(409, "미팅이 취소되어 대체 참가할 수 없습니다.")
        raise HTTPException(409, "더 이상 대체 참가할 수 없는 미팅입니다.")

    # inviter(나가는 사람) 슬롯 확인
    inviter_slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == inv.meeting_id,
            MeetingSlot.user_id == inv.inviter_id,
        ).with_for_update()
    ).scalar_one_or_none()

    if not inviter_slot:
        inv.status = InviteStatus.EXPIRED
        db.commit()
        raise HTTPException(409, "초대한 멤버가 이미 채팅방을 나갔습니다.")

    # 대체인원 매칭권 소모
    from app.api.routes.wallet import consume_ticket, refund_ticket
    db_user = db.execute(
        select(User).where(User.id == user.id).with_for_update()
    ).scalar_one_or_none()
    if not db_user:
        raise HTTPException(400, "유저를 찾을 수 없습니다.")

    # 선호학교 제한 안전망 검증 (대체인원도 동일 조건 적용)
    if not meeting.preferred_universities_any:
        _allowed = [u.strip() for u in (meeting.preferred_universities_raw or "").split(",") if u.strip()]
        if _allowed:
            host_user = db.get(User, meeting.host_user_id)
            if host_user and host_user.gender:
                from app.models.meeting import Team
                host_team = Team.MALE if (getattr(host_user.gender, "name", None) == "MALE" or host_user.gender == Team.MALE) else Team.FEMALE
                invitee_team = Team.MALE if (getattr(db_user.gender, "name", None) == "MALE" or db_user.gender == Team.MALE) else Team.FEMALE
                opposite = Team.FEMALE if host_team == Team.MALE else Team.MALE
                if invitee_team == opposite:
                    if not db_user.university or db_user.university.strip() not in _allowed:
                        raise HTTPException(
                            403,
                            f"이 미팅은 특정 학교 학생만 참가할 수 있습니다. "
                            f"(허용: {', '.join(_allowed)})",
                        )

    consume_ticket(db, db_user, inv.meeting_id)

    # inviter 매칭권 환급
    inviter = db.execute(
        select(User).where(User.id == inv.inviter_id).with_for_update()
    ).scalar_one_or_none()
    if inviter:
        refund_ticket(db, inviter, inv.meeting_id)

    # 슬롯 교체: A → B (confirmed=True, 보증금 납부 완료)
    inviter_slot.user_id = user.id
    inviter_slot.confirmed = True
    inv.status = InviteStatus.ACCEPTED

    # A가 호스트였다면 남은 멤버 중 1명에게 호스트 재배정
    if meeting.host_user_id == inv.inviter_id:
        all_slots = db.execute(
            select(MeetingSlot).where(MeetingSlot.meeting_id == inv.meeting_id)
        ).scalars().all()
        remaining = [s.user_id for s in all_slots if s.user_id is not None and s.user_id != inv.inviter_id]
        if remaining:
            meeting.host_user_id = remaining[0]

    # 채팅방 시스템 메시지
    from app.models.chat_room import ChatRoom
    from app.models.chat_message import ChatMessage
    chat_room = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id == inv.meeting_id)
    ).scalar_one_or_none()
    if chat_room:
        inviter_nick = inviter.nickname if inviter else f"#{inv.inviter_id}"
        invitee_nick = user.nickname or f"#{user.id}"
        db.add(ChatMessage(
            room_id=chat_room.id,
            sender_user_id=0,
            content=f"[SYSTEM] {inviter_nick}님이 나가고 {invitee_nick}님이 대체 참가했습니다.",
            created_at=datetime.now(timezone.utc),
        ))

    db.commit()
    return {
        "status": "completed",
        "meeting_id": inv.meeting_id,
        "chat_room_id": chat_room.id if chat_room else None,
    }
