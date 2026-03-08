# apps/api/app/api/routes/payments.py
"""
결제-확정 플로우

설계 원칙
─────────────────────────────────────────────────────────────────
1. 단일 소스 : slot.confirmed 만을 확정 상태의 근거로 사용.
   - Confirmation 테이블은 더 이상 사용하지 않음.
   - payments.py에서도 slot.confirmed = True 로 처리.

2. 플로우
   prepare  →  (Toss 위젯에서 결제)  →  confirm_payment
    └─ deposit.status = HELD
    └─ slot.confirmed = True
    └─ 전원 HELD 이면 meeting.status = CONFIRMED + ChatRoom 생성

3. 환불
   leave 호출 시 deposit.status = HELD 이면 자동 환불 처리.
   환불 상세는 /payments/deposits/refund 로 별도 처리도 가능.
─────────────────────────────────────────────────────────────────
"""

import uuid
import httpx
import base64
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db, require_verified
from app.models.deposit import Deposit, DepositStatus
from app.models.meeting import Meeting, MeetingStatus
from app.models.chat_room import ChatRoom
from app.models.meeting_slot import MeetingSlot
from app.models.user import User
from app.services.notification import notify
from app.models.notification import Notification, NotiType
from app.models.wallet_transaction import WalletTransaction, TxType
 
router = APIRouter()

# slowapi rate limiter (설치된 경우 적용, 없으면 noop 데코레이터 사용)
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

DEPOSIT_AMOUNT = 5_000   # 5,000원 (정책 변경: 채팅방 개설 시 5,000원 차감)
DEPOSIT_REFUND_AMOUNT = 4_000  # 성공 시 4,000원 환불 (1,000원은 플랫폼 수수료)


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def _ensure_user_is_meeting_member(db: Session, meeting_id: int, user_id: int) -> MeetingSlot:
    """멤버 여부 확인 후 슬롯 반환"""
    slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == user_id,
        )
    ).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=403, detail="You are not a member of this meeting.")
    return slot


def _all_slots_held(db: Session, meeting_id: int) -> bool:
    """모든 (점유된) 슬롯의 deposit 이 HELD 상태인지 확인"""
    slots = db.execute(
        select(MeetingSlot).where(MeetingSlot.meeting_id == meeting_id)
    ).scalars().all()
    member_slots = [s for s in slots if s.user_id is not None]
    if not member_slots:
        return False
    return all(s.confirmed for s in member_slots)


async def _toss_refund(payment_key: str, cancel_reason: str, amount: int) -> dict:
    """
    Toss Payments 취소 API 호출.
    실패 시 예외를 raise 하지 않고 에러 dict 반환 (환불은 운영자가 수동으로 처리할 수 있어야 함).
    """
    toss_secret = getattr(settings, "toss_secret_key", None)
    if not toss_secret:
        return {"ok": True, "mock": True}

    credentials = base64.b64encode(f"{toss_secret}:".encode()).decode()
    url = f"https://api.tosspayments.com/v1/payments/{payment_key}/cancel"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/json",
                },
                json={"cancelReason": cancel_reason, "cancelAmount": amount},
            )
            return resp.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _toss_confirm_sync(order_id: str, payment_key: str, amount: int) -> dict:
    """
    Toss 결제 승인 API 동기 호출 (confirm_payment 는 동기 함수이므로).

    Toss 승인 API:
      POST https://api.tosspayments.com/v1/payments/confirm
      Authorization: Basic base64(secretKey:)
      Body: { orderId, paymentKey, amount }

    성공 응답: HTTP 200, { paymentKey, orderId, status: "DONE", ... }
    실패 응답: HTTP 4xx, { code, message }

    반환:
      { ok: True, ... }  — 성공
      { ok: False, message: "..." }  — 실패
    """
    toss_secret = settings.toss_secret_key
    if not toss_secret:
        # 개발환경: mock 성공
        return {"ok": True, "mock": True}

    credentials = base64.b64encode(f"{toss_secret}:".encode()).decode()

    try:
        resp = httpx.post(
            "https://api.tosspayments.com/v1/payments/confirm",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/json",
            },
            json={
                "orderId":    order_id,
                "paymentKey": payment_key,
                "amount":     amount,
            },
            timeout=10.0,
        )
        data = resp.json()
        if resp.status_code == 200:
            return {"ok": True, **data}
        # Toss 에러 응답: { "code": "...", "message": "..." }
        return {
            "ok":      False,
            "code":    data.get("code", "UNKNOWN"),
            "message": data.get("message", f"Toss HTTP {resp.status_code}"),
        }
    except httpx.TimeoutException:
        return {"ok": False, "message": "Toss API 타임아웃 (10s)"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


# ─────────────────────────────────────────────────────────────────
# 1) Deposit Prepare
# ─────────────────────────────────────────────────────────────────

@router.post("/payments/deposits/prepare")
@_rate_limit("20/minute")  # 주문 생성: IP당 분당 20회 제한
def prepare_deposit(
    request: Request,
    meeting_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    Toss 위젯 결제 시작 전 서버 측 주문 생성.

    - WAITING_CONFIRM 상태 미팅 멤버만 호출 가능
    - 이미 PENDING/HELD deposit 이 있으면 idempotent하게 재사용
    """
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    if meeting.status not in (MeetingStatus.WAITING_CONFIRM,):
        raise HTTPException(400, f"결제는 WAITING_CONFIRM 상태에서만 가능합니다. (현재: {meeting.status.value})")

    _ensure_user_is_meeting_member(db, meeting_id, user.id)

    # idempotent: 이미 PENDING/HELD 이면 재사용
    existing = db.execute(
        select(Deposit).where(
            Deposit.meeting_id == meeting_id,
            Deposit.user_id == user.id,
            Deposit.status.in_([DepositStatus.PENDING, DepositStatus.HELD]),
        )
    ).scalar_one_or_none()

    if existing:
        return {
            "orderId": existing.toss_order_id,
            "amount": existing.amount,
            "orderName": f"MEETIN 참가 보증금 (미팅 #{meeting_id})",
        }

    order_id = str(uuid.uuid4())
    deposit = Deposit(
        meeting_id=meeting_id,
        user_id=user.id,
        amount=DEPOSIT_AMOUNT,
        status=DepositStatus.PENDING,
        toss_order_id=order_id,
    )

    try:
        db.add(deposit)
        db.commit()
    except IntegrityError:
        db.rollback()
        # 동시 요청 race: 재조회
        existing2 = db.execute(
            select(Deposit).where(
                Deposit.meeting_id == meeting_id,
                Deposit.user_id == user.id,
                Deposit.status.in_([DepositStatus.PENDING, DepositStatus.HELD]),
            )
        ).scalar_one_or_none()
        if existing2:
            return {
                "orderId": existing2.toss_order_id,
                "amount": existing2.amount,
                "orderName": f"MEETIN 참가 보증금 (미팅 #{meeting_id})",
            }
        raise HTTPException(400, "주문 생성 실패. 다시 시도해주세요.")

    return {
        "orderId": order_id,
        "amount": DEPOSIT_AMOUNT,
        "orderName": f"MEETIN 참가 보증금 (미팅 #{meeting_id})",
    }


# ─────────────────────────────────────────────────────────────────
# 2) Toss Confirm (결제 승인 + 참가 확정)
# ─────────────────────────────────────────────────────────────────

@router.post("/payments/toss/confirm")
@_rate_limit("20/minute")  # 결제 승인: IP당 분당 20회 제한 (중복 확인 방지)
def confirm_payment(
    request: Request,
    order_id: str,
    background_tasks: BackgroundTasks,
    payment_key: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    Toss 결제 위젯 → 성공 콜백 후 서버 검증 API.

    플로우:
      1. deposit row lock
      2. 소유자 확인
      3. meeting row lock
      4. 멤버 재확인 (leave 이후 호출 방어)
      5. deposit.status = HELD, slot.confirmed = True  ← 단일 소스
      6. 전원 HELD 이면 meeting.status = CONFIRMED + ChatRoom 자동 생성

    보안:
      - order_id 는 UUID로 추측 불가
      - deposit.user_id == current_user.id 강제
      - CONFIRMED 이후 재호출은 idempotent(already_confirmed)
    """
    try:
        # ── 1. deposit row lock ──────────────────────────────────
        deposit: Optional[Deposit] = db.execute(
            select(Deposit).where(Deposit.toss_order_id == order_id).with_for_update()
        ).scalar_one_or_none()

        if not deposit:
            raise HTTPException(404, "주문을 찾을 수 없습니다.")

        # ── 2. 소유자 확인 ───────────────────────────────────────
        if deposit.user_id != user.id:
            raise HTTPException(403, "본인의 주문이 아닙니다.")

        # ── idempotent: 이미 HELD 이면 즉시 반환 ────────────────
        if deposit.status == DepositStatus.HELD:
            # ChatRoom 유무와 관계없이 현재 상태 반환
            chat_room = db.execute(
                select(ChatRoom).where(ChatRoom.meeting_id == deposit.meeting_id)
            ).scalar_one_or_none()
            return {
                "status": "already_confirmed",
                "meeting_id": deposit.meeting_id,
                "chat_room_id": chat_room.id if chat_room else None,
            }

        # ── 3. meeting row lock ──────────────────────────────────
        meeting: Optional[Meeting] = db.execute(
            select(Meeting).where(Meeting.id == deposit.meeting_id).with_for_update()
        ).scalar_one_or_none()

        if not meeting:
            raise HTTPException(404, "미팅을 찾을 수 없습니다.")

        if meeting.status not in (MeetingStatus.WAITING_CONFIRM,):
            raise HTTPException(
                409,
                f"결제 확정은 WAITING_CONFIRM 상태에서만 가능합니다. (현재: {meeting.status.value})"
            )

        # ── 4. 멤버 재확인 (leave 했을 수도 있음) ───────────────
        slot = _ensure_user_is_meeting_member(db, meeting.id, user.id)

        # ── 5-a. 실제 Toss 서버 검증 API 호출 ───────────────────
        # TOSS_SECRET_KEY 가 설정된 경우 실결제 검증, 없으면 mock 처리.
        # 참고: https://docs.tosspayments.com/reference#%EA%B2%B0%EC%A0%9C-%EC%8A%B9%EC%9D%B8
        if settings.toss_secret_key and payment_key:
            toss_result = _toss_confirm_sync(
                order_id=order_id,
                payment_key=payment_key,
                amount=deposit.amount,
            )
            if not toss_result.get("ok"):
                raise HTTPException(
                    400,
                    toss_result.get("message") or "Toss 결제 승인 실패",
                )

        # ── 5-b. 확정 처리 (단일 소스: slot.confirmed) ──────────
        if payment_key:
            deposit.toss_payment_key = payment_key
        deposit.status = DepositStatus.HELD

        # slot.confirmed = True 가 확정의 유일한 근거
        slot.confirmed = True

        db.flush()

        # ── 6. 전원 확정 여부 체크 ───────────────────────────────
        # 다시 조회 (with_for_update 이미 걸려있는 session 내에서 재사용)
        all_slots = db.execute(
            select(MeetingSlot).where(MeetingSlot.meeting_id == meeting.id)
        ).scalars().all()
        member_slots = [s for s in all_slots if s.user_id is not None]
        all_confirmed = member_slots and all(s.confirmed for s in member_slots)

        if all_confirmed:
            meeting.status = MeetingStatus.CONFIRMED

            # ChatRoom 생성 (중복 방어: UniqueConstraint + INSERT 시도)
            existing_room = db.execute(
                select(ChatRoom).where(ChatRoom.meeting_id == meeting.id)
            ).scalar_one_or_none()
            if not existing_room:
                db.add(ChatRoom(meeting_id=meeting.id))
                try:
                    db.flush()
                except IntegrityError:
                    db.rollback()
                    # 이미 다른 트랜잭션에서 생성됨 — 무시

            # ── 전원 확정 시 4,000원 환불 (잔액 반환) ─────────────
            # 5,000원 보증금 중 4,000원 환불, 1,000원은 플랫폼 수수료
            for m_slot in member_slots:
                if m_slot.user_id is None:
                    continue
                target_user = db.execute(
                    select(User).where(User.id == m_slot.user_id).with_for_update()
                ).scalar_one_or_none()
                if target_user:
                    target_user.balance += DEPOSIT_REFUND_AMOUNT
                    db.add(WalletTransaction(
                        user_id=target_user.id,
                        amount=DEPOSIT_REFUND_AMOUNT,
                        balance_after=target_user.balance,
                        tx_type=TxType.DEPOSIT_REFUND,
                        meeting_id=meeting.id,
                        note=f"미팅 #{meeting.id} 확정 — 보증금 환불 (수수료 1,000원 차감)",
                    ))

        db.commit()

        chat_room = db.execute(
            select(ChatRoom).where(ChatRoom.meeting_id == meeting.id)
        ).scalar_one_or_none()

        # ── 알림 발송 (BackgroundTask — 결제/DB 트랜잭션 이후 실행) ──
        if all_confirmed and chat_room:
            # 전원 확정 → CONFIRMED 전환: 모든 멤버에게 채팅방 링크 발송
            member_user_ids = [s.user_id for s in member_slots]
            members = db.execute(
                select(User).where(User.id.in_(member_user_ids))
            ).scalars().all()
            for member in members:
                background_tasks.add_task(
                    notify.meeting_confirmed, member, meeting.id, chat_room.id
                )
        else:
            # 본인만 확정 완료 → 미팅 페이지로 돌아가라는 알림 (필요시)
            background_tasks.add_task(
                notify.waiting_confirm, user, meeting.id
            )

        return {
            "status": "confirmed",
            "meeting_id": meeting.id,
            "meeting_status": meeting.status.value,
            "chat_room_id": chat_room.id if chat_room else None,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# ─────────────────────────────────────────────────────────────────
# 3) 내 미팅 보증금 상태 조회
# ─────────────────────────────────────────────────────────────────

@router.get("/payments/deposits/me")
def my_deposits(
    meeting_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """내가 낸 보증금 목록 (미팅 ID 필터 가능)"""
    q = select(Deposit).where(Deposit.user_id == user.id)
    if meeting_id is not None:
        q = q.where(Deposit.meeting_id == meeting_id)
    q = q.order_by(Deposit.id.desc())
    deposits = db.execute(q).scalars().all()

    return {
        "deposits": [
            {
                "id": d.id,
                "meeting_id": d.meeting_id,
                "amount": d.amount,
                "status": d.status.value,
                "toss_order_id": d.toss_order_id,
                "created_at": d.created_at,
            }
            for d in deposits
        ]
    }


# ─────────────────────────────────────────────────────────────────
# 4) 수동 환불 요청 (운영자 or 자동 leave 훅에서 호출)
#    실제 환불 로직은 meetings.py leave 에서 자동 트리거됨.
#    이 엔드포인트는 관리자/디버그용.
# ─────────────────────────────────────────────────────────────────

@router.post("/payments/deposits/{deposit_id}/refund")
async def refund_deposit(
    deposit_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    보증금 환불 (본인 요청만 허용).

    - HELD 상태인 경우만 환불 가능
    - Toss 취소 API 호출 후 deposit.status = REFUNDED
    """
    deposit = db.execute(
        select(Deposit).where(Deposit.id == deposit_id).with_for_update()
    ).scalar_one_or_none()

    if not deposit:
        raise HTTPException(404, "보증금을 찾을 수 없습니다.")
    if deposit.user_id != user.id:
        raise HTTPException(403, "본인의 보증금이 아닙니다.")
    if deposit.status == DepositStatus.REFUNDED:
        return {"status": "already_refunded"}
    if deposit.status != DepositStatus.HELD:
        raise HTTPException(400, f"HELD 상태만 환불 가능합니다. (현재: {deposit.status.value})")

    # Toss 환불 API 호출
    if deposit.toss_payment_key:
        result = await _toss_refund(
            payment_key=deposit.toss_payment_key,
            cancel_reason="미팅 참가 취소",
            amount=deposit.amount,
        )
    else:
        result = {"ok": True, "mock": True, "reason": "no_payment_key"}

    deposit.status = DepositStatus.REFUNDED
    db.commit()

    background_tasks.add_task(notify.deposit_refunded, user, deposit.meeting_id, deposit.amount)

    return {
        "status": "refunded",
        "deposit_id": deposit.id,
        "amount": deposit.amount,
        "toss_result": result,
    }


# ─────────────────────────────────────────────────────────────────
# 5) 잔액으로 보증금 납부 (Toss 결제 없이 지갑 잔액 사용)
# ─────────────────────────────────────────────────────────────────

@router.post("/payments/deposits/pay-with-balance")
def pay_deposit_with_balance(
    meeting_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    지갑 잔액으로 보증금 납부 (Toss 결제 없이).

    - WAITING_CONFIRM 상태 미팅 멤버만 호출 가능
    - 잔액 부족 시 400
    - 성공 시 slot.confirmed = True + 전원 확정이면 CONFIRMED
    """
    from app.models.wallet_transaction import WalletTransaction, TxType as WalletTxType
    from sqlalchemy.exc import IntegrityError as _IntegrityError

    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    if meeting.status != MeetingStatus.WAITING_CONFIRM:
        raise HTTPException(400, f"결제는 WAITING_CONFIRM 상태에서만 가능합니다. (현재: {meeting.status.value})")

    slot = _ensure_user_is_meeting_member(db, meeting_id, user.id)

    if slot.confirmed:
        chat_room = db.execute(
            select(ChatRoom).where(ChatRoom.meeting_id == meeting_id)
        ).scalar_one_or_none()
        return {"status": "already_confirmed", "meeting_id": meeting_id, "chat_room_id": chat_room.id if chat_room else None}

    # 잔액 확인
    u = db.execute(select(User).where(User.id == user.id).with_for_update()).scalar_one()
    if u.balance < DEPOSIT_AMOUNT:
        raise HTTPException(400, f"잔액이 부족합니다. (현재: {u.balance:,}원, 필요: {DEPOSIT_AMOUNT:,}원)")

    # 잔액 차감
    u.balance -= DEPOSIT_AMOUNT

    # WalletTransaction 기록
    wt = WalletTransaction(
        user_id=u.id,
        amount=-DEPOSIT_AMOUNT,
        balance_after=u.balance,
        tx_type=WalletTxType.DEPOSIT_HOLD,
        meeting_id=meeting_id,
        note=f"미팅 #{meeting_id} 보증금 (지갑 잔액 사용)",
    )
    db.add(wt)

    # Deposit row 생성 (payment_key 없음)
    import uuid as _uuid
    order_id = str(_uuid.uuid4())
    deposit = Deposit(
        meeting_id=meeting_id,
        user_id=user.id,
        amount=DEPOSIT_AMOUNT,
        status=DepositStatus.HELD,
        toss_order_id=order_id,
        toss_payment_key=None,  # 잔액 납부 → Toss 환불 없음
    )
    db.add(deposit)

    # slot.confirmed = True
    slot_obj = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == user.id,
        ).with_for_update()
    ).scalar_one()
    slot_obj.confirmed = True
    db.flush()

    # 전원 확정 체크
    all_slots = db.execute(
        select(MeetingSlot).where(MeetingSlot.meeting_id == meeting_id)
    ).scalars().all()
    member_slots = [s for s in all_slots if s.user_id is not None]
    all_confirmed = member_slots and all(s.confirmed for s in member_slots)

    if all_confirmed:
        meeting.status = MeetingStatus.CONFIRMED
        existing_room = db.execute(
            select(ChatRoom).where(ChatRoom.meeting_id == meeting.id)
        ).scalar_one_or_none()
        if not existing_room:
            db.add(ChatRoom(meeting_id=meeting.id))
            try:
                db.flush()
            except _IntegrityError:
                db.rollback()

        # 4,000원 환불
        for m_slot in member_slots:
            if m_slot.user_id is None:
                continue
            target_user = db.execute(
                select(User).where(User.id == m_slot.user_id).with_for_update()
            ).scalar_one_or_none()
            if target_user:
                target_user.balance += DEPOSIT_REFUND_AMOUNT
                db.add(WalletTransaction(
                    user_id=target_user.id,
                    amount=DEPOSIT_REFUND_AMOUNT,
                    balance_after=target_user.balance,
                    tx_type=WalletTxType.DEPOSIT_REFUND,
                    meeting_id=meeting.id,
                    note=f"미팅 #{meeting.id} 확정 — 보증금 환불 (수수료 1,000원 차감)",
                ))

    db.commit()

    chat_room = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id == meeting.id)
    ).scalar_one_or_none()

    return {
        "status": "confirmed",
        "meeting_id": meeting.id,
        "meeting_status": meeting.status.value,
        "chat_room_id": chat_room.id if chat_room else None,
        "balance_used": DEPOSIT_AMOUNT,
        "balance_remaining": u.balance,
    }
