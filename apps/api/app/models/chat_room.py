from sqlalchemy import Integer, ForeignKey, UniqueConstraint, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class ChatRoom(Base):
    __tablename__ = "chat_rooms"

    __table_args__ = (
        UniqueConstraint("meeting_id", name="uq_chat_room_meeting"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )