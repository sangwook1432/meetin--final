from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.deps import get_db, require_verified
from app.models.chat_room import ChatRoom
from app.models.meeting_slot import MeetingSlot
from app.models.chat_message import ChatMessage
from app.models.meeting import Meeting, MeetingStatus, Team
from app.models.meeting_schedule import MeetingSchedule
from app.models.meeting_invitation import MeetingInvitation, InviteType, InviteStatus
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, TxType
from app.services.phone import normalize_phone_kr_to_e164, phone_hmac_hash

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_user_in_room(db: Session, room_id: int, user_id: int) -> ChatRoom:
    room = db.get(ChatRoom, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found.")

    exists = db.execute(
        select(MeetingSlot.id).where(
            MeetingSlot.meeting_id == room.meeting_id,
            MeetingSlot.user_id == user_id,
        )
    ).first()
    if not exists:
        raise HTTPException(status_code=403, detail="You are not a member of this chat room.")

    return room


def _send_system_message(db: Session, room_id: int, content: str):
    """시스템 메시지 삽입 (sender_user_id = 0)"""
    msg = ChatMessage(
        room_id=room_id,
        sender_user_id=0,
        content=f"[SYSTEM] {content}",
        created_at=_now(),
    )
    db.add(msg)


# ─── Schemas ─────────────────────────────────────────────────────

class ChatSendIn(BaseModel):
    content: str


class ChatMessageOut(BaseModel):
    id: int
    room_id: int
    sender_user_id: int
    content: str
    created_at: datetime


class LeaveChatIn(BaseModel):
    leave_type: str  # "forfeit" | "replace"
    replace_phone: str | None = None  # replace 시 대체인원 전화번호


class ScheduleIn(BaseModel):
    date: str        # YYYY-MM-DD
    time: str        # HH:MM
    place: str


class ScheduleAgreeIn(BaseModel):
    agree: bool


# ─── 채팅방 목록 ──────────────────────────────────────────────────

@router.get("/chats")
def list_chats(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    meeting_ids = db.execute(
        select(MeetingSlot.meeting_id).where(MeetingSlot.user_id == user.id)
    ).scalars().all()

    if not meeting_ids:
        return {"rooms": []}

    rooms = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id.in_(meeting_ids))
    ).scalars().all()

    return {"rooms": [{"room_id": r.id, "meeting_id": r.meeting_id} for r in rooms]}


# ─── 채팅방 정보 (프론트에서 host 여부 확인용) ──────────────────────

@router.get("/chats/{room_id}/info")
def get_chat_room_info(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.get(Meeting, room.meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    # 미팅 일정 조회
    schedule = db.execute(
        select(MeetingSchedule).where(MeetingSchedule.meeting_id == room.meeting_id)
    ).scalar_one_or_none()

    return {
        "room_id": room_id,
        "meeting_id": room.meeting_id,
        "host_user_id": meeting.host_user_id,
        "meeting_type": meeting.meeting_type.value,
        "schedule": {
            "date": schedule.date,
            "time": schedule.time,
            "place": schedule.place,
            "confirmed": schedule.confirmed,
        } if schedule else None,
    }


# ─── 메시지 폴링 ──────────────────────────────────────────────────

@router.get("/chats/{room_id}")
def get_messages(
    room_id: int,
    since_id: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    _ensure_user_in_room(db, room_id, user.id)

    msgs = db.execute(
        select(ChatMessage)
        .where(ChatMessage.room_id == room_id, ChatMessage.id > since_id)
        .order_by(ChatMessage.id.asc())
        .limit(limit)
    ).scalars().all()

    return {
        "messages": [
            {
                "id": m.id,
                "room_id": m.room_id,
                "sender_user_id": m.sender_user_id,
                "content": m.content,
                "created_at": m.created_at,
            }
            for m in msgs
        ]
    }


# ─── 메시지 전송 ──────────────────────────────────────────────────

@router.post("/chats/{room_id}/messages")
def send_message(
    room_id: int,
    payload: ChatSendIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    _ensure_user_in_room(db, room_id, user.id)
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required.")

    msg = ChatMessage(
        room_id=room_id,
        sender_user_id=user.id,
        content=content,
        created_at=_now(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {"id": msg.id}


# ─── 채팅방 나가기 ────────────────────────────────────────────────

@router.post("/chats/{room_id}/leave")
def leave_chat_room(
    room_id: int,
    payload: LeaveChatIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    채팅방(CONFIRMED 미팅) 나가기
    - forfeit: 보증금 몰수 + 슬롯 비우기 + 미팅 RECRUITING 복귀
    - replace: 대체인원 전화번호 입력 → MeetingInvitation(REPLACE) 생성, 수락 전까지 유지
    """
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.execute(
        select(Meeting).where(Meeting.id == room.meeting_id).with_for_update()
    ).scalar_one_or_none()

    if not meeting:
        raise HTTPException(404, "Meeting not found")

    my_slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting.id,
            MeetingSlot.user_id == user.id,
        ).with_for_update()
    ).scalar_one_or_none()

    if not my_slot:
        raise HTTPException(403, "슬롯을 찾을 수 없습니다.")

    if payload.leave_type == "replace":
        # 대체인원 초대
        if not payload.replace_phone:
            raise HTTPException(400, "대체 인원 전화번호를 입력해주세요.")

        try:
            e164 = normalize_phone_kr_to_e164(payload.replace_phone)
        except ValueError as e:
            raise HTTPException(400, str(e))

        phash = phone_hmac_hash(e164)
        target = db.execute(select(User).where(User.phone_hash == phash)).scalar_one_or_none()
        if not target:
            raise HTTPException(404, "해당 전화번호로 가입된 유저가 없습니다.")
        if target.gender != user.gender:
            raise HTTPException(400, "같은 성별의 유저만 대체 인원으로 초대 가능합니다.")

        # 이미 PENDING 초대 있으면 재사용
        existing = db.execute(
            select(MeetingInvitation).where(
                MeetingInvitation.meeting_id == meeting.id,
                MeetingInvitation.inviter_id == user.id,
                MeetingInvitation.invite_type == InviteType.REPLACE,
                MeetingInvitation.status == InviteStatus.PENDING,
            )
        ).scalar_one_or_none()

        if existing:
            existing.invitee_id = target.id
        else:
            from datetime import timedelta
            inv = MeetingInvitation(
                meeting_id=meeting.id,
                inviter_id=user.id,
                invitee_id=target.id,
                invite_type=InviteType.REPLACE,
                status=InviteStatus.PENDING,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=48),
            )
            db.add(inv)

        _send_system_message(db, room_id,
            f"대체 인원 초대가 발송되었습니다. 수락 전까지 채팅방에 남아있어야 합니다.")
        db.commit()
        return {"status": "replace_invited", "message": "대체 인원에게 초대를 보냈습니다."}

    elif payload.leave_type == "forfeit":
        # 보증금 몰수 + 슬롯 비우기 + 미팅 상태 변경
        from app.api.routes.wallet import forfeit_deposit

        # 잔액에서 차감 없이 그냥 몰수 기록 (이미 차감됐음)
        forfeit_deposit(db, user, meeting.id)

        # 슬롯 비우기 + confirmed 리셋
        my_slot.user_id = None
        my_slot.confirmed = False

        # 미팅 상태 RECRUITING 으로 복귀
        meeting.status = MeetingStatus.RECRUITING

        # 남은 멤버들 confirmed 리셋
        all_slots = db.execute(
            select(MeetingSlot).where(MeetingSlot.meeting_id == meeting.id)
        ).scalars().all()
        for s in all_slots:
            if s.user_id is not None:
                s.confirmed = False

        # host가 나가면 재할당
        if meeting.host_user_id == user.id:
            remaining = [s.user_id for s in all_slots if s.user_id is not None]
            if remaining:
                meeting.host_user_id = remaining[0]

        _send_system_message(db, room_id,
            f"한 멤버가 나갔습니다. 미팅이 다시 모집 중 상태로 변경되었습니다.")
        db.commit()
        return {"status": "left", "meeting_status": meeting.status.value}

    else:
        raise HTTPException(400, "leave_type은 'forfeit' 또는 'replace' 여야 합니다.")


# ─── 미팅 일정 설정 (HOST만) ──────────────────────────────────────

@router.post("/chats/{room_id}/schedule")
def set_schedule(
    room_id: int,
    payload: ScheduleIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.get(Meeting, room.meeting_id)

    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if meeting.host_user_id != user.id:
        raise HTTPException(403, "HOST만 일정을 설정할 수 있습니다.")

    # UPSERT
    schedule = db.execute(
        select(MeetingSchedule).where(MeetingSchedule.meeting_id == meeting.id)
    ).scalar_one_or_none()

    is_update = schedule is not None
    if schedule:
        old_info = f"{schedule.date} {schedule.time} {schedule.place}"
        schedule.date = payload.date
        schedule.time = payload.time
        schedule.place = payload.place
        schedule.confirmed = False
        schedule.updated_at = _now()
    else:
        schedule = MeetingSchedule(
            meeting_id=meeting.id,
            date=payload.date,
            time=payload.time,
            place=payload.place,
            confirmed=False,
            updated_at=_now(),
        )
        db.add(schedule)

    # 시스템 메시지 발송
    if is_update:
        msg = (f"📅 미팅 일정이 변경되었습니다.\n"
               f"날짜: {payload.date} | 시간: {payload.time} | 장소: {payload.place}\n"
               f"이 일정에 동의하십니까?")
    else:
        msg = (f"📅 미팅 일정이 확정되었습니다!\n"
               f"날짜: {payload.date} | 시간: {payload.time} | 장소: {payload.place}\n"
               f"이 일정에 동의하십니까?")

    _send_system_message(db, room_id, msg)
    db.commit()

    return {
        "status": "ok",
        "schedule": {
            "date": schedule.date,
            "time": schedule.time,
            "place": schedule.place,
        }
    }


# ─── 미팅 일정 조회 ───────────────────────────────────────────────

@router.get("/meetings/{meeting_id}/schedule")
def get_meeting_schedule(
    meeting_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    schedule = db.execute(
        select(MeetingSchedule).where(MeetingSchedule.meeting_id == meeting_id)
    ).scalar_one_or_none()

    if not schedule:
        return {"schedule": None}

    return {
        "schedule": {
            "date": schedule.date,
            "time": schedule.time,
            "place": schedule.place,
            "confirmed": schedule.confirmed,
        }
    }


# ─── 내 미팅 일정 목록 ────────────────────────────────────────────

@router.get("/me/schedule")
def my_schedules(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """내가 속한 CONFIRMED 미팅들의 일정 목록"""
    my_meeting_ids = db.execute(
        select(MeetingSlot.meeting_id).where(MeetingSlot.user_id == user.id)
    ).scalars().all()

    if not my_meeting_ids:
        return {"schedules": []}

    confirmed_meetings = db.execute(
        select(Meeting).where(
            Meeting.id.in_(my_meeting_ids),
            Meeting.status == MeetingStatus.CONFIRMED,
        )
    ).scalars().all()

    meeting_ids = [m.id for m in confirmed_meetings]

    schedules = db.execute(
        select(MeetingSchedule).where(MeetingSchedule.meeting_id.in_(meeting_ids))
    ).scalars().all()
    schedule_map = {s.meeting_id: s for s in schedules}

    # 채팅방 조회
    from app.models.chat_room import ChatRoom
    rooms = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id.in_(meeting_ids))
    ).scalars().all()
    room_map = {r.meeting_id: r.id for r in rooms}

    return {
        "schedules": [
            {
                "meeting_id": m.id,
                "meeting_type": m.meeting_type.value,
                "chat_room_id": room_map.get(m.id),
                "schedule": {
                    "date": schedule_map[m.id].date if m.id in schedule_map else None,
                    "time": schedule_map[m.id].time if m.id in schedule_map else None,
                    "place": schedule_map[m.id].place if m.id in schedule_map else None,
                    "confirmed": schedule_map[m.id].confirmed if m.id in schedule_map else False,
                }
            }
            for m in confirmed_meetings
        ]
    }
