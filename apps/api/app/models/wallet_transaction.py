"""
WalletTransaction — 잔액 거래 내역
- 잔액은 User.balance 에 직접 반영
- 거래 내역은 이 테이블에 append-only 로 기록
"""
import enum
from sqlalchemy import Integer, String, Enum, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from app.db.base import Base


class TxType(str, enum.Enum):
    CHARGE = "CHARGE"           # 잔액 충전 (Toss 결제)
    DEPOSIT_DEDUCT = "DEPOSIT_DEDUCT"  # 보증금 차감 (미팅 확정)
    DEPOSIT_REFUND = "DEPOSIT_REFUND"  # 보증금 환급
    DEPOSIT_FORFEIT = "DEPOSIT_FORFEIT"  # 보증금 몰수 (채팅방 나가기)
    ADMIN_ADJUST = "ADMIN_ADJUST"    # 관리자 수동 조정


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    tx_type: Mapped[TxType] = mapped_column(
        Enum(TxType, name="tx_type_enum"), nullable=False
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)   # 양수=입금, 음수=출금
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)  # 거래 후 잔액
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ref_meeting_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 관련 미팅 ID
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
