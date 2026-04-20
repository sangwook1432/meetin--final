"""
wallet.py — 잔액 관리 + 결제 내역

설계:
  - 보증금은 user.balance 에서 차감 (Toss 결제는 잔액 충전 전용)
  - 거래 내역은 wallet_transactions 테이블에 기록
  - 잔액 충전: POST /wallet/charge (Toss 결제 성공 후 서버에서 호출)
  - 잔액 조회: GET  /wallet/me
  - 거래 내역: GET  /wallet/transactions
"""
import logging
import uuid
from typing import Optional

import functools

logger = logging.getLogger(__name__)

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
from app.core.deps import get_db, require_verified, require_verified_financial, require_admin
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, TxType # 경로가 다르면 맞게 수정하세요

router = APIRouter()

WITHDRAW_FEE_RATE = 0.10    # 일반환불 수수료 10%
WITHDRAW_MIN_FEE  = 1_000   # 수수료 최솟값 1,000원


# ─── Schemas ─────────────────────────────────────────────────────

class ChargeIn(BaseModel):
    imp_uid: str      # 포트원 결제 고유번호
    merchant_uid: str # 가맹점 주문번호 (prepareCharge에서 생성한 orderId)
    amount: int = Field(gt=0, le=500_000)


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
    pg_order_id: str | None = None,
    pg_payment_uid: str | None = None,
):
    tx = WalletTransaction(
        user_id=user_id,
        tx_type=tx_type,
        amount=amount,
        balance_after=balance_after,
        note=note,
        meeting_id=meeting_id,
        pg_order_id=pg_order_id,
        pg_payment_uid=pg_payment_uid,
    )
    db.add(tx)


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
@_rate_limit("10/minute")
def prepare_charge(
    request: Request,
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
@_rate_limit("10/minute")
async def confirm_charge(
    request: Request,
    payload: ChargeIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    포트원 결제 성공 후 서버에서 imp_uid 검증 및 실제 잔액 증가.
    중복 처리 방지: pg_order_id(merchant_uid)로 기존 거래 확인.
    """
    existing = db.execute(
        select(WalletTransaction).where(
            WalletTransaction.user_id == user.id,
            WalletTransaction.pg_order_id == payload.merchant_uid,
        )
    ).scalar_one_or_none()

    if existing:
        return {"status": "already_charged", "balance": user.balance}

    # 포트원 실결제 검증 (운영 키 설정 시 항상 검증)
    if settings.imp_rest_api_key:
        import httpx as _httpx
        from app.services.pass_auth import _get_portone_token
        try:
            # 1) 액세스 토큰 (캐싱된 토큰 재사용)
            access_token = await _get_portone_token()

            # 2) 결제 내역 조회
            async with _httpx.AsyncClient(timeout=10.0) as _client:
                pay_resp = await _client.get(
                    f"https://api.iamport.kr/payments/{payload.imp_uid}",
                    headers={"Authorization": access_token},
                )
            if pay_resp.status_code != 200 or pay_resp.json().get("code") != 0:
                raise HTTPException(400, "포트원 결제 조회 실패")

            payment = pay_resp.json()["response"]

            # 3) 결제 상태 및 금액 검증
            if payment.get("status") != "paid":
                raise HTTPException(400, f"결제 미완료 상태입니다: {payment.get('status')}")
            if payment.get("merchant_uid") != payload.merchant_uid:
                raise HTTPException(400, "주문번호가 일치하지 않습니다.")
            if payment.get("amount") != payload.amount:
                raise HTTPException(400, "결제 금액이 일치하지 않습니다.")

            logger.info(
                "포트원 결제 검증 성공: imp_uid=%s merchant_uid=%s amount=%s",
                payload.imp_uid, payload.merchant_uid, payload.amount,
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"포트원 API 오류: {e}")

    # 잔액 증가
    db_user = db.execute(
        select(User).where(User.id == user.id).with_for_update()
    ).scalar_one()

    db_user.balance += payload.amount
    _record_tx(
        db=db,
        user_id=db_user.id,
        tx_type=TxType.CHARGE,
        amount=payload.amount,
        balance_after=db_user.balance,
        note="잔액 충전",
        pg_order_id=payload.merchant_uid,
        pg_payment_uid=payload.imp_uid,
    )
    db.commit()
    return {"status": "charged", "balance": db_user.balance}


# ─── 잔액 조회 ────────────────────────────────────────────────────

@router.get("/wallet/me")
def my_wallet(
    db: Session = Depends(get_db),
    user=Depends(require_verified_financial),
):
    return {
        "balance": user.balance,
        "matching_tickets": user.matching_tickets,
        "can_afford": user.matching_tickets >= 1,
    }


# ─── 거래 내역 ────────────────────────────────────────────────────

@router.get("/wallet/transactions")
def wallet_transactions(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(require_verified_financial),
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
                "pg_order_id": t.pg_order_id,
                "created_at": t.created_at,
            }
            for t in txs
        ]
    }


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
    조건: 마지막 CHARGE가 7일 이내 AND 그 이후 TICKET_PURCHASE 없음.
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
            WalletTransaction.tx_type == TxType.TICKET_PURCHASE,
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
@_rate_limit("30/minute")
def withdraw_preview(
    request: Request,
    amount: int = Query(..., gt=0),
    db: Session = Depends(get_db),
    user=Depends(require_verified_financial),
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
    user=Depends(require_verified_financial),
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

    if db_user.balance < payload.amount:
        raise HTTPException(400, f"잔액이 부족합니다. 현재 잔액: {db_user.balance:,}원")

    is_ck = _is_cheongyak(db, db_user.id)
    fee, net = _calc_withdraw_fee(payload.amount, is_ck)

    if net < WITHDRAW_MIN_FEE and not is_ck:
        raise HTTPException(400, f"수수료({fee:,}원) 차감 후 실입금액({net:,}원)이 최소 기준(1,000원) 미만입니다.")

    refund_type = "청약철회" if is_ck else "일반환불"
    note = f"[FEE:{fee}|NET:{net}] 출금신청 ({refund_type})"

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
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
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
async def complete_withdrawal(
    tx_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """관리자: 출금 완료 처리.
    imp_rest_api_key 설정 시 포트원 cancel API로 자동 환불.
    미설정 시 수동 계좌이체 완료로 기록.
    """
    tx = db.execute(
        select(WalletTransaction).where(
            WalletTransaction.id == tx_id,
            WalletTransaction.tx_type == TxType.WITHDRAW,
        )
    ).scalar_one_or_none()

    if not tx:
        raise HTTPException(404, "출금 신청을 찾을 수 없습니다.")

    # 중복 처리 방지
    existing_done = db.execute(
        select(WalletTransaction).where(
            WalletTransaction.user_id == tx.user_id,
            WalletTransaction.tx_type == TxType.WITHDRAW_DONE,
            WalletTransaction.note.like(f"tx#{tx_id} 출금 완료%"),
        )
    ).scalar_one_or_none()
    if existing_done:
        return {"status": "already_completed"}

    # note에서 수수료/실환불액 파싱
    raw_amount = abs(tx.amount)
    fee, net_amount = _parse_fee_net(tx.note, raw_amount)
    is_cheongyak = "청약철회" in (tx.note or "")
    reason = "청약철회 환불" if is_cheongyak else "일반환불 (수수료 10% 차감)"

    if settings.imp_rest_api_key and net_amount > 0:
        # pg_payment_uid 있는 CHARGE 건만 최신순으로 조회
        charges = db.execute(
            select(WalletTransaction)
            .where(
                WalletTransaction.user_id == tx.user_id,
                WalletTransaction.tx_type == TxType.CHARGE,
                WalletTransaction.pg_payment_uid.isnot(None),
            )
            .order_by(WalletTransaction.created_at.desc())
        ).scalars().all()

        if not charges:
            raise HTTPException(400, "포트원 결제 내역이 없습니다. 수동 이체 후 처리하세요.")

        from app.services.portone import cancel_across_charges, PortoneCancelError
        try:
            results = await cancel_across_charges(charges, net_amount, reason)
            summary = ", ".join(f"{r['imp_uid']}:{r['cancelled']:,}원" for r in results)
            done_note = f"tx#{tx_id} 출금 완료 (포트원 자동환불: {summary})"
        except PortoneCancelError as e:
            completed_info = e.completed
            raise HTTPException(
                502,
                f"포트원 환불 실패: {e.message}"
                + (f" | 완료된 건: {completed_info}" if completed_info else ""),
            )
    else:
        done_note = f"tx#{tx_id} 출금 완료 (수동이체)"

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
        note=done_note,
    )
    db.commit()
    return {"status": "completed", "tx_id": tx_id, "net_amount": net_amount}


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
        ).with_for_update()
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