from sqlalchemy import Integer, ForeignKey, Enum, UniqueConstraint, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.models.meeting import Team

class MeetingSlot(Base):
    __tablename__ = "meeting_slots"

    __table_args__ = (
        UniqueConstraint("meeting_id", "team", "slot_index", name="uq_slot_position"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)

    team: Mapped[Team] = mapped_column(Enum(Team, name="meeting_team_enum"), nullable=False)

    slot_index: Mapped[int] = mapped_column(Integer, nullable=False)

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)