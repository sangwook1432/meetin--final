import enum
from sqlalchemy import Integer, String, Enum, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class DepositStatus(str, enum.Enum):
    REQUIRED = "REQUIRED"               # 확정 전(결제 필요)
    PENDING = "PENDING"                 # 결제 시작(prepare 이후)
    HELD = "HELD"                       # 토스 승인 완료(예치)
    REFUND_PENDING = "REFUND_PENDING"   # 환불 처리 중 (leave 트리거)
    REFUNDED = "REFUNDED"               # 환급 완료
    FORFEITED = "FORFEITED"             # 몰수(노쇼)
    CANCELED = "CANCELED"               # 취소/실패/만료
    FAILED_REFUND = "FAILED_REFUND"     # 환불 실패 (MAX_RETRY 초과 → 수동 처리 필요)


class Deposit(Base):
    __tablename__ = "deposits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    amount: Mapped[int] = mapped_column(Integer, default=5000)

    status: Mapped[DepositStatus] = mapped_column(
        Enum(DepositStatus, name="deposit_status_enum"),
        default=DepositStatus.PENDING,
        index=True,
    )

    # Toss identifiers (서버 검증용)
    toss_order_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    toss_payment_key: Mapped[str | None] = mapped_column(String(200), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())