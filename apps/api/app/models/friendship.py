"""
Friendship (친구 관계) 모델
- 양방향: (user_id, friend_id) + (friend_id, user_id) 두 행 저장
- status: PENDING / ACCEPTED / BLOCKED
"""
import enum
from sqlalchemy import Integer, String, Enum, DateTime, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from app.db.base import Base


class FriendStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    BLOCKED = "BLOCKED"


class Friendship(Base):
    __tablename__ = "friendships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    requester_id: Mapped[int] = mapped_column(Integer, index=True)   # 요청자
    addressee_id: Mapped[int] = mapped_column(Integer, index=True)   # 수신자
    status: Mapped[FriendStatus] = mapped_column(
        Enum(FriendStatus, name="friend_status_enum"),
        default=FriendStatus.PENDING,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_friendship"),
        Index("ix_friendship_addressee", "addressee_id"),
    )
