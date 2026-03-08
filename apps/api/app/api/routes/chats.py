from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.deps import get_db, get_current_user, require_verified
from app.models.chat_room import ChatRoom
from app.models.chat_message import ChatMessage, ChatMsgType
from app.models.meeting_slot import MeetingSlot
from app.models.meeting import Meeting, MeetingStatus
from app.models.meeting_schedule import MeetingSchedule, ScheduleStatus
from app.models.deposit import Deposit, DepositStatus
from app.models.user import User
from app.models.notification import Notification, NotiType

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_user_in_room(db: Session, room_id: int, user_id: int) -> int:
    """
    chat_rooms -> meeting_id -> meeting_slots에 user가 있으면 접근 허용.
    return meeting_id
    """
    room = db.get(ChatRoom, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found.")

    meeting_id = room.meeting_id

    exists = db.execute(
        select(MeetingSlot.id).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == user_id,
        )
    ).first()
    if not exists:
        raise HTTPException(status_code=403, detail="You are not a member of this chat room.")

    return meeting_id


def _post_system_message(db: Session, room_id: int, content: str, msg_type: ChatMsgType = ChatMsgType.SYSTEM):
    """시스템 메시지 게시 (sender_user_id=0 은 시스템)"""
    # sender_user_id 0은 system용으로 예약 — FK 제약이 있으므로 방에 있는 첫 유저로 대체
    # 대신 msg_type=SYSTEM 으로 구분
    msg = ChatMessage(
        room_id=room_id,
        sender_user_id=0,  # 0 = 시스템 (트리거하는 쪽에서 실제 유저 ID로 교체)
        content=content,
        msg_type=msg_type,
        created_at=_now(),
    )
    db.add(msg)


# ── Schemas ─────────────────────────────────────────────────

class ChatSendIn(BaseModel):
    content: str


class LeaveModeIn(BaseModel):
    """나가기 방식 선택"""
    mode: str = Field(..., description="'substitute' (대타 구함) 또는 'forfeit' (보증금 포기)")
    substitute_phone: str | None = Field(None, description="대타 전화번호 (mode=substitute 일 때)")


class ScheduleProposeIn(BaseModel):
    """일정 제안"""
    scheduled_at: datetime = Field(..., description="제안 날짜/시간 (ISO8601)")
    location: str | None = Field(None, max_length=200)
    note: str | None = Field(None)


class ChatMessageOut(BaseModel):
    id: int
    room_id: int
    sender_user_id: int
    sender_nickname: str | None
    content: str
    msg_type: str
    created_at: datetime


# ── GET /chats ───────────────────────────────────────────────

@router.get("/chats")
def list_chats(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    내가 속한 meeting들의 chat_room 리스트 (meeting_slots 기반)
    """
    meeting_ids = db.execute(
        select(MeetingSlot.meeting_id).where(MeetingSlot.user_id == user.id)
    ).scalars().all()

    if not meeting_ids:
        return {"rooms": []}

    rooms = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id.in_(meeting_ids))
    ).scalars().all()

    # 미팅 정보 함께 조회
    meetings = db.execute(
        select(Meeting).where(Meeting.id.in_([r.meeting_id for r in rooms]))
    ).scalars().all()
    meeting_map = {m.id: m for m in meetings}

    result = []
    for r in rooms:
        m = meeting_map.get(r.meeting_id)
        result.append({
            "room_id": r.id,
            "meeting_id": r.meeting_id,
            "meeting_type": m.meeting_type.value if m else None,
            "meeting_status": m.status.value if m else None,
        })

    return {"rooms": result}


# ── GET /chats/{room_id} ─────────────────────────────────────

@router.get("/chats/{room_id}")
def get_messages(
    room_id: int,
    since_id: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """폴링: since_id 이후 메시지 가져오기 (닉네임 포함)"""
    _ensure_user_in_room(db, room_id, user.id)

    msgs = db.execute(
        select(ChatMessage)
        .where(ChatMessage.room_id == room_id, ChatMessage.id > since_id)
        .order_by(ChatMessage.id.asc())
        .limit(limit)
    ).scalars().all()

    # 발신자 닉네임 일괄 조회
    sender_ids = {m.sender_user_id for m in msgs if m.sender_user_id != 0}
    senders: dict[int, User] = {}
    if sender_ids:
        users = db.execute(select(User).where(User.id.in_(sender_ids))).scalars().all()
        senders = {u.id: u for u in users}

    return {
        "messages": [
            {
                "id": m.id,
                "room_id": m.room_id,
                "sender_user_id": m.sender_user_id,
                "sender_nickname": (
                    senders[m.sender_user_id].nickname
                    if m.sender_user_id in senders else None
                ),
                "sender_photo_url": (
                    senders[m.sender_user_id].photo_url_1
                    if m.sender_user_id in senders else None
                ),
                "content": m.content,
                "msg_type": m.msg_type.value,
                "created_at": m.created_at,
            }
            for m in msgs
        ]
    }


# ── POST /chats/{room_id}/messages ───────────────────────────

@router.post("/chats/{room_id}/messages")
def send_message(
    room_id: int,
    payload: ChatSendIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """메시지 전송"""
    _ensure_user_in_room(db, room_id, user.id)

    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required.")

    msg = ChatMessage(
        room_id=room_id,
        sender_user_id=user.id,
        content=content,
        msg_type=ChatMsgType.NORMAL,
        created_at=_now(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return {"id": msg.id}


# ── POST /chats/{room_id}/leave ──────────────────────────────

@router.post("/chats/{room_id}/leave")
def leave_chat(
    room_id: int,
    payload: LeaveModeIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    채팅방 나가기 (CONFIRMED 미팅 전용)

    mode=substitute:
      - 대타 전화번호 입력 → ReplacementRequest 생성 (replacement.py 로직 재사용)
      - 수락될 때까지 유저는 채팅방에 유지됨
      - 수락 시 deposit 환불

    mode=forfeit:
      - 보증금 몰수 (DepositStatus.FORFEITED)
      - 슬롯 비워 RECRUITING 으로 복귀
      - 같은 성별 유저들에게 SLOT_VACANCY 알림
    """
    meeting_id = _ensure_user_in_room(db, room_id, user.id)

    meeting = db.execute(
        select(Meeting).where(Meeting.id == meeting_id).with_for_update()
    ).scalar_one_or_none()

    if not meeting:
        raise HTTPException(404, "미팅을 찾을 수 없습니다.")

    if meeting.status != MeetingStatus.CONFIRMED:
        raise HTTPException(400, "확정된 미팅에서만 이 기능을 사용할 수 있습니다.")

    slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == user.id,
        ).with_for_update()
    ).scalar_one_or_none()

    if not slot:
        raise HTTPException(403, "미팅 멤버가 아닙니다.")

    if payload.mode == "substitute":
        # ── 대타 구하기 ────────────────────────────────────────
        if not payload.substitute_phone:
            raise HTTPException(400, "대타 전화번호를 입력해주세요.")

        from app.services.phone import normalize_phone_kr_to_e164, phone_hmac_hash
        from app.models.replacement_request import ReplacementRequest, ReplacementStatus

        try:
            e164 = normalize_phone_kr_to_e164(payload.substitute_phone)
        except ValueError as e:
            raise HTTPException(400, str(e))

        candidate = db.execute(
            select(User).where(User.phone_hash == phone_hmac_hash(e164))
        ).scalar_one_or_none()

        if not candidate:
            raise HTTPException(404, "해당 번호의 사용자를 찾을 수 없습니다.")

        if candidate.id == user.id:
            raise HTTPException(400, "자기 자신을 대타로 지정할 수 없습니다.")

        # attempt_no 계산
        from sqlalchemy import func as sqlfunc
        attempt = db.execute(
            select(sqlfunc.count()).select_from(ReplacementRequest).where(
                ReplacementRequest.meeting_id == meeting_id,
                ReplacementRequest.leaver_user_id == user.id,
            )
        ).scalar_one() + 1

        if attempt > 2:
            raise HTTPException(400, "대타 신청은 최대 2회까지 가능합니다.")

        from datetime import timedelta
        rr = ReplacementRequest(
            meeting_id=meeting_id,
            leaver_user_id=user.id,
            candidate_user_id=candidate.id,
            attempt_no=attempt,
            expires_at=_now() + timedelta(minutes=30),
        )
        db.add(rr)

        # 시스템 메시지
        msg = ChatMessage(
            room_id=room_id,
            sender_user_id=user.id,
            content=f"🔄 {user.nickname or '멤버'}님이 대타를 구하고 있습니다. 수락 대기 중...",
            msg_type=ChatMsgType.SYSTEM,
            created_at=_now(),
        )
        db.add(msg)

        # 대타 후보에게 알림
        n = Notification(
            user_id=candidate.id,
            noti_type=NotiType.MEETING_INVITE,
            title="미팅 대타 요청이 왔어요!",
            body=f"{user.nickname or '멤버'}님이 미팅 대타를 요청했습니다. 수락하면 보증금을 납부하고 참여하게 됩니다.",
            related_meeting_id=meeting_id,
            related_user_id=user.id,
        )
        db.add(n)

        db.commit()
        return {"status": "substitute_requested", "candidate_id": candidate.id}

    elif payload.mode == "forfeit":
        # ── 보증금 포기 + 슬롯 비우기 ─────────────────────────
        # 보증금 FORFEITED 처리
        deposit = db.execute(
            select(Deposit).where(
                Deposit.meeting_id == meeting_id,
                Deposit.user_id == user.id,
                Deposit.status == DepositStatus.HELD,
            ).with_for_update()
        ).scalar_one_or_none()

        if deposit:
            deposit.status = DepositStatus.FORFEITED

        # 슬롯 비우기
        slot.user_id = None
        slot.confirmed = False

        # 미팅 상태를 RECRUITING 으로 되돌림 (한 명 빠졌으니)
        meeting.status = MeetingStatus.RECRUITING

        # 호스트 재배정
        if meeting.host_user_id == user.id:
            remaining = db.execute(
                select(MeetingSlot).where(
                    MeetingSlot.meeting_id == meeting_id,
                    MeetingSlot.user_id.isnot(None),
                    MeetingSlot.user_id != user.id,
                )
            ).scalars().first()
            if remaining:
                meeting.host_user_id = remaining.user_id

        # 시스템 메시지
        msg = ChatMessage(
            room_id=room_id,
            sender_user_id=user.id,
            content=f"💔 {user.nickname or '멤버'}님이 보증금을 포기하고 나갔습니다. 빈 자리가 생겼어요.",
            msg_type=ChatMsgType.SYSTEM,
            created_at=_now(),
        )
        db.add(msg)

        # 같은 성별 VERIFIED 유저들에게 SLOT_VACANCY 알림 (최대 20명)
        from app.models.user import Gender
        same_gender_users = db.execute(
            select(User).where(
                User.gender == user.gender,
                User.id != user.id,
                User.verification_status == "VERIFIED",
            ).limit(20)
        ).scalars().all()

        for target in same_gender_users:
            n = Notification(
                user_id=target.id,
                noti_type=NotiType.SLOT_VACANCY,
                title="미팅 빈자리가 생겼어요!",
                body=f"미팅 #{meeting_id}에 빈자리가 생겼습니다. 친구를 초대하거나 참가해 보세요.",
                related_meeting_id=meeting_id,
            )
            db.add(n)

        db.commit()
        return {"status": "forfeited", "meeting_status": meeting.status.value}

    else:
        raise HTTPException(400, "mode는 'substitute' 또는 'forfeit' 이어야 합니다.")


# ── POST /chats/{room_id}/cancel-request ────────────────────

@router.post("/chats/{room_id}/cancel-request")
def request_cancel(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    미팅 취소 요청 — 채팅방에 투표 메시지를 게시.
    (모두 동의하면 /chats/{room_id}/cancel-confirm 으로 확정)
    """
    meeting_id = _ensure_user_in_room(db, room_id, user.id)

    msg = ChatMessage(
        room_id=room_id,
        sender_user_id=user.id,
        content=f"🚫 {user.nickname or '멤버'}님이 미팅 취소를 제안했습니다. 모두 동의하면 취소됩니다.",
        msg_type=ChatMsgType.CANCEL_REQUEST,
        created_at=_now(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {"status": "cancel_requested", "message_id": msg.id}


# ── POST /chats/{room_id}/cancel-confirm ─────────────────────

@router.post("/chats/{room_id}/cancel-confirm")
def confirm_cancel(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    미팅 취소 확정 (호스트만) — 보증금 전액 환불, 채팅방 유지(기록 보존).
    """
    meeting_id = _ensure_user_in_room(db, room_id, user.id)

    meeting = db.execute(
        select(Meeting).where(Meeting.id == meeting_id).with_for_update()
    ).scalar_one_or_none()

    if not meeting:
        raise HTTPException(404, "미팅을 찾을 수 없습니다.")

    if meeting.host_user_id != user.id:
        raise HTTPException(403, "호스트만 취소를 확정할 수 있습니다.")

    # CONFIRMED 상태에서만 가능
    if meeting.status != MeetingStatus.CONFIRMED:
        raise HTTPException(400, "확정된 미팅만 취소할 수 있습니다.")

    # 모든 HELD 보증금 REFUNDED 처리
    held_deposits = db.execute(
        select(Deposit).where(
            Deposit.meeting_id == meeting_id,
            Deposit.status == DepositStatus.HELD,
        ).with_for_update()
    ).scalars().all()

    for d in held_deposits:
        d.status = DepositStatus.REFUND_PENDING  # 배치에서 실제 환불 처리

    # 미팅 상태 변경 (CANCELLED — 클라이언트에서 표시용)
    meeting.status = MeetingStatus.RECRUITING  # 상태를 RECRUITING 으로 되돌림 (재모집 가능)

    # 시스템 메시지
    msg = ChatMessage(
        room_id=room_id,
        sender_user_id=user.id,
        content="✅ 미팅이 취소되었습니다. 모든 보증금이 환불 처리됩니다.",
        msg_type=ChatMsgType.SYSTEM,
        created_at=_now(),
    )
    db.add(msg)
    db.commit()
    return {"status": "cancelled"}


# ── POST /chats/{room_id}/schedule-propose ───────────────────

@router.post("/chats/{room_id}/schedule-propose")
def propose_schedule(
    room_id: int,
    payload: ScheduleProposeIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    미팅 일정 제안 (호스트) — 채팅에 SCHEDULE_PROPOSE 메시지 + DB 기록
    """
    meeting_id = _ensure_user_in_room(db, room_id, user.id)

    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(404, "미팅을 찾을 수 없습니다.")

    if meeting.host_user_id != user.id:
        raise HTTPException(403, "호스트만 일정을 제안할 수 있습니다.")

    # 기존 PROPOSED 일정 취소
    db.execute(
        select(MeetingSchedule).where(
            MeetingSchedule.meeting_id == meeting_id,
            MeetingSchedule.status == ScheduleStatus.PROPOSED,
        )
    )

    sched = MeetingSchedule(
        meeting_id=meeting_id,
        proposed_by=user.id,
        scheduled_at=payload.scheduled_at,
        location=payload.location,
        note=payload.note,
        status=ScheduleStatus.PROPOSED,
    )
    db.add(sched)
    db.flush()

    dt_str = payload.scheduled_at.strftime("%Y년 %m월 %d일 %H:%M")
    loc_str = f" · 장소: {payload.location}" if payload.location else ""
    note_str = f"\n📝 {payload.note}" if payload.note else ""

    msg = ChatMessage(
        room_id=room_id,
        sender_user_id=user.id,
        content=f"📅 미팅 일정 제안\n\n🗓️ {dt_str}{loc_str}{note_str}",
        msg_type=ChatMsgType.SCHEDULE_PROPOSE,
        created_at=_now(),
    )
    db.add(msg)
    db.commit()

    return {
        "status": "proposed",
        "schedule_id": sched.id,
        "scheduled_at": sched.scheduled_at,
        "location": sched.location,
    }


# ── GET /chats/{room_id}/schedule ────────────────────────────

@router.get("/chats/{room_id}/schedule")
def get_schedule(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """현재 미팅 일정 조회"""
    meeting_id = _ensure_user_in_room(db, room_id, user.id)

    sched = db.execute(
        select(MeetingSchedule).where(
            MeetingSchedule.meeting_id == meeting_id,
        ).order_by(MeetingSchedule.id.desc()).limit(1)
    ).scalar_one_or_none()

    if not sched:
        return {"schedule": None}

    return {
        "schedule": {
            "id": sched.id,
            "scheduled_at": sched.scheduled_at,
            "location": sched.location,
            "note": sched.note,
            "status": sched.status.value,
            "proposed_by": sched.proposed_by,
        }
    }
