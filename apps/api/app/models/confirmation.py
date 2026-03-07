from sqlalchemy import Integer, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Confirmation(Base):
    __tablename__ = "confirmations"

    __table_args__ = (
        UniqueConstraint("meeting_id", "user_id", name="uq_confirmation_meeting_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"),
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )