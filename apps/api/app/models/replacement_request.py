from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReplacementStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    CANCELED = "CANCELED"


class ReplacementRequest(Base):
    __tablename__ = "replacement_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)

    leaver_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    candidate_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    status: Mapped[ReplacementStatus] = mapped_column(
        SAEnum(ReplacementStatus, name="replacement_status_enum"),
        nullable=False,
        default=ReplacementStatus.PENDING,
    )

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        # leaver는 meeting당 최대 2회 시도: (meeting_id, leaver_user_id, attempt_no) 유니크
        UniqueConstraint("meeting_id", "leaver_user_id", "attempt_no", name="uq_replacement_attempt"),
        # 후보자 조회/관리용 인덱스
        Index("ix_replacement_meeting_id", "meeting_id"),
        Index("ix_replacement_candidate_user_id", "candidate_user_id"),
    )