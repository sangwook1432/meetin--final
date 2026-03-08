"""
MeetingSchedule — 미팅 일정 제안/확정 모델

호스트가 날짜/장소를 제안하면 채팅에 SCHEDULE_PROPOSE 메시지가 남고,
이 테이블에도 기록됨. 구성원들이 동의하면 CONFIRMED 상태로 변경.
"""
import enum
from sqlalchemy import Integer, String, Enum, ForeignKey, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class ScheduleStatus(str, enum.Enum):
    PROPOSED  = "PROPOSED"   # 제안됨 (호스트)
    CONFIRMED = "CONFIRMED"  # 확정
    CANCELLED = "CANCELLED"  # 취소


class MeetingSchedule(Base):
    __tablename__ = "meeting_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    proposed_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # 제안 일시/장소/메모
    scheduled_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[ScheduleStatus] = mapped_column(
        Enum(ScheduleStatus, name="schedule_status_enum"),
        default=ScheduleStatus.PROPOSED,
        nullable=False,
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
