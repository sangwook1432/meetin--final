"""
MeetingInvitation — 미팅 초대 (친구 초대 / 대체인원 초대)
- invite_type: FRIEND (친구 초대) / REPLACE (대체인원)
- status: PENDING / ACCEPTED / REJECTED / EXPIRED
"""
import enum
from sqlalchemy import Integer, String, Enum, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from app.db.base import Base


class InviteType(str, enum.Enum):
    FRIEND = "FRIEND"     # 미팅 만들 때 친구 초대
    REPLACE = "REPLACE"   # 채팅방 대체인원 초대


class InviteStatus(str, enum.Enum):
    PENDING = "PENDING"
    DEPOSIT_PENDING = "DEPOSIT_PENDING"  # 대체인원 수락 후 매칭권 납부 대기 상태
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class MeetingInvitation(Base):
    __tablename__ = "meeting_invitations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    inviter_id: Mapped[int] = mapped_column(Integer, nullable=False)   # 초대한 사람
    invitee_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)  # 초대받은 사람
    invite_type: Mapped[InviteType] = mapped_column(
        Enum(InviteType, name="invite_type_enum"), nullable=False
    )
    status: Mapped[InviteStatus] = mapped_column(
        Enum(InviteStatus, name="invite_status_enum"),
        default=InviteStatus.PENDING, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("meeting_id", "invitee_id", "invite_type", name="uq_meeting_invite"),
    )
