# apps/api/app/api/routes/wallet.py
"""
지갑(잔액) API

설계 원칙
─────────────────────────────────────────────────────────────────
1. 잔액 모델: users.balance (단일 소스)
   - 모든 변동은 반드시 WalletTransaction 에도 기록 (감사 로그).

2. 충전 플로우 (토스 결제)
   prepare  →  (Toss 위젯 결제)  →  confirm_charge
    └─ WalletTransaction(CHARGE) 생성
    └─ users.balance += amount

3. 잔액 반환(출금) 플로우
   POST /wallet/withdraw
    └─ 잔액 충분한지 검사
    └─ users.balance -= amount
    └─ WalletTransaction(WITHDRAW) 기록
    └─ 실제 이체는 운영자가 수동 or 배치 처리 (MVP)

4. 충전 금액 정책
   - 최소 10,000원 / 최대 100,000원 / 1,000원 단위
─────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
import base64
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction, TxType

router = APIRouter(prefix="/wallet", tags=["wallet"])

# ──────────────────────────────────────────────────────────────
# 충전 금액 정책
# ──────────────────────────────────────────────────────────────
MIN_CHARGE  = 10_000    # 최소 10,000원
MAX_CHARGE  = 100_000   # 최대 100,000원
UNIT_CHARGE = 1_000     # 1,000원 단위


# ──────────────────────────────────────────────────────────────
# slowapi rate limiter (없으면 noop)
# ──────────────────────────────────────────────────────────────
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    def _rate_limit(limit: str):
        return _limiter.limit(limit)
except ImportError:
    import functools
    def _rate_limit(limit: str):  # type: ignore[misc]
        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                return func(*args, **kwargs)
            return wrapper
        return decorator


# ──────────────────────────────────────────────────────────────
# Toss 헬퍼
# ──────────────────────────────────────────────────────────────

def _toss_confirm_sync(order_id: str, payment_key: str, amount: int) -> dict:
    """
    Toss 결제 승인 동기 호출.
    성공: {"ok": True, ...}
    실패: {"ok": False, "message": "..."}
    """
    toss_secret = settings.toss_secret_key
    if not toss_secret:
        return {"ok": True, "mock": True}   # 개발환경 mock

    credentials = base64.b64encode(f"{toss_secret}:".encode()).decode()
    try:
        resp = httpx.post(
            "https://api.tosspayments.com/v1/payments/confirm",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/json",
            },
            json={"orderId": order_id, "paymentKey": payment_key, "amount": amount},
            timeout=10.0,
        )
        data = resp.json()
        if resp.status_code == 200:
            return {"ok": True, **data}
        return {"ok": False, "code": data.get("code"), "message": data.get("message", f"Toss HTTP {resp.status_code}")}
    except httpx.TimeoutException:
        return {"ok": False, "message": "Toss API 타임아웃"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


# ──────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────

class WithdrawRequest(BaseModel):
    """잔액 반환 신청 Body"""
    amount: int = Field(..., ge=1_000, description="반환 신청 금액 (최소 1,000원)")
    bank_name: str = Field(..., max_length=20, description="은행명 (예: 신한은행)")
    account_number: str = Field(..., max_length=30, description="계좌번호 (숫자만)")
    account_holder: str = Field(..., max_length=20, description="예금주명")


# ──────────────────────────────────────────────────────────────
# 1) 잔액 조회
# ──────────────────────────────────────────────────────────────

@router.get("/balance")
def get_balance(user: User = Depends(get_current_user)):
    """현재 로그인 유저의 잔액 조회"""
    return {"balance": user.balance}


# ──────────────────────────────────────────────────────────────
# 2) 충전 준비 (Toss 위젯 주문 생성)
# ──────────────────────────────────────────────────────────────

@router.post("/charge/prepare")
@_rate_limit("20/minute")
def prepare_charge(
    request: Request,
    amount: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    토스 결제 위젯 실행 전 서버 측 주문 생성.

    - 금액 정책 검증 (10,000 ~ 100,000원, 1,000원 단위)
    - 중복 방지: 같은 amount 의 PENDING 주문이 있으면 재사용하지 않고 새로 생성
      (사용자가 금액 바꿔 다시 시도할 수 있음)
    """
    # 금액 검증
    if amount < MIN_CHARGE:
        raise HTTPException(400, f"최소 충전 금액은 {MIN_CHARGE:,}원입니다.")
    if amount > MAX_CHARGE:
        raise HTTPException(400, f"최대 충전 금액은 {MAX_CHARGE:,}원입니다.")
    if amount % UNIT_CHARGE != 0:
        raise HTTPException(400, f"충전 금액은 {UNIT_CHARGE:,}원 단위여야 합니다.")

    order_id = str(uuid.uuid4())

    # WalletTransaction에 PENDING 상태로 기록 (toss_payment_key 는 confirm 시 채움)
    # balance_after 는 실제 충전 전이므로 현재 잔액 그대로
    tx = WalletTransaction(
        user_id      = user.id,
        amount       = amount,
        balance_after= user.balance,   # 아직 미충전 → confirm 때 업데이트
        tx_type      = TxType.CHARGE,
        toss_order_id= order_id,
        note         = "충전 준비 (PENDING)",
    )
    db.add(tx)
    db.commit()

    return {
        "orderId":   order_id,
        "amount":    amount,
        "orderName": f"MEETIN 잔액 충전 {amount:,}원",
    }


# ──────────────────────────────────────────────────────────────
# 3) 충전 확정 (Toss 결제 성공 콜백 후 서버 검증)
# ──────────────────────────────────────────────────────────────

@router.post("/charge/confirm")
@_rate_limit("20/minute")
def confirm_charge(
    request: Request,
    order_id: str,
    payment_key: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Toss 결제 위젯 → 성공 콜백 후 서버 검증.

    플로우:
      1. WalletTransaction row lock (toss_order_id 기준)
      2. 소유자 + 미처리 여부 확인
      3. Toss 서버 검증 API 호출 (SECRET_KEY 있는 경우)
      4. users.balance += amount  +  tx.balance_after 갱신
      5. WalletTransaction.toss_payment_key 저장

    idempotent: 이미 충전된 order_id 재호출 시 현재 잔액 반환
    """
    try:
        # ── 1. WalletTransaction row lock ──────────────────────
        tx: Optional[WalletTransaction] = db.execute(
            select(WalletTransaction)
            .where(WalletTransaction.toss_order_id == order_id)
            .with_for_update()
        ).scalar_one_or_none()

        if not tx:
            raise HTTPException(404, "주문을 찾을 수 없습니다.")

        # ── 2. 소유자 확인 ───────────────────────────────────────
        if tx.user_id != user.id:
            raise HTTPException(403, "본인의 주문이 아닙니다.")

        # ── idempotent: 이미 payment_key 있으면 완료 처리됨 ─────
        # note 에 "PENDING" 이 없으면 이미 confirm 완료
        if tx.toss_payment_key is not None:
            # User row lock 해서 현재 잔액 가져오기
            u = db.execute(
                select(User).where(User.id == user.id).with_for_update()
            ).scalar_one()
            return {"status": "already_charged", "balance": u.balance}

        # ── 3. Toss 서버 검증 ────────────────────────────────────
        if settings.toss_secret_key and payment_key:
            result = _toss_confirm_sync(order_id, payment_key, tx.amount)
            if not result.get("ok"):
                raise HTTPException(400, result.get("message") or "Toss 결제 승인 실패")

        # ── 4. 잔액 증가 + tx 업데이트 ───────────────────────────
        # User row lock
        u = db.execute(
            select(User).where(User.id == user.id).with_for_update()
        ).scalar_one()

        u.balance += tx.amount
        tx.balance_after   = u.balance
        tx.toss_payment_key = payment_key or "mock"
        tx.note             = "충전 완료"

        db.commit()

        return {
            "status":  "charged",
            "amount":  tx.amount,
            "balance": u.balance,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# ──────────────────────────────────────────────────────────────
# 4) 잔액 반환 신청 (출금 요청)
# ──────────────────────────────────────────────────────────────

@router.post("/withdraw")
@_rate_limit("5/minute")
def withdraw(
    request: Request,
    payload: WithdrawRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    잔액 반환 신청 (MVP: 즉시 잔액 차감 + WITHDRAW 기록).

    실제 이체(계좌 송금)는 운영자가 수동으로 처리하거나
    추후 자동 이체 배치로 처리.

    - 잔액 부족 시 400 에러
    - 최소 신청 금액: 1,000원
    """
    try:
        # User row lock
        u = db.execute(
            select(User).where(User.id == user.id).with_for_update()
        ).scalar_one()

        if u.balance < payload.amount:
            raise HTTPException(
                400,
                f"잔액이 부족합니다. (현재 잔액: {u.balance:,}원, 신청: {payload.amount:,}원)"
            )

        u.balance -= payload.amount

        tx = WalletTransaction(
            user_id      = u.id,
            amount       = -payload.amount,   # 음수: 잔액 감소
            balance_after= u.balance,
            tx_type      = TxType.WITHDRAW,
            note         = (
                f"반환 신청 — {payload.bank_name} {payload.account_number} "
                f"({payload.account_holder})"
            ),
        )
        db.add(tx)
        db.commit()

        return {
            "status":  "withdraw_requested",
            "amount":  payload.amount,
            "balance": u.balance,
            "message": "반환 신청이 완료되었습니다. 영업일 기준 1~3일 내 입금됩니다.",
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# ──────────────────────────────────────────────────────────────
# 5) 내 지갑 트랜잭션 내역 조회
# ──────────────────────────────────────────────────────────────

@router.get("/transactions")
def get_transactions(
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """잔액 변동 내역 조회 (최신순)"""
    txs = db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.user_id == user.id)
        .order_by(WalletTransaction.id.desc())
        .limit(limit)
    ).scalars().all()

    return {
        "balance": user.balance,
        "transactions": [
            {
                "id":           t.id,
                "tx_type":      t.tx_type.value,
                "amount":       t.amount,
                "balance_after":t.balance_after,
                "meeting_id":   t.meeting_id,
                "note":         t.note,
                "created_at":   t.created_at,
            }
            for t in txs
        ],
    }
