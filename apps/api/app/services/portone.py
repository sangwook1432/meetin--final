"""
portone.py — 포트원 v1 결제 취소(환불) 서비스

_get_portone_token은 pass_auth.py에서 재사용 (Redis 캐싱 포함).
"""
import httpx

from app.models.wallet_transaction import WalletTransaction


class PortoneCancelError(Exception):
    def __init__(self, message: str, completed: list[dict] | None = None):
        self.message = message
        self.completed = completed or []
        super().__init__(message)


async def _get_cancellable_amount(imp_uid: str) -> int:
    """포트원에서 해당 imp_uid의 취소 가능 잔여액 조회."""
    from app.services.pass_auth import _get_portone_token
    access_token = await _get_portone_token()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://api.iamport.kr/payments/{imp_uid}",
            headers={"Authorization": access_token},
        )
    data = resp.json()
    if resp.status_code != 200 or data.get("code") != 0:
        return 0
    payment = data["response"]
    return max(0, payment.get("amount", 0) - payment.get("cancel_amount", 0))


async def _cancel_single(imp_uid: str, amount: int, reason: str) -> None:
    """단일 imp_uid 부분취소."""
    from app.services.pass_auth import _get_portone_token
    access_token = await _get_portone_token()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.iamport.kr/payments/cancel",
            headers={"Authorization": access_token},
            json={"imp_uid": imp_uid, "reason": reason, "amount": amount},
        )
    data = resp.json()
    if resp.status_code != 200 or data.get("code") != 0:
        raise PortoneCancelError(message=data.get("message", resp.text))


async def cancel_across_charges(
    charges: list[WalletTransaction],
    total_to_cancel: int,
    reason: str,
) -> list[dict]:
    """
    total_to_cancel 금액이 소진될 때까지 charges(최신순)에서 순차 부분취소.

    전략: LIFO — 나중에 충전한 건부터 먼저 환불.
    각 건의 취소 가능 잔여액은 포트원 조회로 확인 (이미 부분취소된 건 처리).

    반환: [{"imp_uid": ..., "cancelled": ...}, ...]
    실패 시 PortoneCancelError (completed 필드에 성공한 건 목록 포함).
    """
    remaining = total_to_cancel
    completed: list[dict] = []

    for charge in charges:
        if remaining <= 0:
            break

        cancellable = await _get_cancellable_amount(charge.pg_payment_uid)
        if cancellable <= 0:
            continue

        cancel_now = min(remaining, cancellable)
        try:
            await _cancel_single(charge.pg_payment_uid, cancel_now, reason)
        except PortoneCancelError as e:
            raise PortoneCancelError(
                message=f"{charge.pg_payment_uid} 취소 실패: {e.message}",
                completed=completed,
            )

        completed.append({"imp_uid": charge.pg_payment_uid, "cancelled": cancel_now})
        remaining -= cancel_now

    if remaining > 0:
        raise PortoneCancelError(
            message=f"취소 가능 잔여액 부족 ({remaining:,}원 미처리)",
            completed=completed,
        )

    return completed
