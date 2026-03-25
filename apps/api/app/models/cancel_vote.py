from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CancelVote(Base):
    __tablename__ = "cancel_votes"

    __table_args__ = (
        UniqueConstraint("meeting_id", "user_id", name="uq_cancel_vote"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    voted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
