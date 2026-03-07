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


class ChatSendIn(BaseModel):
    content: str


class ChatMessageOut(BaseModel):
    id: int
    room_id: int
    sender_user_id: int
    content: str
    created_at: datetime


@router.get("/chats")
def list_chats(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    내가 속한 meeting들의 chat_room 리스트
    (meeting_slots 기반)
    """
    meeting_ids = db.execute(
        select(MeetingSlot.meeting_id).where(MeetingSlot.user_id == user.id)
    ).scalars().all()

    if not meeting_ids:
        return {"rooms": []}

    rooms = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id.in_(meeting_ids))
    ).scalars().all()

    return {"rooms": [{"room_id": r.id, "meeting_id": r.meeting_id} for r in rooms]}


@router.get("/chats/{room_id}")
def get_messages(
    room_id: int,
    since_id: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    폴링: since_id 이후 메시지 가져오기
    """
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


@router.post("/chats/{room_id}/messages")
def send_message(
    room_id: int,
    payload: ChatSendIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    메시지 전송
    """
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