"""
wallet.py — 잔액 관리 + 결제 내역

설계:
  - 보증금은 user.balance 에서 차감 (Toss 결제는 잔액 충전 전용)
  - 거래 내역은 wallet_transactions 테이블에 기록
  - 잔액 충전: POST /wallet/charge (Toss 결제 성공 후 서버에서 호출)
  - 잔액 조회: GET  /wallet/me
  - 거래 내역: GET  /wallet/transactions
"""
import uuid
import base64
from typing import Optional

import functools

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    def _rate_limit(limit: str):
        return _limiter.limit(limit)
except ImportError:
    def _rate_limit(limit: str):  # type: ignore[misc]
        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                return func(*args, **kwargs)
            return wrapper
        return decorator

from app.core.config import settings
from app.core.deps import get_db, require_verified, require_admin
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, TxType # 경로가 다르면 맞게 수정하세요

router = APIRouter()

DEPOSIT_AMOUNT    = 10_000  # 보증금 10,000원
WITHDRAW_FEE_RATE = 0.10    # 일반환불 수수료 10%
WITHDRAW_MIN_FEE  = 1_000   # 수수료 최솟값 1,000원


# ─── Schemas ─────────────────────────────────────────────────────

class ChargeIn(BaseModel):
    order_id: str
    payment_key: str
    amount: int = Field(gt=0, le=500_000)


class BankAccountIn(BaseModel):
    bank_name: str
    account_number: str
    account_holder: str


class WithdrawIn(BaseModel):
    amount: int = Field(gt=0, le=1_000_000)


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
        raise HTTPException(400, f"잔액이 부족합니다. 현재 잔액: {user.balance:,}원")
    user.balance -= DEPOSIT_AMOUNT
    _record_tx(
        db=db, user_id=user.id, tx_type=TxType.DEPOSIT_HOLD, amount=-DEPOSIT_AMOUNT,
        balance_after=user.balance, note=f"미팅 #{meeting_id} 매칭권 소모", meeting_id=meeting_id
    )


def refund_deposit(db: Session, user: User, meeting_id: int) -> None:
    """보증금 환급"""
    user.balance += DEPOSIT_AMOUNT
    _record_tx(
        db=db, user_id=user.id, tx_type=TxType.DEPOSIT_REFUND, amount=DEPOSIT_AMOUNT,
        balance_after=user.balance, note=f"미팅 #{meeting_id} 매칭권 환급", meeting_id=meeting_id
    )


def forfeit_deposit(db: Session, user: User, meeting_id: int) -> None:
    """보증금 몰수 (채팅방 이탈/노쇼)"""
    _record_tx(
        db=db, user_id=user.id, tx_type=TxType.FORFEIT, amount=0,
        balance_after=user.balance, note=f"미팅 #{meeting_id} 보증금 몰수 (이탈)", meeting_id=meeting_id
    )


# ─── 매칭권 헬퍼 ──────────────────────────────────────────────────

def consume_ticket(db: Session, user: User, meeting_id: int) -> None:
    """채팅방 개설 시 매칭권 1개 소모"""
    from app.models.ticket_transaction import TicketTransaction, TicketTxType
    if user.matching_tickets < 1:
        raise HTTPException(400, f"매칭권이 없습니다 (유저 #{user.id})")
    user.matching_tickets -= 1
    db.add(TicketTransaction(
        user_id=user.id,
        tx_type=TicketTxType.CONSUME,
        amount=-1,
        tickets_after=user.matching_tickets,
        meeting_id=meeting_id,
        note=f"미팅 #{meeting_id} 채팅방 개설 소모",
    ))


def refund_ticket(db: Session, user: User, meeting_id: int) -> None:
    """매칭권 1개 환급"""
    from app.models.ticket_transaction import TicketTransaction, TicketTxType
    user.matching_tickets += 1
    db.add(TicketTransaction(
        user_id=user.id,
        tx_type=TicketTxType.REFUND,
        amount=1,
        tickets_after=user.matching_tickets,
        meeting_id=meeting_id,
        note=f"미팅 #{meeting_id} 매칭권 환급",
    ))


def forfeit_ticket(db: Session, user: User, meeting_id: int) -> None:
    """몰수 (환급 없음) — 티켓은 이미 채팅방 개설 시 소모됨. 추가 차감 없음."""
    pass


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

    # Toss 실결제 검증 (운영 키 설정 시 항상 검증 — payment_key 유무와 무관)
    if settings.toss_secret_key:
        if not payload.payment_key:
            raise HTTPException(400, "payment_key가 누락되었습니다.")
        creds = base64.b64encode(f"{settings.toss_secret_key}:".encode()).decode()
        import httpx
        try:
            print(f"🔍 Toss confirm 요청: paymentKey={payload.payment_key!r}, orderId={payload.order_id!r}, amount={payload.amount}")
            resp = httpx.post(
                "https://api.tosspayments.com/v1/payments/confirm",
                headers={"Authorization": f"Basic {creds}", "Content-Type": "application/json"},
                json={"orderId": payload.order_id, "paymentKey": payload.payment_key, "amount": payload.amount},
                timeout=10.0,
            )
            if resp.status_code != 200:
                print("🚨 토스가 거절한 이유:", resp.text)
                data = resp.json()
                raise HTTPException(400, data.get("message", "Toss 결제 실패"))
            # Toss 응답의 실제 승인 금액이 요청 금액과 일치하는지 서버에서도 검증
            toss_data = resp.json()
            approved_amount = toss_data.get("totalAmount") or toss_data.get("amount")
            if approved_amount is not None and approved_amount != payload.amount:
                raise HTTPException(400, "결제 금액이 일치하지 않습니다.")
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
        "matching_tickets": user.matching_tickets,
        "can_afford": user.matching_tickets >= 1,
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
                "note": t.note,
                "meeting_id": t.meeting_id,
                "toss_order_id": t.toss_order_id,
                "created_at": t.created_at,
            }
            for t in txs
        ]
    }


# ─── 계좌 조회 ────────────────────────────────────────────────────

@router.get("/me/bank-account")
def get_bank_account(user=Depends(require_verified)):
    return {
        "bank_name": user.bank_name,
        "account_number": user.account_number,
        "account_holder": user.account_holder,
    }


# ─── 계좌 등록/수정 ───────────────────────────────────────────────

@router.patch("/me/bank-account")
def update_bank_account(
    payload: BankAccountIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    if not payload.bank_name.strip():
        raise HTTPException(400, "은행명을 입력해주세요.")
    if not payload.account_number.strip():
        raise HTTPException(400, "계좌번호를 입력해주세요.")
    if not payload.account_holder.strip():
        raise HTTPException(400, "예금주명을 입력해주세요.")

    db_user = db.execute(
        select(User).where(User.id == user.id)
    ).scalar_one()
    db_user.bank_name = payload.bank_name.strip()
    db_user.account_number = payload.account_number.strip()
    db_user.account_holder = payload.account_holder.strip()
    db.commit()
    return {"status": "updated"}


# ─── 출금 신청 ────────────────────────────────────────────────────

def _calc_withdraw_fee(amount: int, is_cheongyak: bool) -> tuple[int, int]:
    """(fee, net_amount) 반환. 청약철회 시 fee=0."""
    if is_cheongyak:
        return 0, amount
    fee = max(int(amount * WITHDRAW_FEE_RATE), WITHDRAW_MIN_FEE)
    return fee, amount - fee


def _is_cheongyak(db: Session, user_id: int) -> bool:
    """
    청약철회 해당 여부.
    조건: 마지막 CHARGE가 7일 이내 AND 그 이후 TICKET_PURCHASE/DEPOSIT_HOLD 없음.
    """
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)

    last_charge = db.execute(
        select(WalletTransaction)
        .where(
            WalletTransaction.user_id == user_id,
            WalletTransaction.tx_type == TxType.CHARGE,
        )
        .order_by(WalletTransaction.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    if not last_charge:
        return False

    charge_time = last_charge.created_at
    if charge_time.tzinfo is None:
        charge_time = charge_time.replace(tzinfo=timezone.utc)
    if charge_time < now - timedelta(days=7):
        return False

    usage = db.execute(
        select(WalletTransaction)
        .where(
            WalletTransaction.user_id == user_id,
            WalletTransaction.tx_type.in_([TxType.TICKET_PURCHASE, TxType.DEPOSIT_HOLD]),
            WalletTransaction.created_at > last_charge.created_at,
        )
        .limit(1)
    ).scalar_one_or_none()

    return usage is None


def _parse_fee_net(note: str | None, fallback_amount: int) -> tuple[int, int]:
    """note에서 [FEE:N|NET:N] 파싱. 없으면 (0, fallback_amount)."""
    import re
    if note:
        m = re.match(r'\[FEE:(\d+)\|NET:(\d+)\]', note)
        if m:
            return int(m.group(1)), int(m.group(2))
    return 0, fallback_amount


@router.get("/wallet/withdraw/preview")
def withdraw_preview(
    amount: int = Query(..., gt=0),
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """출금 전 수수료 미리보기."""
    is_ck = _is_cheongyak(db, user.id)
    fee, net = _calc_withdraw_fee(amount, is_ck)
    eligible = is_ck or net >= WITHDRAW_MIN_FEE
    return {
        "refund_type": "청약철회" if is_ck else "일반환불",
        "fee": fee,
        "net_amount": net,
        "eligible": eligible,
        "reason": "충전 후 7일 이내 미사용" if is_ck else f"수수료 10% (최소 {WITHDRAW_MIN_FEE:,}원)",
    }


@router.post("/wallet/withdraw")
@_rate_limit("10/minute")
def request_withdraw(
    request: Request,
    payload: WithdrawIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    잔액 출금 신청.
    - 잔액에서 즉시 차감 (WITHDRAW 내역 기록)
    - 관리자가 실제 이체 후 WITHDRAW_DONE 처리
    - 관리자가 반려 시 ADMIN_ADJUST로 잔액 복원
    """
    if payload.amount > 1_000_000:
        raise HTTPException(400, "1회 최대 출금액은 1,000,000원입니다.")

    db_user = db.execute(
        select(User).where(User.id == user.id).with_for_update()
    ).scalar_one()

    if not db_user.bank_name or not db_user.account_number:
        raise HTTPException(400, "출금 계좌를 먼저 등록해주세요. (내 지갑 → 계좌 등록)")

    if db_user.balance < payload.amount:
        raise HTTPException(400, f"잔액이 부족합니다. 현재 잔액: {db_user.balance:,}원")

    is_ck = _is_cheongyak(db, db_user.id)
    fee, net = _calc_withdraw_fee(payload.amount, is_ck)

    if net < WITHDRAW_MIN_FEE and not is_ck:
        raise HTTPException(400, f"수수료({fee:,}원) 차감 후 실입금액({net:,}원)이 최소 기준(1,000원) 미만입니다.")

    refund_type = "청약철회" if is_ck else "일반환불"
    note = (
        f"[FEE:{fee}|NET:{net}] "
        f"{db_user.bank_name} {db_user.account_number} ({db_user.account_holder}) "
        f"출금신청 ({refund_type})"
    )

    db_user.balance -= payload.amount
    _record_tx(
        db=db,
        user_id=db_user.id,
        tx_type=TxType.WITHDRAW,
        amount=-payload.amount,
        balance_after=db_user.balance,
        note=note,
    )
    db.commit()
    return {
        "status": "requested",
        "balance": db_user.balance,
        "fee": fee,
        "net_amount": net,
        "refund_type": refund_type,
    }


# ─── 관리자: 출금 신청 목록 ───────────────────────────────────────

@router.get("/admin/withdrawals")
def list_withdrawals(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """관리자: 미처리 출금 신청 목록 (완료/반려된 건 제외)"""
    # 완료 또는 반려된 tx_id 수집 (note = "tx#123 출금 완료" / "tx#123 출금 반려...")
    processed_notes = db.execute(
        select(WalletTransaction.note).where(
            WalletTransaction.tx_type.in_([TxType.WITHDRAW_DONE, TxType.ADMIN_ADJUST]),
            WalletTransaction.note.like("tx#%"),
        )
    ).scalars().all()

    processed_ids: set[int] = set()
    for note in processed_notes:
        if note and note.startswith("tx#"):
            try:
                processed_ids.add(int(note.split(" ")[0][3:]))
            except (ValueError, IndexError):
                pass

    txs = db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.tx_type == TxType.WITHDRAW)
        .order_by(WalletTransaction.id.asc())
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    # 미처리 건만 필터링
    pending = [t for t in txs if t.id not in processed_ids]

    user_ids = list({t.user_id for t in pending})
    users_map = {}
    if user_ids:
        us = db.execute(select(User).where(User.id.in_(user_ids))).scalars().all()
        users_map = {u.id: u for u in us}

    result = []
    for t in pending:
        raw_amount = abs(t.amount)
        fee, net = _parse_fee_net(t.note, raw_amount)
        result.append({
            "tx_id": t.id,
            "user_id": t.user_id,
            "nickname": users_map[t.user_id].nickname if t.user_id in users_map else None,
            "amount": raw_amount,
            "fee": fee,
            "net_amount": net,
            "note": t.note,
            "created_at": t.created_at,
        })
    return {"withdrawals": result}


# ─── 관리자: 출금 완료 처리 ───────────────────────────────────────

@router.post("/admin/withdrawals/{tx_id}/complete")
def complete_withdrawal(
    tx_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """관리자: 실제 이체 완료 후 WITHDRAW_DONE 내역 기록"""
    tx = db.execute(
        select(WalletTransaction).where(
            WalletTransaction.id == tx_id,
            WalletTransaction.tx_type == TxType.WITHDRAW,
        )
    ).scalar_one_or_none()

    if not tx:
        raise HTTPException(404, "출금 신청을 찾을 수 없습니다.")

    # 이미 완료됐는지 확인 (같은 note로 WITHDRAW_DONE이 있으면 중복)
    existing_done = db.execute(
        select(WalletTransaction).where(
            WalletTransaction.user_id == tx.user_id,
            WalletTransaction.tx_type == TxType.WITHDRAW_DONE,
            WalletTransaction.note == f"tx#{tx_id} 출금 완료",
        )
    ).scalar_one_or_none()
    if existing_done:
        return {"status": "already_completed"}

    db_user = db.execute(
        select(User).where(User.id == tx.user_id)
    ).scalar_one_or_none()
    balance_now = db_user.balance if db_user else 0

    _record_tx(
        db=db,
        user_id=tx.user_id,
        tx_type=TxType.WITHDRAW_DONE,
        amount=0,
        balance_after=balance_now,
        note=f"tx#{tx_id} 출금 완료",
    )
    db.commit()
    return {"status": "completed", "tx_id": tx_id}


# ─── 관리자: 출금 반려 (잔액 복원) ───────────────────────────────

@router.post("/admin/withdrawals/{tx_id}/reject")
def reject_withdrawal(
    tx_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """관리자: 출금 반려 → 잔액 복원 (ADMIN_ADJUST)"""
    tx = db.execute(
        select(WalletTransaction).where(
            WalletTransaction.id == tx_id,
            WalletTransaction.tx_type == TxType.WITHDRAW,
        )
    ).scalar_one_or_none()

    if not tx:
        raise HTTPException(404, "출금 신청을 찾을 수 없습니다.")

    # 이미 완료/반려됐는지 확인
    existing = db.execute(
        select(WalletTransaction).where(
            WalletTransaction.user_id == tx.user_id,
            WalletTransaction.tx_type.in_([TxType.WITHDRAW_DONE, TxType.ADMIN_ADJUST]),
            WalletTransaction.note.like(f"tx#{tx_id} %"),
        )
    ).scalar_one_or_none()
    if existing:
        return {"status": "already_processed"}

    db_user = db.execute(
        select(User).where(User.id == tx.user_id).with_for_update()
    ).scalar_one_or_none()

    refund_amount = abs(tx.amount)
    if db_user:
        db_user.balance += refund_amount

    _record_tx(
        db=db,
        user_id=tx.user_id,
        tx_type=TxType.ADMIN_ADJUST,
        amount=refund_amount,
        balance_after=db_user.balance if db_user else 0,
        note=f"tx#{tx_id} 출금 반려 (잔액 복원)",
    )
    db.commit()
    return {"status": "rejected", "refunded": refund_amount}