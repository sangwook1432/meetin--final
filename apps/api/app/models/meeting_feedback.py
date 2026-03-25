from datetime import datetime, timezone
from sqlalchemy import Integer, Boolean, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class MeetingFeedback(Base):
    __tablename__ = "meeting_feedbacks"

    __table_args__ = (
        UniqueConstraint("meeting_id", "user_id", name="uq_feedback_meeting_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_satisfied: Mapped[bool] = mapped_column(Boolean, nullable=False)
    complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
