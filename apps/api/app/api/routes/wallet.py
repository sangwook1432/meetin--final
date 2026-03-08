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
from app.models.wallet_transaction import WalletTransaction, TxType # 경로가 다르면 맞게 수정하세요

router = APIRouter()

DEPOSIT_AMOUNT = 10_000  # 보증금 10,000원


# ─── Schemas ─────────────────────────────────────────────────────

class ChargeIn(BaseModel):
    order_id: str
    payment_key: str
    amount: int


# ─── Helpers ─────────────────────────────────────────────────────

def _record_tx(
    db: Session, 
    user_id: int, 
    tx_type: TxType, 
    amount: int,
    balance_after: int, 
    note: str, 
    meeting_id: int | None = None,
    toss_order_id: str | None = None,
    toss_payment_key: str | None = None
):
    """DB 모델 구조에 맞게 기록 함수 업데이트 (description -> note, ref_meeting_id -> meeting_id)"""
    tx = WalletTransaction(
        user_id=user_id,
        tx_type=tx_type,
        amount=amount,
        balance_after=balance_after,
        note=note,
        meeting_id=meeting_id,
        toss_order_id=toss_order_id,
        toss_payment_key=toss_payment_key
    )
    db.add(tx)


def deduct_deposit(db: Session, user: User, meeting_id: int) -> None:
    """미팅 확정 시 보증금 차감 (외부에서 호출)"""
    if user.balance < DEPOSIT_AMOUNT:
        raise HTTPException(400, f"잔액이 부족합니다. 현재 잔액: {user.balance:,}원 / 보증금: {DEPOSIT_AMOUNT:,}원")
    user.balance -= DEPOSIT_AMOUNT
    _record_tx(
        db=db, user_id=user.id, tx_type=TxType.DEPOSIT_HOLD, amount=-DEPOSIT_AMOUNT,
        balance_after=user.balance, note=f"미팅 #{meeting_id} 보증금 예치", meeting_id=meeting_id
    )


def refund_deposit(db: Session, user: User, meeting_id: int) -> None:
    """보증금 환급"""
    user.balance += DEPOSIT_AMOUNT
    _record_tx(
        db=db, user_id=user.id, tx_type=TxType.DEPOSIT_REFUND, amount=DEPOSIT_AMOUNT,
        balance_after=user.balance, note=f"미팅 #{meeting_id} 보증금 환급", meeting_id=meeting_id
    )


def forfeit_deposit(db: Session, user: User, meeting_id: int) -> None:
    """보증금 몰수 (채팅방 나가기) - TxType은 임의로 HOLD 유지 혹은 별도 타입 지정 가능"""
    # 임시로 ADMIN_ADJUST를 사용하거나 TxType에 FORFEIT을 추가하는 것이 좋습니다.
    _record_tx(
        db=db, user_id=user.id, tx_type=TxType.ADMIN_ADJUST, amount=0,
        balance_after=user.balance, note=f"미팅 #{meeting_id} 보증금 몰수 (나가기)", meeting_id=meeting_id
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
    중복 처리 방지: toss_order_id 로 기존 거래 확실하게 확인.
    """
    # 💡 수정된 부분: 정확히 toss_order_id 컬럼으로 중복 결제 검사
    existing = db.execute(
        select(WalletTransaction).where(
            WalletTransaction.user_id == user.id,
            WalletTransaction.toss_order_id == payload.order_id,
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
    
    # 💡 수정된 부분: note, toss_order_id, toss_payment_key 파라미터 전달
    _record_tx(
        db=db, 
        user_id=db_user.id, 
        tx_type=TxType.CHARGE, 
        amount=payload.amount,
        balance_after=db_user.balance, 
        note=f"잔액 충전",
        toss_order_id=payload.order_id,
        toss_payment_key=payload.payment_key
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

    # 💡 수정된 부분: 반환되는 JSON 필드 이름을 프론트엔드가 쓰기 좋게 매핑 (description -> note 등)
    return {
        "balance": user.balance,
        "transactions": [
            {
                "id": t.id,
                "tx_type": t.tx_type.value,
                "amount": t.amount,
                "balance_after": t.balance_after,
                "note": t.note,
                "meeting_id": t.meeting_id,
                "toss_order_id": t.toss_order_id,
                "created_at": t.created_at,
            }
            for t in txs
        ]
    }