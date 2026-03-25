from __future__ import annotations

from sqlalchemy import Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChatReadReceipt(Base):
    __tablename__ = "chat_read_receipts"

    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_read_receipt"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    room_id: Mapped[int] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    last_read_message_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
