"""
tickets.py — 매칭권 구매 및 내역 조회

- GET  /tickets/me           : 보유 매칭권 수 + 구매/소모 이력
- POST /tickets/purchase     : 잔액에서 N×2,000원 차감, 매칭권 N개 지급
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.deps import get_db, require_verified
from app.models.user import User
from app.models.ticket_transaction import TicketTransaction, TicketTxType
from app.models.wallet_transaction import WalletTransaction, TxType

router = APIRouter()

TICKET_PRICE = 2_000   # 매칭권 1개 가격 (원)
ALLOWED_COUNTS = {1, 3, 5, 10, 15, 20}


@router.get("/tickets/me")
def get_my_tickets(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    txs = db.execute(
        select(TicketTransaction)
        .where(TicketTransaction.user_id == user.id)
        .order_by(TicketTransaction.id.desc())
        .limit(100)
    ).scalars().all()

    return {
        "tickets": user.matching_tickets,
        "transactions": [
            {
                "id": t.id,
                "tx_type": t.tx_type.value,
                "amount": t.amount,
                "tickets_after": t.tickets_after,
                "meeting_id": t.meeting_id,
                "note": t.note,
                "created_at": t.created_at,
            }
            for t in txs
        ],
    }


@router.post("/tickets/purchase")
def purchase_tickets(
    count: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    if count not in ALLOWED_COUNTS:
        raise HTTPException(400, f"구매 수량은 {sorted(ALLOWED_COUNTS)} 중 하나여야 합니다.")

    total_cost = count * TICKET_PRICE

    db_user = db.execute(
        select(User).where(User.id == user.id).with_for_update()
    ).scalar_one()

    if db_user.balance < total_cost:
        raise HTTPException(
            400,
            f"잔액이 부족합니다. 현재 잔액: {db_user.balance:,}원 / 필요 금액: {total_cost:,}원",
        )

    # 잔액 차감
    db_user.balance -= total_cost
    db.add(WalletTransaction(
        user_id=db_user.id,
        tx_type=TxType.TICKET_PURCHASE,
        amount=-total_cost,
        balance_after=db_user.balance,
        note=f"매칭권 {count}개 구매",
    ))

    # 매칭권 지급
    db_user.matching_tickets += count
    db.add(TicketTransaction(
        user_id=db_user.id,
        tx_type=TicketTxType.PURCHASE,
        amount=count,
        tickets_after=db_user.matching_tickets,
        note=f"매칭권 {count}개 구매 ({total_cost:,}원)",
    ))

    db.commit()
    return {
        "tickets": db_user.matching_tickets,
        "balance": db_user.balance,
        "purchased": count,
    }
