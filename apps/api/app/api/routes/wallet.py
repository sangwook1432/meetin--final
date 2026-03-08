"""
wallet.py — 잔액 관리 + 결제 내역

설계:
  - 보증금은 user.balance 에서 차감 (Toss 결제는 잔액 충전 전용)
  - 거래 내역은 wallet_transactions 테이블에 기록
  - 잔액 충전: POST /wallet/charge (Toss 결제 성공 후 서버에서 호출)
  - 잔액 조회: GET  /wallet/me
  - 거래 내역: GET  /wallet/transactions
"""
from __future__ import annotations

import uuid
import base64
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import get_db, require_verified
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, TxType

router = APIRouter()

DEPOSIT_AMOUNT = 10_000  # 보증금 10,000원


# ─── Schemas ─────────────────────────────────────────────────────

class ChargeIn(BaseModel):
    order_id: str
    payment_key: str
    amount: int


# ─── Helpers ─────────────────────────────────────────────────────

def _record_tx(db: Session, user_id: int, tx_type: TxType, amount: int,
               balance_after: int, description: str, ref_meeting_id: int | None = None):
    tx = WalletTransaction(
        user_id=user_id,
        tx_type=tx_type,
        amount=amount,
        balance_after=balance_after,
        description=description,
        ref_meeting_id=ref_meeting_id,
    )
    db.add(tx)


def deduct_deposit(db: Session, user: User, meeting_id: int) -> None:
    """미팅 확정 시 보증금 차감 (외부에서 호출)"""
    if user.balance < DEPOSIT_AMOUNT:
        raise HTTPException(400, f"잔액이 부족합니다. 현재 잔액: {user.balance:,}원 / 보증금: {DEPOSIT_AMOUNT:,}원")
    user.balance -= DEPOSIT_AMOUNT
    _record_tx(
        db, user.id, TxType.DEPOSIT_DEDUCT, -DEPOSIT_AMOUNT,
        user.balance, f"미팅 #{meeting_id} 보증금 차감", meeting_id
    )


def refund_deposit(db: Session, user: User, meeting_id: int) -> None:
    """보증금 환급"""
    user.balance += DEPOSIT_AMOUNT
    _record_tx(
        db, user.id, TxType.DEPOSIT_REFUND, DEPOSIT_AMOUNT,
        user.balance, f"미팅 #{meeting_id} 보증금 환급", meeting_id
    )


def forfeit_deposit(db: Session, user: User, meeting_id: int) -> None:
    """보증금 몰수 (채팅방 나가기)"""
    _record_tx(
        db, user.id, TxType.DEPOSIT_FORFEIT, 0,
        user.balance, f"미팅 #{meeting_id} 보증금 몰수 (나가기)", meeting_id
    )


# ─── 잔액 충전 준비 (Toss 주문 생성) ─────────────────────────────

@router.post("/wallet/charge/prepare")
def prepare_charge(
    amount: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """Toss 위젯 결제 시작 전 주문 ID 생성"""
    if amount < 1000 or amount > 500_000:
        raise HTTPException(400, "충전 금액은 1,000원 ~ 500,000원 사이여야 합니다.")
    order_id = f"CHG-{uuid.uuid4().hex[:16].upper()}"
    return {
        "orderId": order_id,
        "amount": amount,
        "orderName": f"MEETIN 잔액 충전 {amount:,}원",
    }


# ─── 잔액 충전 확정 (Toss 결제 성공 콜백) ─────────────────────────

@router.post("/wallet/charge/confirm")
def confirm_charge(
    payload: ChargeIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    Toss 결제 성공 후 서버에서 실제 잔액 증가.
    중복 처리 방지: order_id 로 기존 거래 확인.
    """
    # 중복 방지
    existing = db.execute(
        select(WalletTransaction).where(
            WalletTransaction.user_id == user.id,
            WalletTransaction.description.contains(payload.order_id),
        )
    ).scalar_one_or_none()
    if existing:
        return {"status": "already_charged", "balance": user.balance}

    # Toss 실결제 검증 (key 있을 때만)
    if settings.toss_secret_key and payload.payment_key:
        creds = base64.b64encode(f"{settings.toss_secret_key}:".encode()).decode()
        import httpx
        try:
            resp = httpx.post(
                "https://api.tosspayments.com/v1/payments/confirm",
                headers={"Authorization": f"Basic {creds}", "Content-Type": "application/json"},
                json={"orderId": payload.order_id, "paymentKey": payload.payment_key, "amount": payload.amount},
                timeout=10.0,
            )
            if resp.status_code != 200:
                data = resp.json()
                raise HTTPException(400, data.get("message", "Toss 결제 실패"))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"Toss API 오류: {e}")

    # 잔액 증가
    db_user = db.execute(
        select(User).where(User.id == user.id).with_for_update()
    ).scalar_one()
    db_user.balance += payload.amount
    _record_tx(
        db, db_user.id, TxType.CHARGE, payload.amount,
        db_user.balance, f"잔액 충전 (주문: {payload.order_id})"
    )
    db.commit()
    return {"status": "charged", "balance": db_user.balance}


# ─── 잔액 조회 ────────────────────────────────────────────────────

@router.get("/wallet/me")
def my_wallet(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    return {
        "balance": user.balance,
        "deposit_amount": DEPOSIT_AMOUNT,
        "can_afford": user.balance >= DEPOSIT_AMOUNT,
    }


# ─── 거래 내역 ────────────────────────────────────────────────────

@router.get("/wallet/transactions")
def wallet_transactions(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    txs = db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.user_id == user.id)
        .order_by(WalletTransaction.id.desc())
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    return {
        "balance": user.balance,
        "transactions": [
            {
                "id": t.id,
                "tx_type": t.tx_type.value,
                "amount": t.amount,
                "balance_after": t.balance_after,
                "description": t.description,
                "ref_meeting_id": t.ref_meeting_id,
                "created_at": t.created_at,
            }
            for t in txs
        ]
    }
