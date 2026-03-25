import enum
from datetime import datetime, timezone
from sqlalchemy import Integer, String, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class NotifType(str, enum.Enum):
    MEETING_CANCELLED = "MEETING_CANCELLED"
    MEETING_COMPLETED = "MEETING_COMPLETED"
    WAITING_CONFIRM = "WAITING_CONFIRM"
    AFTER_REQUEST_RECEIVED = "AFTER_REQUEST_RECEIVED"
    CHAT_ROOM_ACTIVATED = "CHAT_ROOM_ACTIVATED"
    ACCOUNT_PENALTY = "ACCOUNT_PENALTY"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    notif_type: Mapped[NotifType] = mapped_column(SAEnum(NotifType, name="notif_type_enum"), nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False)
    meeting_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    send_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
