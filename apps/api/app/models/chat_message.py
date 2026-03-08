from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, Index, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChatMsgType(str, enum.Enum):
    NORMAL           = "NORMAL"            # 일반 메시지
    SYSTEM           = "SYSTEM"            # 시스템 알림 (누가 참가/탈퇴 등)
    SCHEDULE_PROPOSE = "SCHEDULE_PROPOSE"  # 일정 제안
    CANCEL_REQUEST   = "CANCEL_REQUEST"    # 취소 요청


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    room_id: Mapped[int] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False
    )
    sender_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)
    msg_type: Mapped[ChatMsgType] = mapped_column(
        Enum(ChatMsgType, name="chat_msg_type_enum"),
        default=ChatMsgType.NORMAL,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_chat_messages_room_id_id", "room_id", "id"),
    )