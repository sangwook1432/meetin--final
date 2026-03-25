from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Index  # ForeignKey used for room_id
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    room_id: Mapped[int] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False
    )
    sender_user_id: Mapped[int] = mapped_column(
        Integer, nullable=False
    )  # 0 = 시스템 메시지 (FK 제약 없음)

    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    client_message_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        Index("ix_chat_messages_room_id_id", "room_id", "id"),
        Index(
            "ix_chat_messages_sender_client_id",
            "sender_user_id", "client_message_id",
            unique=True,
            postgresql_where="client_message_id IS NOT NULL",
        ),
    )