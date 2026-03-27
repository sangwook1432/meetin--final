"""
tickets.py — 매칭권 구매 및 내역 조회

- GET  /tickets/me           : 보유 매칭권 수 + 구매/소모 이력
- POST /tickets/purchase     : 잔액에서 N×2,000원 차감, 매칭권 N개 지급
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from pydantic import BaseModel
from app.core.deps import get_db, require_verified, require_admin
from app.models.user import User
from app.models.ticket_transaction import TicketTransaction, TicketTxType
from app.models.wallet_transaction import WalletTransaction, TxType
from app.services.phone import normalize_phone_kr_to_e164, phone_hmac_hash

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


# ─── 관리자 전용 ──────────────────────────────────────────────────

@router.get("/admin/users/search-by-phone")
def admin_search_user_by_phone(
    phone: str,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """전화번호로 유저 검색 (관리자 전용)."""
    try:
        e164 = normalize_phone_kr_to_e164(phone)
    except ValueError:
        raise HTTPException(400, "올바른 전화번호 형식이 아닙니다.")

    phash = phone_hmac_hash(e164)
    user = db.execute(select(User).where(User.phone_hash == phash)).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "해당 전화번호로 가입된 유저가 없습니다.")

    return {
        "id": user.id,
        "nickname": user.nickname,
        "username": user.username,
        "university": user.university,
        "matching_tickets": user.matching_tickets,
        "phone_last4": user.phone_last4,
    }


class AdminGrantTicketIn(BaseModel):
    user_id: int
    amount: int
    note: str = "관리자 무상 지급"


@router.post("/admin/tickets/grant")
def admin_grant_tickets(
    payload: AdminGrantTicketIn,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """매칭권 무상 지급 (관리자 전용)."""
    if payload.amount < 1 or payload.amount > 100:
        raise HTTPException(400, "지급 수량은 1~100개 사이여야 합니다.")

    user = db.execute(
        select(User).where(User.id == payload.user_id).with_for_update()
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "유저를 찾을 수 없습니다.")

    user.matching_tickets += payload.amount
    db.add(TicketTransaction(
        user_id=user.id,
        tx_type=TicketTxType.ADMIN_GRANT,
        amount=payload.amount,
        tickets_after=user.matching_tickets,
        note=payload.note,
    ))
    db.commit()

    return {
        "user_id": user.id,
        "nickname": user.nickname,
        "matching_tickets": user.matching_tickets,
        "granted": payload.amount,
    }
