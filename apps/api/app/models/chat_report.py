import enum
from datetime import datetime, timezone

from sqlalchemy import Integer, Text, Enum, ForeignKey, Index
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReportReason(str, enum.Enum):
    SEXUAL_CONTENT = "SEXUAL_CONTENT"
    HARASSMENT     = "HARASSMENT"
    SPAM           = "SPAM"
    OTHER          = "OTHER"


class ReportStatus(str, enum.Enum):
    PENDING   = "PENDING"
    CONFIRMED = "CONFIRMED"
    REJECTED  = "REJECTED"


class ChatReport(Base):
    __tablename__ = "chat_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # FK 없이 plain int — 채팅방/미팅이 삭제된 후에도 신고 이력 보존
    room_id:    Mapped[int | None] = mapped_column(Integer, nullable=True)
    meeting_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 유저 탈퇴 시 NULL 처리
    reporter_user_id:  Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reported_user_id:  Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # 증거 메시지 — FK 없이 보존 (메시지 삭제 후에도 내용 스냅샷 유지)
    evidence_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    evidence_content:    Mapped[str | None] = mapped_column(Text, nullable=True)

    reason: Mapped[ReportReason] = mapped_column(
        Enum(ReportReason, name="report_reason_enum"), nullable=False
    )
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus, name="report_status_enum"),
        nullable=False,
        default=ReportStatus.PENDING,
    )
    admin_note:   Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_chat_reports_status",            "status"),
        Index("ix_chat_reports_reporter_user_id",  "reporter_user_id"),
        Index("ix_chat_reports_reported_user_id",  "reported_user_id"),
    )
