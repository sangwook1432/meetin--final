import enum
from sqlalchemy import Integer, Enum, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MeetingType(str, enum.Enum):
    TWO_BY_TWO = "TWO_BY_TWO"
    THREE_BY_THREE = "THREE_BY_THREE"


class MeetingStatus(str, enum.Enum):
    RECRUITING = "RECRUITING"
    FULL = "FULL"
    WAITING_CONFIRM = "WAITING_CONFIRM"
    CONFIRMED = "CONFIRMED"


class Team(str, enum.Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    meeting_type: Mapped[MeetingType] = mapped_column(
        Enum(MeetingType, name="meeting_type_enum"),
        nullable=False,
    )

    status: Mapped[MeetingStatus] = mapped_column(
        Enum(MeetingStatus, name="meeting_status_enum"),
        default=MeetingStatus.RECRUITING,
        index=True,
        nullable=False,
    )

    # ✅ NEW: 타겟 학교 그룹(선호 학교 그룹)
    # - ANY면 preferred_universities_any=True
    # - 특정 학교면 preferred_universities_any=False + preferred_universities_raw="SNU,KU,HYU"
    preferred_universities_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_universities_any: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)