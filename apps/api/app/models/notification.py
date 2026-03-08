"""
Notification — 사용자 알림 모델

알림 유형(noti_type):
  - FRIEND_REQUEST    : 친구 신청 받음
  - FRIEND_ACCEPTED   : 친구 신청 수락됨
  - MEETING_INVITE    : 미팅 슬롯 초대 (친구/대타)
  - MEETING_CONFIRMED : 미팅 확정 (전원 확정)
  - SLOT_VACANCY      : 같은 성별 빈자리 생겼음 (나가기 발생 시)
  - DEPOSIT_REFUNDED  : 보증금 환불됨
  - SYSTEM            : 시스템 공지
"""

import enum
from sqlalchemy import Integer, String, Boolean, Enum, ForeignKey, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class NotiType(str, enum.Enum):
    FRIEND_REQUEST    = "FRIEND_REQUEST"
    FRIEND_ACCEPTED   = "FRIEND_ACCEPTED"
    MEETING_INVITE    = "MEETING_INVITE"
    MEETING_CONFIRMED = "MEETING_CONFIRMED"
    SLOT_VACANCY      = "SLOT_VACANCY"
    DEPOSIT_REFUNDED  = "DEPOSIT_REFUNDED"
    SYSTEM            = "SYSTEM"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # 알림 받는 유저
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    noti_type: Mapped[NotiType] = mapped_column(
        Enum(NotiType, name="noti_type_enum"),
        nullable=False,
        index=True,
    )

    # 알림 제목 / 본문
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # 연관 데이터 (선택)
    related_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    related_meeting_id: Mapped[int | None] = mapped_column(
        ForeignKey("meetings.id", ondelete="SET NULL"),
        nullable=True,
    )
    related_friend_id: Mapped[int | None] = mapped_column(
        ForeignKey("friends.id", ondelete="SET NULL"),
        nullable=True,
    )

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
