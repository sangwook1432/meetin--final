import asyncio
import functools
import json as _json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    def _rate_limit(limit: str):
        return _limiter.limit(limit)
except ImportError:
    def _rate_limit(limit: str):  # type: ignore[misc]
        def decorator(func):
            if asyncio.iscoroutinefunction(func):
                @functools.wraps(func)
                async def async_wrapper(*args, **kwargs):
                    return await func(*args, **kwargs)
                return async_wrapper
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                return func(*args, **kwargs)
            return sync_wrapper
        return decorator

from sqlalchemy.orm import Session
from sqlalchemy import select, delete, func, and_, or_

from app.core.deps import get_db, require_verified
from app.core.security import decode_token
from app.db.session import SessionLocal
from app.models.chat_room import ChatRoom
from app.models.meeting_slot import MeetingSlot
from app.models.chat_message import ChatMessage
from app.models.meeting import Meeting, MeetingStatus, Team
from app.models.meeting_schedule import MeetingSchedule
from app.models.meeting_invitation import MeetingInvitation, InviteType, InviteStatus
from app.models.user import User, VerificationStatus
from app.models.wallet_transaction import WalletTransaction, TxType
from app.models.chat_read_receipt import ChatReadReceipt
from app.models.cancel_vote import CancelVote
from app.models.schedule_vote import ScheduleVote
from app.models.friendship import Friendship, FriendStatus

router = APIRouter()


# ─── WebSocket 연결 관리자 ─────────────────────────────────────────

class ConnectionManager:
    """
    채팅방별 WebSocket 연결 관리.

    - REDIS_URL 설정 시: Redis Pub/Sub 브로드캐스트 (다중 서버 지원)
    - REDIS_URL 미설정 시: 인메모리 브로드캐스트 (단일 서버 개발 환경)

    Redis 모드에서는 방마다 구독 태스크를 하나 유지하고,
    모든 서버 인스턴스가 동일 Redis 채널을 구독하여 메시지를 수신합니다.
    """

    def __init__(self) -> None:
        self._rooms: dict[int, set[WebSocket]] = defaultdict(set)
        self._listener_tasks: dict[int, asyncio.Task] = {}

    async def connect(self, room_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._rooms[room_id].add(ws)
        # Redis 모드: 이 방의 구독 태스크가 없으면 시작
        from app.core.redis import get_redis
        if get_redis() and room_id not in self._listener_tasks:
            self._listener_tasks[room_id] = asyncio.create_task(
                self._redis_listener(room_id)
            )

    def disconnect(self, room_id: int, ws: WebSocket) -> None:
        self._rooms[room_id].discard(ws)
        # 이 방에 로컬 연결이 없으면 구독 태스크 정리
        if not self._rooms[room_id] and room_id in self._listener_tasks:
            self._listener_tasks[room_id].cancel()
            del self._listener_tasks[room_id]

    async def broadcast(self, room_id: int, data: dict) -> None:
        from app.core.redis import get_redis
        redis = get_redis()
        if redis:
            # Redis Pub/Sub: 모든 서버 인스턴스의 구독자에게 전달
            await redis.publish(f"chat:{room_id}", _json.dumps(data, default=str))
        else:
            # 인메모리 fallback (개발 환경)
            await self._local_broadcast(room_id, data)

    async def _local_broadcast(self, room_id: int, data: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(room_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._rooms[room_id].discard(ws)

    async def _redis_listener(self, room_id: int) -> None:
        """Redis 채널 구독 → 로컬 WebSocket에 전달."""
        from app.core.redis import get_redis
        redis = get_redis()
        if not redis:
            return
        try:
            async with redis.pubsub() as pubsub:
                await pubsub.subscribe(f"chat:{room_id}")
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        data = _json.loads(message["data"])
                        await self._local_broadcast(room_id, data)
        except asyncio.CancelledError:
            pass
        except Exception:
            pass


manager = ConnectionManager()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_user_in_room(db: Session, room_id: int, user_id: int) -> ChatRoom:
    room = db.get(ChatRoom, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found.")

    slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == room.meeting_id,
            MeetingSlot.user_id == user_id,
        )
    ).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=403, detail="You are not a member of this chat room.")
    if not slot.confirmed:
        raise HTTPException(status_code=403, detail="매칭권을 소모해 확정한 후 채팅방에 입장할 수 있습니다.")

    return room


def _send_system_message(db: Session, room_id: int, content: str) -> ChatMessage:
    """시스템 메시지 삽입 (sender_user_id = 0). flush()로 ID 확보 후 반환."""
    msg = ChatMessage(
        room_id=room_id,
        sender_user_id=0,
        content=content,
        created_at=_now(),
    )
    db.add(msg)
    db.flush()  # commit 전에 DB ID 확보
    return msg


async def _execute_forfeit_cancel(
    db: Session,
    room_id: int,
    meeting: Meeting,
    forfeit_user: User,
    system_message: str,
) -> None:
    """
    forfeit_user 매칭권 몰수 + 나머지 전원 환급 + 미팅 CANCELLED
    + WS broadcast + 채팅방 삭제.
    leave_chat_room(forfeit) 및 admin report confirm 모두에서 재사용.
    """
    from app.api.routes.wallet import forfeit_ticket, refund_ticket
    from app.models.notification import Notification, NotifType

    forfeit_ticket(db, forfeit_user, meeting.id)

    all_slots = db.execute(
        select(MeetingSlot).where(MeetingSlot.meeting_id == meeting.id)
    ).scalars().all()

    for s in all_slots:
        if s.user_id is not None and s.user_id != forfeit_user.id:
            member = db.get(User, s.user_id)
            if member:
                refund_ticket(db, member, meeting.id)
                db.add(Notification(
                    user_id=member.id,
                    notif_type=NotifType.MEETING_CANCELLED,
                    message=system_message,
                    meeting_id=meeting.id,
                ))

    meeting.status = MeetingStatus.CANCELLED
    for s in all_slots:
        s.user_id = None
        s.confirmed = False

    sys_msg = _send_system_message(db, room_id, system_message)
    db.commit()

    await manager.broadcast(room_id, {
        "type": "message", "id": sys_msg.id, "room_id": room_id,
        "sender_user_id": 0, "sender_nickname": None,
        "content": sys_msg.content,
        "created_at": sys_msg.created_at.isoformat(),
        "unread_count": 0,
    })
    await manager.broadcast(room_id, {"type": "room_closed", "reason": "cancelled"})

    chat_room_obj = db.get(ChatRoom, room_id)
    if chat_room_obj:
        db.delete(chat_room_obj)
        db.commit()


def _get_total_members(db: Session, meeting_id: int) -> int:
    """미팅의 실제 참여 인원 수 (슬롯 중 user_id 채워진 것)"""
    return db.execute(
        select(func.count()).select_from(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id.is_not(None),
        )
    ).scalar_one()


def _upsert_read_receipt(db: Session, room_id: int, user_id: int, message_id: int):
    """읽음 확인 UPSERT"""
    receipt = db.execute(
        select(ChatReadReceipt).where(
            ChatReadReceipt.room_id == room_id,
            ChatReadReceipt.user_id == user_id,
        )
    ).scalar_one_or_none()

    if receipt:
        if message_id > receipt.last_read_message_id:
            receipt.last_read_message_id = message_id
    else:
        receipt = ChatReadReceipt(
            room_id=room_id,
            user_id=user_id,
            last_read_message_id=message_id,
        )
        db.add(receipt)


# ─── Schemas ─────────────────────────────────────────────────────

class ChatSendIn(BaseModel):
    content: str = Field(min_length=1, max_length=1000)
    client_message_id: str | None = Field(default=None, max_length=64)


class ChatMessageOut(BaseModel):
    id: int
    room_id: int
    sender_user_id: int
    sender_nickname: str | None
    sender_photo_url: str | None
    content: str
    created_at: datetime
    unread_count: int


class LeaveChatIn(BaseModel):
    leave_type: str  # "forfeit" | "replace"
    replace_user_id: int | None = None  # replace 시 대체인원 user_id


class ScheduleIn(BaseModel):
    date: str        # YYYY-MM-DD
    time: str        # HH:MM
    place: str


class ScheduleAgreeIn(BaseModel):
    agree: bool


class ReadReceiptIn(BaseModel):
    message_id: int


# ─── 채팅방 목록 ──────────────────────────────────────────────────

@router.get("/chats")
def list_chats(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    meeting_ids = db.execute(
        select(MeetingSlot.meeting_id).where(MeetingSlot.user_id == user.id)
    ).scalars().all()

    if not meeting_ids:
        return {"rooms": []}

    rooms = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id.in_(meeting_ids))
    ).scalars().all()

    return {"rooms": [{"room_id": r.id, "meeting_id": r.meeting_id} for r in rooms]}


# ─── 채팅방 정보 (프론트에서 host 여부, 투표 현황 확인용) ──────────────

@router.get("/chats/{room_id}/info")
def get_chat_room_info(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.get(Meeting, room.meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    total_members = _get_total_members(db, meeting.id)

    # 미팅 일정 조회
    schedule = db.execute(
        select(MeetingSchedule).where(MeetingSchedule.meeting_id == room.meeting_id)
    ).scalar_one_or_none()

    # 취소 투표 현황
    cancel_vote_count = db.execute(
        select(func.count()).select_from(CancelVote).where(CancelVote.meeting_id == meeting.id)
    ).scalar_one()
    my_cancel_voted = db.execute(
        select(CancelVote.id).where(
            CancelVote.meeting_id == meeting.id,
            CancelVote.user_id == user.id,
        )
    ).first() is not None

    # 일정 투표 현황
    schedule_vote_count = db.execute(
        select(func.count()).select_from(ScheduleVote).where(ScheduleVote.meeting_id == meeting.id)
    ).scalar_one()
    my_schedule_voted = db.execute(
        select(ScheduleVote.id).where(
            ScheduleVote.meeting_id == meeting.id,
            ScheduleVote.user_id == user.id,
        )
    ).first() is not None

    # 멤버 목록 (user_id + nickname)
    slots = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting.id,
            MeetingSlot.user_id.isnot(None),
        )
    ).scalars().all()
    member_ids = [s.user_id for s in slots]
    members_map: dict[int, User] = {}
    if member_ids:
        member_users = db.execute(select(User).where(User.id.in_(member_ids))).scalars().all()
        members_map = {u.id: u for u in member_users}

    members = [
        {"user_id": uid, "nickname": members_map[uid].nickname if uid in members_map else f"유저#{uid}"}
        for uid in member_ids
    ]

    return {
        "room_id": room_id,
        "meeting_id": room.meeting_id,
        "meeting_title": meeting.title,
        "host_user_id": meeting.host_user_id,
        "meeting_type": meeting.meeting_type.value,
        "total_members": total_members,
        "is_closed": room.is_closed,
        "members": members,
        "schedule": {
            "date": schedule.date,
            "time": schedule.time,
            "place": schedule.place,
            "confirmed": schedule.confirmed,
        } if schedule else None,
        "cancel_vote_count": cancel_vote_count,
        "my_cancel_voted": my_cancel_voted,
        "schedule_vote_count": schedule_vote_count,
        "my_schedule_voted": my_schedule_voted,
    }


# ─── 메시지 폴링 ──────────────────────────────────────────────────

@router.get("/chats/{room_id}")
def get_messages(
    room_id: int,
    since_id: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting_id = room.meeting_id

    msgs = db.execute(
        select(ChatMessage)
        .where(ChatMessage.room_id == room_id, ChatMessage.id > since_id)
        .order_by(ChatMessage.id.asc())
        .limit(limit)
    ).scalars().all()

    # 읽음 확인 업데이트: 전체 최신 메시지 id로 갱신
    if msgs:
        latest_id = msgs[-1].id
        _upsert_read_receipt(db, room_id, user.id, latest_id)
        db.commit()

    if not msgs:
        return {"messages": []}

    # 닉네임 맵 구성 (sender_user_id 집합)
    sender_ids = {m.sender_user_id for m in msgs if m.sender_user_id != 0}
    users = db.execute(
        select(User).where(User.id.in_(sender_ids))
    ).scalars().all() if sender_ids else []
    nickname_map: dict[int, str | None] = {u.id: u.nickname for u in users}
    photo_map: dict[int, str | None] = {u.id: u.photo_url_1 for u in users}

    # 미읽음 계산: 전체 멤버 수 - 이 메시지 이상 읽은 사람 수
    total_members = _get_total_members(db, meeting_id)
    receipts = db.execute(
        select(ChatReadReceipt).where(ChatReadReceipt.room_id == room_id)
    ).scalars().all()

    def unread_count(msg_id: int) -> int:
        readers = sum(1 for r in receipts if r.last_read_message_id >= msg_id)
        return max(0, total_members - readers)

    return {
        "messages": [
            {
                "id": m.id,
                "room_id": m.room_id,
                "sender_user_id": m.sender_user_id,
                "sender_nickname": nickname_map.get(m.sender_user_id) if m.sender_user_id != 0 else None,
                "sender_photo_url": photo_map.get(m.sender_user_id) if m.sender_user_id != 0 else None,
                "content": m.content,
                "created_at": m.created_at,
                "unread_count": unread_count(m.id),
            }
            for m in msgs
        ]
    }


# ─── 유저 신고 ───────────────────────────────────────────────────

class ReportRequest(BaseModel):
    reported_user_id: int
    evidence_message_id: int
    reason: str   # SEXUAL_CONTENT | HARASSMENT | SPAM | OTHER
    detail: Optional[str] = None


@router.post("/chats/{room_id}/report")
def report_user(
    room_id: int,
    payload: ReportRequest,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """채팅방 내 유저 신고. 증거 메시지 ID 포함."""
    from app.models.chat_report import ChatReport, ReportReason, ReportStatus

    if payload.reported_user_id == user.id:
        raise HTTPException(400, "자기 자신을 신고할 수 없습니다.")

    # 채팅방 확인
    room = db.get(ChatRoom, room_id)
    if not room:
        raise HTTPException(404, "채팅방을 찾을 수 없습니다.")

    # 신고자 멤버 확인
    meeting = db.get(Meeting, room.meeting_id)
    if not meeting:
        raise HTTPException(404, "미팅을 찾을 수 없습니다.")

    slots = db.execute(
        select(MeetingSlot).where(MeetingSlot.meeting_id == meeting.id)
    ).scalars().all()
    member_ids = {s.user_id for s in slots if s.user_id is not None}

    if user.id not in member_ids:
        raise HTTPException(403, "해당 채팅방의 멤버가 아닙니다.")
    if payload.reported_user_id not in member_ids:
        raise HTTPException(400, "피신고자가 해당 채팅방의 멤버가 아닙니다.")

    # 중복 신고 확인 (동일 room+reporter+reported PENDING)
    existing = db.execute(
        select(ChatReport).where(
            ChatReport.room_id == room_id,
            ChatReport.reporter_user_id == user.id,
            ChatReport.reported_user_id == payload.reported_user_id,
            ChatReport.status == ReportStatus.PENDING,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "이미 해당 유저에 대한 신고가 접수 중입니다.")

    # 증거 메시지 스냅샷
    evidence_content = None
    msg = db.get(ChatMessage, payload.evidence_message_id)
    if msg and msg.room_id == room_id:
        evidence_content = msg.content

    try:
        reason = ReportReason(payload.reason)
    except ValueError:
        raise HTTPException(400, f"올바르지 않은 신고 사유입니다: {payload.reason}")

    report = ChatReport(
        room_id=room_id,
        meeting_id=meeting.id,
        reporter_user_id=user.id,
        reported_user_id=payload.reported_user_id,
        evidence_message_id=payload.evidence_message_id,
        evidence_content=evidence_content,
        reason=reason,
        detail=payload.detail,
        status=ReportStatus.PENDING,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {"ok": True, "report_id": report.id}


# ─── WebSocket 실시간 채팅 ────────────────────────────────────────

@router.websocket("/ws/chats/{room_id}")
async def ws_chat(
    room_id: int,
    websocket: WebSocket,
    token: str = Query(...),
):
    """
    채팅방 WebSocket 엔드포인트 (서버→클라이언트 pure push).

    인증: ?token=ACCESS_TOKEN (Browser WS API는 custom header 불가)
    클라이언트 수신 이벤트:
      {"type": "message",      ...메시지 필드}
      {"type": "refresh_info"}   → 채팅방 정보(투표/일정) 재조회 신호
      {"type": "room_closed",  "reason": "cancelled"|"completed"}
    """
    # ── 1. 토큰 인증 ──────────────────────────────────────────────
    try:
        payload = decode_token(token)
    except ValueError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    if payload.get("type") != "access":
        await websocket.close(code=4001, reason="Not an access token")
        return

    user_id_str = payload.get("sub")
    if not user_id_str or not str(user_id_str).isdigit():
        await websocket.close(code=4001, reason="Invalid subject")
        return
    user_id = int(user_id_str)

    # ── 2. 멤버 + 인증 검증 ───────────────────────────────────────
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user or user.verification_status != VerificationStatus.VERIFIED:
            await websocket.close(code=4003, reason="Not verified")
            return
        if user.is_banned:
            await websocket.close(code=4003, reason="Banned")
            return
        if user.suspended_until:
            suspended = user.suspended_until if user.suspended_until.tzinfo else user.suspended_until.replace(tzinfo=timezone.utc)
            if suspended > datetime.now(timezone.utc):
                await websocket.close(code=4003, reason="Suspended")
                return

        room = db.get(ChatRoom, room_id)
        if not room:
            await websocket.close(code=4004, reason="Room not found")
            return

        slot = db.execute(
            select(MeetingSlot).where(
                MeetingSlot.meeting_id == room.meeting_id,
                MeetingSlot.user_id == user_id,
            )
        ).scalar_one_or_none()

        if not slot or not slot.confirmed:
            await websocket.close(code=4003, reason="Not a confirmed member")
            return
    finally:
        db.close()

    # ── 3. 연결 등록 ──────────────────────────────────────────────
    await manager.connect(room_id, websocket)
    try:
        # 연결 유지: 클라이언트 disconnect 감지만 담당
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(room_id, websocket)


# ─── 메시지 전송 ──────────────────────────────────────────────────

@router.post("/chats/{room_id}/messages")
@_rate_limit("30/minute")
async def send_message(
    room_id: int,
    payload: ChatSendIn,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    room = _ensure_user_in_room(db, room_id, user.id)
    if room.is_closed:
        raise HTTPException(status_code=403, detail="채팅방이 종료되었습니다.")
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required.")

    # idempotency: 같은 client_message_id면 기존 메시지 반환
    if payload.client_message_id:
        existing = db.execute(
            select(ChatMessage).where(
                ChatMessage.sender_user_id == user.id,
                ChatMessage.client_message_id == payload.client_message_id,
            )
        ).scalar_one_or_none()
        if existing:
            return existing

    msg = ChatMessage(
        room_id=room_id,
        sender_user_id=user.id,
        content=content,
        created_at=_now(),
        client_message_id=payload.client_message_id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # 발신자 읽음 처리
    _upsert_read_receipt(db, room_id, user.id, msg.id)
    db.commit()

    # 미읽음 수 계산
    meeting_id = room.meeting_id
    total_members = _get_total_members(db, meeting_id)
    receipts = db.execute(
        select(ChatReadReceipt).where(ChatReadReceipt.room_id == room_id)
    ).scalars().all()
    readers = sum(1 for r in receipts if r.last_read_message_id >= msg.id)
    unread = max(0, total_members - readers)

    # WS 브로드캐스트
    await manager.broadcast(room_id, {
        "type": "message",
        "id": msg.id,
        "room_id": room_id,
        "sender_user_id": user.id,
        "sender_nickname": user.nickname,
        "sender_photo_url": user.photo_url_1,
        "content": content,
        "created_at": msg.created_at.isoformat(),
        "unread_count": unread,
    })

    return {"id": msg.id}


# ─── 읽음 기록 갱신 ──────────────────────────────────────────────

@router.post("/chats/{room_id}/read")
async def mark_read(
    room_id: int,
    payload: ReadReceiptIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """WS로 메시지 수신 후 읽음 기록 업데이트 → refresh_unreads 브로드캐스트"""
    _ensure_user_in_room(db, room_id, user.id)
    _upsert_read_receipt(db, room_id, user.id, payload.message_id)
    db.commit()
    await manager.broadcast(room_id, {"type": "refresh_unreads"})
    return {"status": "ok"}


# ─── 채팅방 나가기 ────────────────────────────────────────────────

@router.post("/chats/{room_id}/leave")
async def leave_chat_room(
    room_id: int,
    payload: LeaveChatIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    채팅방(CONFIRMED 미팅) 나가기
    - forfeit: 보증금 몰수 + 슬롯 비우기 + 미팅 RECRUITING 복귀
    - replace: 대체인원 전화번호 입력 → MeetingInvitation(REPLACE) 생성, 수락 전까지 유지
    """
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.execute(
        select(Meeting).where(Meeting.id == room.meeting_id).with_for_update()
    ).scalar_one_or_none()

    if not meeting:
        raise HTTPException(404, "Meeting not found")

    my_slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting.id,
            MeetingSlot.user_id == user.id,
        ).with_for_update()
    ).scalar_one_or_none()

    if not my_slot:
        raise HTTPException(403, "슬롯을 찾을 수 없습니다.")

    # COMPLETED(읽기전용) 채팅방: forfeit/replace 없이 슬롯만 비움
    if room.is_closed:
        my_slot.user_id = None
        my_slot.confirmed = False

        remaining = db.execute(
            select(func.count()).select_from(MeetingSlot).where(
                MeetingSlot.meeting_id == meeting.id,
                MeetingSlot.user_id.isnot(None),
            )
        ).scalar_one()

        if remaining == 0:
            chat_room_obj = db.get(ChatRoom, room_id)
            if chat_room_obj:
                db.delete(chat_room_obj)
            db.commit()
            return {"status": "left", "meeting_deleted": True}

        db.commit()
        return {"status": "left", "meeting_deleted": False}

    if payload.leave_type == "replace":
        # 대체인원 초대
        if not payload.replace_user_id:
            raise HTTPException(400, "대체 인원을 선택해주세요.")

        target = db.get(User, payload.replace_user_id)
        if not target:
            raise HTTPException(404, "대체 인원을 찾을 수 없습니다.")
        if target.gender != user.gender:
            raise HTTPException(400, "같은 성별의 친구만 대체 인원으로 초대 가능합니다.")

        # 친구 관계 확인
        friendship = db.execute(
            select(Friendship).where(
                Friendship.status == FriendStatus.ACCEPTED,
                or_(
                    and_(Friendship.requester_id == user.id, Friendship.addressee_id == target.id),
                    and_(Friendship.requester_id == target.id, Friendship.addressee_id == user.id),
                )
            )
        ).scalar_one_or_none()
        if not friendship:
            raise HTTPException(403, "친구 목록에 있는 유저만 대체 인원으로 초대할 수 있습니다.")

        # 이미 해당 미팅 멤버인지 확인
        already_member = db.execute(
            select(MeetingSlot).where(
                MeetingSlot.meeting_id == meeting.id,
                MeetingSlot.user_id == target.id,
            )
        ).scalar_one_or_none()
        if already_member:
            raise HTTPException(400, "이미 같은 미팅에 참여 중인 멤버는 대체 인원으로 초대할 수 없습니다.")

        # 선호학교 제한 검증 (대체인원도 동일 조건 적용)
        if not meeting.preferred_universities_any:
            _allowed = [u.strip() for u in (meeting.preferred_universities_raw or "").split(",") if u.strip()]
            if _allowed:
                host_user = db.get(User, meeting.host_user_id)
                if host_user and host_user.gender:
                    host_team = Team.MALE if str(host_user.gender).upper() == "MALE" else Team.FEMALE
                    inviter_team = Team.MALE if str(user.gender).upper() == "MALE" else Team.FEMALE
                    opposite = Team.FEMALE if host_team == Team.MALE else Team.MALE
                    if inviter_team == opposite:
                        if not target.university or target.university.strip() not in _allowed:
                            raise HTTPException(
                                403,
                                f"이 미팅은 특정 학교 학생만 참가할 수 있습니다. "
                                f"대체 인원도 같은 조건이 적용됩니다. (허용: {', '.join(_allowed)})",
                            )

        from datetime import timedelta

        # 이미 대기 중인 초대가 있으면 차단 (PENDING 또는 수락 후 보증금 미결제 상태 포함)
        existing_pending = db.execute(
            select(MeetingInvitation).where(
                MeetingInvitation.meeting_id == meeting.id,
                MeetingInvitation.inviter_id == user.id,
                MeetingInvitation.invite_type == InviteType.REPLACE,
                MeetingInvitation.status.in_([InviteStatus.PENDING, InviteStatus.DEPOSIT_PENDING]),
            )
        ).scalar_one_or_none()
        if existing_pending:
            if existing_pending.status == InviteStatus.DEPOSIT_PENDING:
                raise HTTPException(400, "대체 인원이 매칭권 소모 대기 중입니다. 완료 후 자동 교체됩니다.")
            raise HTTPException(400, "이미 대기 중인 초대가 있습니다. 상대방의 응답을 기다려주세요.")

        # 총 시도 횟수 (재초대 포함, 매번 새 레코드 INSERT 방식으로 정확히 카운트)
        my_attempt_count = db.execute(
            select(func.count()).select_from(MeetingInvitation).where(
                MeetingInvitation.meeting_id == meeting.id,
                MeetingInvitation.inviter_id == user.id,
                MeetingInvitation.invite_type == InviteType.REPLACE,
            )
        ).scalar_one()

        if my_attempt_count >= 3:
            raise HTTPException(400, f"대체 인원 초대는 최대 3번까지만 가능합니다. ({my_attempt_count}/3회 사용)")

        remaining_after = 3 - (my_attempt_count + 1)

        db.add(MeetingInvitation(
            meeting_id=meeting.id,
            inviter_id=user.id,
            invitee_id=target.id,
            invite_type=InviteType.REPLACE,
            status=InviteStatus.PENDING,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=48),
        ))

        if remaining_after == 0:
            popup_msg = "대체 인원 초대가 발송되었습니다. ⚠️ 마지막 초대 기회입니다. 거절 시 매칭권이 소모되고 자동으로 퇴장됩니다."
        else:
            popup_msg = f"대체 인원 초대가 발송되었습니다. 초대 기회가 {remaining_after}번 남았습니다."

        db.commit()
        return {
            "status": "replace_invited",
            "remaining_attempts": remaining_after,
            "message": popup_msg,
        }

    elif payload.leave_type == "forfeit":
        nickname = user.nickname or f"유저#{user.id}"
        await _execute_forfeit_cancel(
            db, room_id, meeting, user,
            f"[SYSTEM] {nickname}님이 나가서 미팅이 취소되었습니다.",
        )
        return {"status": "cancelled", "meeting_status": MeetingStatus.CANCELLED.value}

    else:
        raise HTTPException(400, "leave_type은 'forfeit' 또는 'replace' 여야 합니다.")


# ─── 미팅 취소 투표 제안 ──────────────────────────────────────────

@router.post("/chats/{room_id}/cancel/propose")
async def propose_cancel(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """취소 투표 시작 (제안자 자동 투표 포함)"""
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.get(Meeting, room.meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    # 이미 진행 중인 투표 확인
    existing_count = db.execute(
        select(func.count()).select_from(CancelVote).where(CancelVote.meeting_id == meeting.id)
    ).scalar_one()
    if existing_count > 0:
        raise HTTPException(400, "이미 취소 투표가 진행 중입니다.")

    # 제안자 자동 투표
    vote = CancelVote(
        meeting_id=meeting.id,
        user_id=user.id,
        voted_at=_now(),
    )
    db.add(vote)

    total_members = _get_total_members(db, meeting.id)
    sys_msg = _send_system_message(db, room_id,
        f"[CANCEL_VOTE] 미팅 취소 투표가 시작되었습니다. 1/{total_members}명 동의")

    db.commit()

    await manager.broadcast(room_id, {
        "type": "message", "id": sys_msg.id, "room_id": room_id,
        "sender_user_id": 0, "sender_nickname": None,
        "content": sys_msg.content, "created_at": sys_msg.created_at.isoformat(), "unread_count": 0,
    })
    await manager.broadcast(room_id, {"type": "refresh_info"})

    return {"status": "proposed", "vote_count": 1, "total_members": total_members}


# ─── 미팅 취소 투표 동의 ──────────────────────────────────────────

@router.post("/chats/{room_id}/cancel/agree")
async def agree_cancel(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """취소 투표 동의. 전원 동의 시 미팅 취소 처리."""
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.execute(
        select(Meeting).where(Meeting.id == room.meeting_id).with_for_update()
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    # 이미 투표했으면 중복 방지
    already = db.execute(
        select(CancelVote.id).where(
            CancelVote.meeting_id == meeting.id,
            CancelVote.user_id == user.id,
        )
    ).first()
    if already:
        raise HTTPException(400, "이미 동의하셨습니다.")

    vote = CancelVote(
        meeting_id=meeting.id,
        user_id=user.id,
        voted_at=_now(),
    )
    db.add(vote)
    db.flush()

    vote_count = db.execute(
        select(func.count()).select_from(CancelVote).where(CancelVote.meeting_id == meeting.id)
    ).scalar_one()
    total_members = _get_total_members(db, meeting.id)

    if vote_count >= total_members:
        # 전원 동의 → 미팅 취소 처리
        sys_msg = _send_system_message(db, room_id,
            f"[CANCEL_VOTE] {vote_count}/{total_members}명 동의 — 미팅이 취소되었습니다.")

        # 참여자 매칭권 환급
        from app.api.routes.wallet import refund_ticket
        slots = db.execute(
            select(MeetingSlot).where(
                MeetingSlot.meeting_id == meeting.id,
                MeetingSlot.user_id.is_not(None),
            )
        ).scalars().all()
        for slot in slots:
            member = db.get(User, slot.user_id)
            if member:
                refund_ticket(db, member, meeting.id)

        # 미팅 상태 변경
        meeting.status = MeetingStatus.CANCELLED
        db.commit()

        # WS 브로드캐스트 (room 삭제 전에)
        await manager.broadcast(room_id, {
            "type": "message", "id": sys_msg.id, "room_id": room_id,
            "sender_user_id": 0, "sender_nickname": None,
            "content": sys_msg.content, "created_at": sys_msg.created_at.isoformat(), "unread_count": 0,
        })
        await manager.broadcast(room_id, {"type": "room_closed", "reason": "cancelled"})

        # 채팅방 삭제 (cascade로 메시지, 읽음기록 자동 삭제)
        chat_room = db.get(ChatRoom, room_id)
        if chat_room:
            db.delete(chat_room)
            db.commit()

        return {"status": "cancelled", "vote_count": vote_count, "total_members": total_members}
    else:
        sys_msg = _send_system_message(db, room_id,
            f"[CANCEL_VOTE] {vote_count}/{total_members}명 동의")
        db.commit()

        await manager.broadcast(room_id, {
            "type": "message", "id": sys_msg.id, "room_id": room_id,
            "sender_user_id": 0, "sender_nickname": None,
            "content": sys_msg.content, "created_at": sys_msg.created_at.isoformat(), "unread_count": 0,
        })
        await manager.broadcast(room_id, {"type": "refresh_info"})

        return {"status": "voted", "vote_count": vote_count, "total_members": total_members}


# ─── 미팅 취소 투표 철회 ──────────────────────────────────────────

@router.post("/chats/{room_id}/cancel/withdraw")
async def withdraw_cancel(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """내 취소 투표 철회. 남은 투표가 0이면 제안 자체가 사라짐."""
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.get(Meeting, room.meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    vote = db.execute(
        select(CancelVote).where(
            CancelVote.meeting_id == meeting.id,
            CancelVote.user_id == user.id,
        )
    ).scalar_one_or_none()
    if not vote:
        raise HTTPException(400, "투표한 내역이 없습니다.")

    db.delete(vote)
    db.flush()

    remaining = db.execute(
        select(func.count()).select_from(CancelVote).where(CancelVote.meeting_id == meeting.id)
    ).scalar_one()
    total_members = _get_total_members(db, meeting.id)

    if remaining == 0:
        sys_msg = _send_system_message(db, room_id, "[SYSTEM] 취소 투표가 철회되었습니다.")
    else:
        sys_msg = _send_system_message(db, room_id,
            f"[SYSTEM] 취소 투표 현황: {remaining}/{total_members}명 동의")

    db.commit()

    await manager.broadcast(room_id, {
        "type": "message", "id": sys_msg.id, "room_id": room_id,
        "sender_user_id": 0, "sender_nickname": None,
        "content": sys_msg.content, "created_at": sys_msg.created_at.isoformat(), "unread_count": 0,
    })
    await manager.broadcast(room_id, {"type": "refresh_info"})

    return {"status": "withdrawn", "vote_count": remaining, "total_members": total_members}


# ─── 미팅 취소 투표 비동의 ────────────────────────────────────────

@router.post("/chats/{room_id}/cancel/disagree")
async def disagree_cancel(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """취소 투표 비동의 → 모든 취소 투표 초기화."""
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.get(Meeting, room.meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    count = db.execute(
        select(func.count()).select_from(CancelVote).where(CancelVote.meeting_id == meeting.id)
    ).scalar_one()
    if count == 0:
        raise HTTPException(400, "진행 중인 취소 투표가 없습니다.")

    db.execute(delete(CancelVote).where(CancelVote.meeting_id == meeting.id))

    nickname = user.nickname or f"유저#{user.id}"
    sys_msg = _send_system_message(db, room_id,
        f"[SYSTEM] {nickname}님이 취소 투표에 반대했습니다. 투표가 무효화되었습니다.")

    db.commit()

    await manager.broadcast(room_id, {
        "type": "message", "id": sys_msg.id, "room_id": room_id,
        "sender_user_id": 0, "sender_nickname": None,
        "content": sys_msg.content, "created_at": sys_msg.created_at.isoformat(), "unread_count": 0,
    })
    await manager.broadcast(room_id, {"type": "refresh_info"})

    return {"status": "disagreed"}


# ─── 미팅 일정 투표 철회 ──────────────────────────────────────────

@router.post("/chats/{room_id}/schedule/withdraw")
async def withdraw_schedule(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """내 일정 동의 투표 철회."""
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.get(Meeting, room.meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    vote = db.execute(
        select(ScheduleVote).where(
            ScheduleVote.meeting_id == meeting.id,
            ScheduleVote.user_id == user.id,
        )
    ).scalar_one_or_none()
    if not vote:
        raise HTTPException(400, "투표한 내역이 없습니다.")

    db.delete(vote)
    db.flush()

    remaining = db.execute(
        select(func.count()).select_from(ScheduleVote).where(ScheduleVote.meeting_id == meeting.id)
    ).scalar_one()
    total_members = _get_total_members(db, meeting.id)

    sys_msg = _send_system_message(db, room_id,
        f"[SYSTEM] 일정 투표 현황: {remaining}/{total_members}명 동의")

    db.commit()

    await manager.broadcast(room_id, {
        "type": "message", "id": sys_msg.id, "room_id": room_id,
        "sender_user_id": 0, "sender_nickname": None,
        "content": sys_msg.content, "created_at": sys_msg.created_at.isoformat(), "unread_count": 0,
    })
    await manager.broadcast(room_id, {"type": "refresh_info"})

    return {"status": "withdrawn", "vote_count": remaining, "total_members": total_members}


# ─── 미팅 일정 투표 비동의 ────────────────────────────────────────

@router.post("/chats/{room_id}/schedule/disagree")
async def disagree_schedule(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """일정 투표 비동의 → 모든 일정 투표 초기화 (일정 미확정 상태 유지)."""
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.get(Meeting, room.meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    count = db.execute(
        select(func.count()).select_from(ScheduleVote).where(ScheduleVote.meeting_id == meeting.id)
    ).scalar_one()
    if count == 0:
        raise HTTPException(400, "진행 중인 일정 투표가 없습니다.")

    db.execute(delete(ScheduleVote).where(ScheduleVote.meeting_id == meeting.id))

    # schedule.confirmed 는 False 유지
    schedule = db.execute(
        select(MeetingSchedule).where(MeetingSchedule.meeting_id == meeting.id)
    ).scalar_one_or_none()
    if schedule:
        schedule.confirmed = False

    nickname = user.nickname or f"유저#{user.id}"
    sys_msg = _send_system_message(db, room_id,
        f"[SYSTEM] {nickname}님이 일정 투표에 반대했습니다. 투표가 무효화되었습니다.")

    db.commit()

    await manager.broadcast(room_id, {
        "type": "message", "id": sys_msg.id, "room_id": room_id,
        "sender_user_id": 0, "sender_nickname": None,
        "content": sys_msg.content, "created_at": sys_msg.created_at.isoformat(), "unread_count": 0,
    })
    await manager.broadcast(room_id, {"type": "refresh_info"})

    return {"status": "disagreed"}


# ─── 미팅 일정 설정 (HOST만) ──────────────────────────────────────

@router.post("/chats/{room_id}/schedule")
async def set_schedule(
    room_id: int,
    payload: ScheduleIn,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.get(Meeting, room.meeting_id)

    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if meeting.host_user_id != user.id:
        raise HTTPException(403, "HOST만 일정을 설정할 수 있습니다.")

    # UPSERT
    schedule = db.execute(
        select(MeetingSchedule).where(MeetingSchedule.meeting_id == meeting.id)
    ).scalar_one_or_none()

    if schedule:
        schedule.date = payload.date
        schedule.time = payload.time
        schedule.place = payload.place
        schedule.confirmed = False
        schedule.updated_at = _now()
    else:
        schedule = MeetingSchedule(
            meeting_id=meeting.id,
            date=payload.date,
            time=payload.time,
            place=payload.place,
            confirmed=False,
            updated_at=_now(),
        )
        db.add(schedule)

    # 기존 schedule_votes 리셋 + HOST 자동 동의
    db.execute(
        delete(ScheduleVote).where(ScheduleVote.meeting_id == meeting.id)
    )
    host_vote = ScheduleVote(
        meeting_id=meeting.id,
        user_id=user.id,
        voted_at=_now(),
    )
    db.add(host_vote)

    total_members = _get_total_members(db, meeting.id)
    sys_msg = _send_system_message(db, room_id,
        f"[SCHEDULE_VOTE] HOST가 일정을 제안했습니다.\n"
        f"날짜: {payload.date} | 시간: {payload.time} | 장소: {payload.place}\n"
        f"이 일정에 동의하십니까? (1/{total_members}명 동의)")

    db.commit()

    await manager.broadcast(room_id, {
        "type": "message", "id": sys_msg.id, "room_id": room_id,
        "sender_user_id": 0, "sender_nickname": None,
        "content": sys_msg.content, "created_at": sys_msg.created_at.isoformat(), "unread_count": 0,
    })
    await manager.broadcast(room_id, {"type": "refresh_info"})

    return {
        "status": "ok",
        "schedule": {
            "date": schedule.date,
            "time": schedule.time,
            "place": schedule.place,
        }
    }


# ─── 미팅 일정 동의 ───────────────────────────────────────────────

@router.post("/chats/{room_id}/schedule/agree")
async def agree_schedule(
    room_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """일정 투표 동의. 전원 동의 시 일정 확정."""
    room = _ensure_user_in_room(db, room_id, user.id)
    meeting = db.get(Meeting, room.meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    schedule = db.execute(
        select(MeetingSchedule).where(MeetingSchedule.meeting_id == meeting.id)
    ).scalar_one_or_none()
    if not schedule:
        raise HTTPException(400, "제안된 일정이 없습니다.")

    # 이미 투표했으면 중복 방지
    already = db.execute(
        select(ScheduleVote.id).where(
            ScheduleVote.meeting_id == meeting.id,
            ScheduleVote.user_id == user.id,
        )
    ).first()
    if already:
        raise HTTPException(400, "이미 동의하셨습니다.")

    vote = ScheduleVote(
        meeting_id=meeting.id,
        user_id=user.id,
        voted_at=_now(),
    )
    db.add(vote)
    db.flush()

    vote_count = db.execute(
        select(func.count()).select_from(ScheduleVote).where(ScheduleVote.meeting_id == meeting.id)
    ).scalar_one()
    total_members = _get_total_members(db, meeting.id)

    if vote_count >= total_members:
        schedule.confirmed = True
        sys_msg = _send_system_message(db, room_id,
            f"[SCHEDULE_VOTE] {vote_count}/{total_members}명 동의 — 일정이 확정되었습니다!\n"
            f"날짜: {schedule.date} | 시간: {schedule.time} | 장소: {schedule.place}")
        db.commit()

        await manager.broadcast(room_id, {
            "type": "message", "id": sys_msg.id, "room_id": room_id,
            "sender_user_id": 0, "sender_nickname": None,
            "content": sys_msg.content, "created_at": sys_msg.created_at.isoformat(), "unread_count": 0,
        })
        await manager.broadcast(room_id, {"type": "refresh_info"})

        return {"status": "confirmed", "vote_count": vote_count, "total_members": total_members}
    else:
        nickname = user.nickname or f"유저#{user.id}"
        sys_msg = _send_system_message(db, room_id,
            f"[SCHEDULE_VOTE] {nickname}님이 일정에 동의하였습니다. ({vote_count}/{total_members}명)")
        db.commit()

        await manager.broadcast(room_id, {
            "type": "message", "id": sys_msg.id, "room_id": room_id,
            "sender_user_id": 0, "sender_nickname": None,
            "content": sys_msg.content, "created_at": sys_msg.created_at.isoformat(), "unread_count": 0,
        })
        await manager.broadcast(room_id, {"type": "refresh_info"})

        return {"status": "voted", "vote_count": vote_count, "total_members": total_members}


# ─── 미팅 일정 조회 ───────────────────────────────────────────────

@router.get("/meetings/{meeting_id}/schedule")
def get_meeting_schedule(
    meeting_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == user.id,
        )
    ).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=403, detail="Not a member of this meeting")

    schedule = db.execute(
        select(MeetingSchedule).where(MeetingSchedule.meeting_id == meeting_id)
    ).scalar_one_or_none()

    if not schedule:
        return {"schedule": None}

    return {
        "schedule": {
            "date": schedule.date,
            "time": schedule.time,
            "place": schedule.place,
            "confirmed": schedule.confirmed,
        }
    }


# ─── 내 미팅 일정 목록 ────────────────────────────────────────────

@router.get("/me/schedule")
def my_schedules(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """내가 속한 CONFIRMED 미팅들의 일정 목록"""
    my_meeting_ids = db.execute(
        select(MeetingSlot.meeting_id).where(MeetingSlot.user_id == user.id)
    ).scalars().all()

    if not my_meeting_ids:
        return {"schedules": []}

    confirmed_meetings = db.execute(
        select(Meeting).where(
            Meeting.id.in_(my_meeting_ids),
            Meeting.status == MeetingStatus.CONFIRMED,
        )
    ).scalars().all()

    meeting_ids = [m.id for m in confirmed_meetings]

    schedules = db.execute(
        select(MeetingSchedule).where(MeetingSchedule.meeting_id.in_(meeting_ids))
    ).scalars().all()
    schedule_map = {s.meeting_id: s for s in schedules}

    # 채팅방 조회
    from app.models.chat_room import ChatRoom
    rooms = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id.in_(meeting_ids))
    ).scalars().all()
    room_map = {r.meeting_id: r.id for r in rooms}

    return {
        "schedules": [
            {
                "meeting_id": m.id,
                "meeting_type": m.meeting_type.value,
                "title": m.title,
                "chat_room_id": room_map.get(m.id),
                "schedule": {
                    "date": schedule_map[m.id].date if m.id in schedule_map else None,
                    "time": schedule_map[m.id].time if m.id in schedule_map else None,
                    "place": schedule_map[m.id].place if m.id in schedule_map else None,
                    "confirmed": schedule_map[m.id].confirmed if m.id in schedule_map else False,
                }
            }
            for m in confirmed_meetings
        ]
    }
