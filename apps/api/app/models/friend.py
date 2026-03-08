"""
Friend — 친구 관계 모델

설계:
  - requester_id → addressee_id 방향으로 신청
  - status: PENDING (대기) / ACCEPTED (수락) / REJECTED (거절)
  - 친구 관계는 양방향 (한쪽에만 row 저장, 조회는 양방향으로)
"""

import enum
from sqlalchemy import Integer, Enum, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class FriendStatus(str, enum.Enum):
    PENDING  = "PENDING"   # 신청 대기
    ACCEPTED = "ACCEPTED"  # 수락됨
    REJECTED = "REJECTED"  # 거절됨


class Friend(Base):
    __tablename__ = "friends"
    __table_args__ = (
        # 동일 쌍 중복 신청 방지
        UniqueConstraint("requester_id", "addressee_id", name="uq_friends_pair"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    requester_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    addressee_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    status: Mapped[FriendStatus] = mapped_column(
        Enum(FriendStatus, name="friend_status_enum"),
        default=FriendStatus.PENDING,
        nullable=False,
        index=True,
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
