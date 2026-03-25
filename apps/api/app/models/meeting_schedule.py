"""
MeetingSchedule — 미팅 일정 (날짜/시간/장소)
- meeting_id 당 하나만 존재 (UPSERT)
- 변경 시 채팅방에 시스템 메시지 자동 발송
"""
from sqlalchemy import Integer, String, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from app.db.base import Base


class MeetingSchedule(Base):
    __tablename__ = "meeting_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    date: Mapped[str | None] = mapped_column(String(20), nullable=True)   # YYYY-MM-DD
    time: Mapped[str | None] = mapped_column(String(10), nullable=True)   # HH:MM
    place: Mapped[str | None] = mapped_column(String(200), nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
