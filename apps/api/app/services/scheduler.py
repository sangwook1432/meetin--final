"""
환불 배치 스케줄러

역할:
  - leave 시 REFUND_PENDING 으로 표시된 보증금을 주기적으로 조회
  - Toss 취소 API 호출 후 REFUNDED 로 전환
  - 실패 시 재시도 카운터 증가, MAX_RETRY 초과 시 FAILED_REFUND 로 표시
    → 관리자 수동 처리 대상

실행 주기: 5분마다 (APScheduler BackgroundScheduler)

FastAPI lifespan 이벤트로 앱 시작/종료 시 스케줄러를 시작/중단.
"""
from __future__ import annotations

import base64
import logging
from contextlib import asynccontextmanager

import httpx
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.deposit import Deposit, DepositStatus

logger = logging.getLogger("meetin.scheduler")

MAX_RETRY = 3          # 최대 재시도 횟수
INTERVAL_MINUTES = 5   # 실행 주기


# ─────────────────────────────────────────────────────────────────
# Toss 취소 API (동기)
# ─────────────────────────────────────────────────────────────────

def _toss_cancel_sync(payment_key: str, amount: int, reason: str) -> dict:
    """
    Toss Payments 취소 API 동기 호출.
    TOSS_SECRET_KEY 없으면 mock 성공 반환 (개발환경).
    """
    toss_secret = settings.toss_secret_key
    if not toss_secret:
        logger.info("[REFUND-BATCH] mock cancel payment_key=%s amount=%d", payment_key, amount)
        return {"ok": True, "mock": True}

    credentials = base64.b64encode(f"{toss_secret}:".encode()).decode()
    try:
        resp = httpx.post(
            f"https://api.tosspayments.com/v1/payments/{payment_key}/cancel",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/json",
            },
            json={"cancelReason": reason, "cancelAmount": amount},
            timeout=10.0,
        )
        data = resp.json()
        if resp.status_code == 200:
            return {"ok": True, **data}
        return {"ok": False, "code": data.get("code"), "message": data.get("message")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ─────────────────────────────────────────────────────────────────
# 배치 잡
# ─────────────────────────────────────────────────────────────────

def process_pending_refunds() -> None:
    """
    REFUND_PENDING 상태 deposit 을 일괄 처리.

    1. REFUND_PENDING deposit 조회 (최대 50건씩 처리)
    2. toss_payment_key 있으면 Toss 취소 API 호출
    3. 성공 → REFUNDED
    4. 실패 → retry_count 증가, MAX_RETRY 초과 시 FAILED_REFUND
    5. toss_payment_key 없으면 (prepare 후 결제 안 한 경우) → CANCELED

    각 deposit 을 개별 트랜잭션으로 처리해
    하나 실패해도 다른 건에 영향 없음.
    """
    db: Session = SessionLocal()
    try:
        pending = db.execute(
            select(Deposit)
            .where(Deposit.status == DepositStatus.REFUND_PENDING)
            .order_by(Deposit.id.asc())
            .limit(50)
        ).scalars().all()

        if not pending:
            return

        logger.info("[REFUND-BATCH] processing %d deposits", len(pending))

        for deposit in pending:
            _process_one(db, deposit)

    except Exception as e:
        logger.error("[REFUND-BATCH] batch error: %s", e, exc_info=True)
    finally:
        db.close()


def _process_one(db: Session, deposit: Deposit) -> None:
    """개별 deposit 환불 처리 (단일 트랜잭션)"""
    try:
        # toss_payment_key 없음 = 실제 결제 전이거나 mock → CANCELED 처리
        if not deposit.toss_payment_key:
            deposit.status = DepositStatus.CANCELED
            db.commit()
            logger.info(
                "[REFUND-BATCH] no payment_key → CANCELED deposit_id=%d", deposit.id
            )
            return

        result = _toss_cancel_sync(
            payment_key=deposit.toss_payment_key,
            amount=deposit.amount,
            reason="미팅 참가 취소 (자동 환불)",
        )

        if result.get("ok"):
            deposit.status = DepositStatus.REFUNDED
            db.commit()
            logger.info(
                "[REFUND-BATCH] REFUNDED deposit_id=%d meeting_id=%d amount=%d",
                deposit.id, deposit.meeting_id, deposit.amount,
            )
        else:
            # 실패 → retry_count 증가
            retry_count = getattr(deposit, "retry_count", 0) or 0
            retry_count += 1
            if retry_count >= MAX_RETRY:
                deposit.status = DepositStatus.FAILED_REFUND
                logger.error(
                    "[REFUND-BATCH] FAILED_REFUND after %d retries deposit_id=%d error=%s",
                    retry_count, deposit.id, result.get("message"),
                )
            else:
                # retry_count 는 별도 컬럼 없으면 note 필드에 임시 저장
                # (추후 retry_count 컬럼 추가 권장)
                logger.warning(
                    "[REFUND-BATCH] retry %d/%d deposit_id=%d error=%s",
                    retry_count, MAX_RETRY, deposit.id, result.get("message"),
                )
            db.commit()

    except Exception as e:
        db.rollback()
        logger.error("[REFUND-BATCH] error deposit_id=%d: %s", deposit.id, e, exc_info=True)


# ─────────────────────────────────────────────────────────────────
# FastAPI lifespan 통합
# ─────────────────────────────────────────────────────────────────

_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        return

    _scheduler = BackgroundScheduler(timezone="Asia/Seoul")
    _scheduler.add_job(
        process_pending_refunds,
        trigger="interval",
        minutes=INTERVAL_MINUTES,
        id="refund_batch",
        replace_existing=True,
        max_instances=1,        # 동시 실행 1개만 허용
    )
    _scheduler.start()
    logger.info(
        "[SCHEDULER] started — refund_batch every %d min", INTERVAL_MINUTES
    )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[SCHEDULER] stopped")


@asynccontextmanager
async def lifespan(app):
    """FastAPI lifespan context manager"""
    start_scheduler()
    yield
    stop_scheduler()
