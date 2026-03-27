import enum
from datetime import datetime, timezone

from sqlalchemy import Integer, String, Text, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TicketTxType(str, enum.Enum):
    PURCHASE      = "PURCHASE"       # 잔액으로 구매
    CONSUME       = "CONSUME"        # 채팅방 개설 시 소모
    REFUND        = "REFUND"         # 대체인원 확정 or 취소투표 시 환급
    WELCOME_BONUS = "WELCOME_BONUS"  # 사전예약 웰컴 보너스
    ADMIN_GRANT   = "ADMIN_GRANT"    # 관리자 무상 지급


class TicketTransaction(Base):
    __tablename__ = "ticket_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tx_type: Mapped[TicketTxType] = mapped_column(Enum(TicketTxType, name="ticket_tx_type_enum"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    tickets_after: Mapped[int] = mapped_column(Integer, nullable=False)
    meeting_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
