"""
알림 서비스 모듈

현재 지원:
  - 카카오 알림톡 (비즈메시지 API v2)
  - 미지원 환경(KAKAO_API_KEY 없음)에서는 로그만 출력

사용 방법:
  from app.services.notification import notify

  await notify.waiting_confirm(user, meeting_id)
  await notify.meeting_confirmed(user, meeting_id, chat_room_id)
  await notify.ticket_refunded(user, meeting_id, amount)

환경 변수:
  KAKAO_API_KEY   — 카카오 비즈메시지 REST API Key
  KAKAO_SENDER_KEY — 알림톡 발신 프로필 키
  KAKAO_TEMPLATE_*  — 각 이벤트별 템플릿 코드
"""
from __future__ import annotations

import logging
import re
import httpx
from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from app.models.user import User

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# 저수준: 카카오 알림톡 발송
# ─────────────────────────────────────────────────────────────────

KAKAO_ALIMTALK_URL = "https://api-alimtalk.kakao.com/v2/sender/{sender_key}/message"


async def _send_alimtalk(
    phone: str,
    template_code: str,
    template_args: dict,
) -> dict:
    """
    카카오 알림톡 단건 발송.
    실패해도 예외를 raise하지 않고 로그만 남김 (알림 실패가 결제/확정을 막으면 안 됨).
    """
    sender_key = getattr(settings, "kakao_sender_key", None)
    api_key = getattr(settings, "kakao_api_key", None)

    if not sender_key or not api_key:
        # 개발/테스트 환경: 실제 발송 없이 로그만
        logger.info(
            "[ALIMTALK-MOCK] to=%s template=%s args=%s",
            phone, template_code, template_args,
        )
        return {"ok": True, "mock": True}

    url = KAKAO_ALIMTALK_URL.format(sender_key=sender_key)
    payload = {
        "senderKey": sender_key,
        "templateCode": template_code,
        "recipientList": [
            {
                "recipientNo": phone,
                "templateParameter": template_args,
            }
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                url,
                headers={
                    "Content-Type": "application/json;charset=UTF-8",
                    "kakaoApiKey": api_key,
                },
                json=payload,
            )
            data = resp.json()
            if resp.status_code != 200:
                logger.warning("[ALIMTALK] 발송 실패 phone=%s status=%d body=%s", phone, resp.status_code, data)
            return data
    except Exception as exc:
        logger.error("[ALIMTALK] 예외 phone=%s error=%s", phone, exc)
        return {"ok": False, "error": str(exc)}


def _get_phone(user: "User") -> str | None:
    """
    User 모델에서 알림 발송용 전화번호 추출.
    Kakao 알림톡은 01012345678 형식 요구 → +82 제거 후 반환.
    phone_e164 가 없는 레거시 계정은 None 반환 → 알림 스킵.
    """
    from app.core.crypto import decrypt_phone
    encrypted = getattr(user, "phone_e164", None)
    if not encrypted:
        return None
    e164 = decrypt_phone(encrypted)
    if not e164:
        return None
    return re.sub(r"^\+82", "0", e164)


# ─────────────────────────────────────────────────────────────────
# 고수준: 이벤트별 알림 함수
# ─────────────────────────────────────────────────────────────────

class NotificationService:
    """
    이벤트별 알림 발송 인터페이스.
    각 메서드는 async 이며, 실패 시 로그만 남기고 정상 리턴.
    """

    async def waiting_confirm(self, user: "User", meeting_id: int) -> None:
        """
        슬롯이 모두 채워져 WAITING_CONFIRM 전환 시
        → 해당 미팅의 모든 멤버에게 발송.
        (호출 측에서 멤버 반복 호출 권장)
        """
        phone = _get_phone(user)
        if not phone:
            return

        nickname = getattr(user, "nickname", None) or "회원"
        await _send_alimtalk(
            phone=phone,
            template_code=getattr(settings, "kakao_template_waiting_confirm", "MEETIN_WAIT"),
            template_args={
                "nickname": nickname,
                "meeting_id": str(meeting_id),
                "app_url": f"https://meetin.kr/meetings/{meeting_id}",
            },
        )
        logger.info("[NOTIFY] waiting_confirm user=%d meeting=%d", user.id, meeting_id)

    async def meeting_confirmed(
        self, user: "User", meeting_id: int, chat_room_id: int
    ) -> None:
        """전원 확정 → CONFIRMED 전환 시 채팅방 링크와 함께 발송"""
        phone = _get_phone(user)
        if not phone:
            return

        nickname = getattr(user, "nickname", None) or "회원"
        await _send_alimtalk(
            phone=phone,
            template_code=getattr(settings, "kakao_template_confirmed", "MEETIN_CONF"),
            template_args={
                "nickname": nickname,
                "meeting_id": str(meeting_id),
                "chat_url": f"https://meetin.kr/chats/{chat_room_id}",
            },
        )
        logger.info("[NOTIFY] confirmed user=%d meeting=%d room=%d", user.id, meeting_id, chat_room_id)

    async def ticket_refunded(
        self, user: "User", meeting_id: int, amount: int
    ) -> None:
        """매칭권 환급 알림"""
        phone = _get_phone(user)
        if not phone:
            return

        nickname = getattr(user, "nickname", None) or "회원"
        await _send_alimtalk(
            phone=phone,
            template_code=getattr(settings, "kakao_template_refunded", "MEETIN_RFND"),
            template_args={
                "nickname": nickname,
                "amount": f"{amount:,}",
                "meeting_id": str(meeting_id),
            },
        )
        logger.info("[NOTIFY] refunded user=%d meeting=%d amount=%d", user.id, meeting_id, amount)

    async def ticket_forfeited(
        self, user: "User", meeting_id: int, amount: int
    ) -> None:
        """노쇼 → 매칭권 몰수 알림"""
        phone = _get_phone(user)
        if not phone:
            return

        nickname = getattr(user, "nickname", None) or "회원"
        await _send_alimtalk(
            phone=phone,
            template_code=getattr(settings, "kakao_template_forfeited", "MEETIN_FORF"),
            template_args={
                "nickname": nickname,
                "amount": f"{amount:,}",
                "meeting_id": str(meeting_id),
            },
        )
        logger.info("[NOTIFY] forfeited user=%d meeting=%d amount=%d", user.id, meeting_id, amount)


# 싱글턴 인스턴스 — 어디서든 import 해서 바로 사용
notify = NotificationService()
