"""
WalletTransaction — 사용자 지갑 잔액 변동 내역
"""
import enum
from sqlalchemy import Integer, String, Enum, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base

class TxType(str, enum.Enum):
    CHARGE         = "CHARGE"           # 토스 결제로 잔액 충전
    DEPOSIT_HOLD   = "DEPOSIT_HOLD"     # 미팅 보증금 차감 (잔액 → 예치)
    DEPOSIT_REFUND = "DEPOSIT_REFUND"   # 보증금 환불 (예치 → 잔액)
    WITHDRAW       = "WITHDRAW"         # 잔액 반환 출금 신청
    WITHDRAW_DONE  = "WITHDRAW_DONE"    # 출금 완료 확정 (운영자)
    ADMIN_ADJUST   = "ADMIN_ADJUST"     # 운영자 수동 조정

class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)

    tx_type: Mapped[TxType] = mapped_column(
        Enum(TxType, name="wallet_tx_type_enum"),
        nullable=False,
        index=True,
    )

    meeting_id: Mapped[int | None] = mapped_column(
        ForeignKey("meetings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    toss_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    toss_payment_key: Mapped[str | None] = mapped_column(String(200), nullable=True)

    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )