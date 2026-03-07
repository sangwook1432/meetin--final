from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from collections import defaultdict

from app.core.deps import get_db, require_verified
from app.models.meeting import Meeting, MeetingType, MeetingStatus, Team
from app.models.meeting_slot import MeetingSlot
from app.models.user import User
from app.models.deposit import Deposit, DepositStatus
from app.models.chat_room import ChatRoom

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
        """slowapi 미설치 시 noop 데코레이터"""
        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                return func(*args, **kwargs)
            return wrapper
        return decorator


# -------------------------
# Helpers
# -------------------------
def _capacity_from_type(meeting_type: MeetingType) -> int:
    return 2 if meeting_type == MeetingType.TWO_BY_TWO else 3


def _user_team_from_gender(user) -> Team:
    if not getattr(user, "gender", None):
        raise HTTPException(status_code=400, detail="Profile gender required")
    # user.gender가 Team enum이거나 name이 MALE/FEMALE이라고 가정
    if getattr(user.gender, "name", None) == "MALE" or user.gender == Team.MALE:
        return Team.MALE
    return Team.FEMALE


def _opposite_team(team: Team) -> Team:
    return Team.FEMALE if team == Team.MALE else Team.MALE


def _lock_meeting(db: Session, meeting_id: int) -> Meeting:
    m = db.execute(
        select(Meeting).where(Meeting.id == meeting_id).with_for_update()
    ).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return m


def _lock_slots(db: Session, meeting_id: int) -> list[MeetingSlot]:
    return db.execute(
        select(MeetingSlot)
        .where(MeetingSlot.meeting_id == meeting_id)
        .with_for_update()
        .order_by(MeetingSlot.team.asc(), MeetingSlot.slot_index.asc())
    ).scalars().all()


def _recompute_status(meeting: Meeting, slots: list[MeetingSlot]) -> None:
    filled = sum(1 for s in slots if s.user_id is not None)
    capacity = len(slots)

    if filled < capacity:
        meeting.status = MeetingStatus.RECRUITING
    else:
        # 정원 다 찼으면 confirm 단계로
        if meeting.status != MeetingStatus.CONFIRMED:
            meeting.status = MeetingStatus.WAITING_CONFIRM


# -------------------------
# Create Meeting
# -------------------------
@router.post("/meetings")
def create_meeting(
    meeting_type: MeetingType,
    preferred_universities_raw: str | None = None,
    preferred_universities_any: bool = True,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    ✅ 0-based slot_index 통일
    ✅ host는 자동으로 자신의 팀 슬롯 1칸 차지
    """
    my_team = _user_team_from_gender(user)
    cap = _capacity_from_type(meeting_type)

    meeting = Meeting(
        host_user_id=user.id,
        meeting_type=meeting_type,
        status=MeetingStatus.RECRUITING,
        preferred_universities_raw=preferred_universities_raw,
        preferred_universities_any=preferred_universities_any,
    )
    db.add(meeting)
    db.flush()  # meeting.id 확보

    # 슬롯 생성: slot_index 0..cap-1
    for team in (Team.MALE, Team.FEMALE):
        for idx in range(cap):
            db.add(MeetingSlot(meeting_id=meeting.id, team=team, slot_index=idx))
    db.flush()

    # ✅ host 자동 포함: 내 팀의 가장 앞 슬롯에 host 넣기
    host_slot = db.execute(
        select(MeetingSlot)
        .where(
            MeetingSlot.meeting_id == meeting.id,
            MeetingSlot.team == my_team,
            MeetingSlot.user_id.is_(None),
        )
        .order_by(MeetingSlot.slot_index.asc())
        .limit(1)
    ).scalar_one()

    host_slot.user_id = user.id

    db.commit()
    return {"meeting_id": meeting.id, "meeting_status": meeting.status.value}


# -------------------------
# Join Meeting
# -------------------------
@router.post("/meetings/{meeting_id}/join")
@_rate_limit("30/minute")  # 참가 요청: IP당 분당 30회 제한 (동시 다중 join 방지)
def join_meeting(
    request: Request,
    meeting_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    ✅ 트랜잭션 + row lock으로 동시성 방어
    ✅ 이미 참가중이면 idempotent하게 joined 반환(또는 409)
    ✅ CONFIRMED 이후 join 금지(정책)
    """
    try:
        meeting = _lock_meeting(db, meeting_id)

        if meeting.status == MeetingStatus.CONFIRMED:
            raise HTTPException(status_code=409, detail="Meeting already confirmed")

        slots = _lock_slots(db, meeting_id)

        # 이미 참가했으면 idempotent
        if any(s.user_id == user.id for s in slots):
            return {"joined": True, "meeting_status": meeting.status.value, "already_joined": True}

        my_team = _user_team_from_gender(user)

        empty_slots = [s for s in slots if s.team == my_team and s.user_id is None]
        if not empty_slots:
            raise HTTPException(status_code=409, detail="No empty slot")

        empty_slots[0].user_id = user.id

        _recompute_status(meeting, slots)

        db.commit()
        return {"joined": True, "meeting_status": meeting.status.value}

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# -------------------------
# Leave Meeting (free)
# -------------------------
@router.post("/meetings/{meeting_id}/leave")
def leave_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    무료 나가기(MVP):
      - RECRUITING/FULL/WAITING_CONFIRM 에서만 가능
      - CONFIRMED 이후는 무료 leave 금지(대타 루트)
      - ✅ host가 나가면: 남은 멤버 중 1명에게 host_user_id 재할당
      - ✅ 아무도 남지 않으면: meeting 삭제
    """
    try:
        meeting = _lock_meeting(db, meeting_id)
        slots = _lock_slots(db, meeting_id)

        # 멤버 체크 먼저
        my_slot = next((s for s in slots if s.user_id == user.id), None)
        if not my_slot:
            raise HTTPException(status_code=403, detail="You are not a member of this meeting.")

        # CONFIRMED 이후 무료 leave 금지
        if meeting.status == MeetingStatus.CONFIRMED:
            raise HTTPException(status_code=409, detail="Meeting already confirmed; use replacement flow.")

        if meeting.status not in (
            MeetingStatus.RECRUITING,
            MeetingStatus.FULL,
            MeetingStatus.WAITING_CONFIRM,
        ):
            raise HTTPException(status_code=409, detail="Meeting is not leavable now")

        leaving_user_id = user.id
        leaving_was_host = (meeting.host_user_id == leaving_user_id)

        # ── WAITING_CONFIRM 에서 나가는 경우 ─────────────────
        # 이미 결제(HELD)한 보증금이 있으면 REFUND_PENDING 으로 표시
        # (실제 Toss 환불은 비동기로 처리하거나 관리자 배치에서 실행)
        if meeting.status == MeetingStatus.WAITING_CONFIRM:
            held_deposit = db.execute(
                select(Deposit).where(
                    Deposit.meeting_id == meeting_id,
                    Deposit.user_id == leaving_user_id,
                    Deposit.status == DepositStatus.HELD,
                ).with_for_update()
            ).scalar_one_or_none()

            if held_deposit:
                # REFUND_PENDING: 운영 배치 or /deposits/{id}/refund API 에서 처리
                held_deposit.status = DepositStatus.REFUND_PENDING

            # 나간 유저의 confirmed 리셋은 슬롯 user_id=None 으로 자동 처리됨
            # (slot.confirmed 은 user_id 있는 슬롯만 의미 있음)

        # 슬롯 비우기 + confirmed 리셋
        my_slot.user_id = None
        my_slot.confirmed = False

        # WAITING_CONFIRM 이었다면 남은 멤버들의 confirmed 도 리셋
        # (한 명이 빠지면 전체 다시 확정 필요)
        if meeting.status == MeetingStatus.WAITING_CONFIRM:
            for s in slots:
                if s.user_id is not None:
                    s.confirmed = False

        remaining_user_ids = [s.user_id for s in slots if s.user_id is not None]

        # 아무도 없으면 meeting 삭제
        if len(remaining_user_ids) == 0:
            db.delete(meeting)
            db.commit()
            return {"left": True, "meeting_deleted": True}

        # host가 나가면 host 재할당
        if leaving_was_host:
            meeting.host_user_id = remaining_user_ids[0]

        _recompute_status(meeting, slots)

        db.commit()
        return {"left": True, "meeting_status": meeting.status.value, "host_user_id": meeting.host_user_id}

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

# -------------------------
# Confirm (무결제 경로 — 개발/테스트 or 결제 없는 미팅용)
# -------------------------
@router.post("/meetings/{meeting_id}/confirm")
def confirm_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    참가 확정 (slot.confirmed = True).

    설계 원칙:
      - slot.confirmed 이 유일한 확정 소스.
      - Confirmation 테이블은 사용하지 않음.
      - 결제 플로우(payments.py confirm_payment)도 동일하게 slot.confirmed 을 씀.
      - 이 엔드포인트는 결제 없이 바로 confirm 가능한 경로
        (테스트 / 결제 없는 MVP 운영 시 사용).
    """
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if meeting.status != MeetingStatus.WAITING_CONFIRM:
        raise HTTPException(status_code=400, detail="Not in confirm stage")

    # 내가 속한 슬롯 찾기
    slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == user.id,
        )
    ).scalar_one_or_none()

    if not slot:
        raise HTTPException(status_code=403, detail="Not a meeting member")

    if slot.confirmed:
        chat_room = db.execute(
            select(ChatRoom).where(ChatRoom.meeting_id == meeting_id)
        ).scalar_one_or_none()
        return {
            "meeting_id": meeting.id,
            "status": meeting.status.value,
            "confirmed": True,
            "already_confirmed": True,
            "chat_room_id": chat_room.id if chat_room else None,
        }

    slot.confirmed = True

    # 전체 슬롯 확인
    slots = db.execute(
        select(MeetingSlot).where(MeetingSlot.meeting_id == meeting_id)
    ).scalars().all()

    member_slots = [s for s in slots if s.user_id is not None]
    all_confirmed = member_slots and all(s.confirmed for s in member_slots)

    if all_confirmed:
        meeting.status = MeetingStatus.CONFIRMED

        existing_room = db.execute(
            select(ChatRoom).where(ChatRoom.meeting_id == meeting_id)
        ).scalar_one_or_none()

        if not existing_room:
            db.add(ChatRoom(meeting_id=meeting_id))

    db.commit()

    chat_room = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id == meeting_id)
    ).scalar_one_or_none()

    return {
        "meeting_id": meeting.id,
        "status": meeting.status.value,
        "confirmed": True,
        # 프론트가 바로 채팅방으로 redirect 할 수 있도록 room ID 포함
        "chat_room_id": chat_room.id if chat_room else None,
    }
    
# -------------------------
# Discover
# -------------------------
@router.get("/meetings/discover")
def discover_meetings(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    discover (MVP):
      - 이성이 만든 미팅만 노출 (host gender 기반)
      - RECRUITING만 노출
      - 내 팀 슬롯이 비어있는 미팅만 노출
      - ✅ is_member 포함
    """
    my_team = _user_team_from_gender(user)
    opposite_team = _opposite_team(my_team)

    q = (
        select(Meeting)
        .join(User, User.id == Meeting.host_user_id)
        .where(
            Meeting.status == MeetingStatus.RECRUITING,
            User.gender == opposite_team,
        )
        .order_by(Meeting.id.desc())
        .limit(limit)
    )
    meetings = db.execute(q).scalars().all()

    # ✅ slots 한 번에 가져오기 (N+1 제거)
    meeting_ids = [m.id for m in meetings]
    slots_by_mid: dict[int, list[MeetingSlot]] = defaultdict(list)
    if meeting_ids:
        all_slots = db.execute(
            select(MeetingSlot).where(MeetingSlot.meeting_id.in_(meeting_ids))
        ).scalars().all()
        for s in all_slots:
            slots_by_mid[s.meeting_id].append(s)

    results = []
    for m in meetings:
        slots = slots_by_mid.get(m.id, [])

        # 내 팀 빈자리
        remaining_my = sum(1 for s in slots if s.team == my_team and s.user_id is None)
        if remaining_my <= 0:
            continue

        # ✅ is_member
        is_member = any(s.user_id == user.id for s in slots)

        filled_male = sum(1 for s in slots if s.team == Team.MALE and s.user_id is not None)
        filled_female = sum(1 for s in slots if s.team == Team.FEMALE and s.user_id is not None)

        results.append(
            {
                "meeting_id": m.id,
                "meeting_type": m.meeting_type.value,
                "status": m.status.value,
                "remaining_my_team": remaining_my,
                "preferred_universities_raw": m.preferred_universities_raw,
                "preferred_universities_any": m.preferred_universities_any,
                "is_member": is_member,  # ✅ 추가
                "filled": {
                    "male": filled_male,
                    "female": filled_female,
                    "total": filled_male + filled_female,
                    "capacity": len(slots),
                },
            }
        )

    return {"meetings": results}

@router.get("/meetings/vacancies")
def vacancies(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    vacancies (MVP):
      - 동성이 만든 미팅만 노출 (host gender 기반)
      - RECRUITING만 노출
      - 내 팀 슬롯이 비어있는 미팅만 노출
      - ✅ is_member 포함
    """
    my_team = _user_team_from_gender(user)

    q = (
        select(Meeting)
        .join(User, User.id == Meeting.host_user_id)
        .where(
            Meeting.status == MeetingStatus.RECRUITING,
            User.gender == my_team,
        )
        .order_by(Meeting.id.desc())
        .limit(limit)
    )
    meetings = db.execute(q).scalars().all()

    # ✅ slots 한 번에 가져오기 (N+1 제거)
    meeting_ids = [m.id for m in meetings]
    slots_by_mid: dict[int, list[MeetingSlot]] = defaultdict(list)
    if meeting_ids:
        all_slots = db.execute(
            select(MeetingSlot).where(MeetingSlot.meeting_id.in_(meeting_ids))
        ).scalars().all()
        for s in all_slots:
            slots_by_mid[s.meeting_id].append(s)

    results = []
    for m in meetings:
        slots = slots_by_mid.get(m.id, [])

        remaining_my = sum(1 for s in slots if s.team == my_team and s.user_id is None)
        if remaining_my <= 0:
            continue

        # ✅ is_member
        is_member = any(s.user_id == user.id for s in slots)

        filled_male = sum(1 for s in slots if s.team == Team.MALE and s.user_id is not None)
        filled_female = sum(1 for s in slots if s.team == Team.FEMALE and s.user_id is not None)

        results.append(
            {
                "meeting_id": m.id,
                "meeting_type": m.meeting_type.value,
                "status": m.status.value,
                "remaining_my_team": remaining_my,
                "preferred_universities_raw": m.preferred_universities_raw,
                "preferred_universities_any": m.preferred_universities_any,
                "is_member": is_member,  # ✅ 추가
                "filled": {
                    "male": filled_male,
                    "female": filled_female,
                    "total": filled_male + filled_female,
                    "capacity": len(slots),
                },
            }
        )

    return {"meetings": results}

@router.get("/meetings/{meeting_id}")
def get_meeting_detail(
    meeting_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    미팅 상세:
      - 슬롯 목록(팀/인덱스/유저 공개 프로필)
      - 현재 filled 카운트
      - MVP: 로그인+VERIFIED 유저면 조회 가능(추후 discover/vacancies 노출 기준으로 제한 가능)
    """
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    slots = db.execute(
        select(MeetingSlot).where(MeetingSlot.meeting_id == meeting_id).order_by(
            MeetingSlot.team.asc(), MeetingSlot.slot_index.asc()
        )
    ).scalars().all()

    # 슬롯에 들어있는 유저들 한번에 조회
    user_ids = [s.user_id for s in slots if s.user_id is not None]
    users_by_id = {}
    if user_ids:
        users = db.execute(select(User).where(User.id.in_(user_ids))).scalars().all()
        users_by_id = {u.id: u for u in users}

    def public_profile(u: User) -> dict:
        # 스펙의 “슬롯 클릭 시 공개” 필드만
        entry = getattr(u, "entry_year", None)
        entry_label = f"{entry}학번" if entry is not None else None

        return {
            "user_id": u.id,
            "university": getattr(u, "university", None),
            "major": getattr(u, "major", None),
            "entry_year": entry,
            "entry_label": entry_label,
            "age": getattr(u, "age", None),
            "preferred_area": getattr(u, "preferred_area", None),
            "bio_short": getattr(u, "bio_short", None),
            "lookalike_type": getattr(u, "lookalike_type", None).name if getattr(u, "lookalike_type", None) else None,
            "lookalike_value": getattr(u, "lookalike_value", None),
            "photo_url_1": getattr(u, "photo_url_1", None),
            "photo_url_2": getattr(u, "photo_url_2", None),
        }

    slot_out = []
    for s in slots:
        if s.user_id is None:
            # 빈 슬롯: user 없음, confirmed는 항상 False
            slot_out.append({
                "team": s.team.value,
                "slot_index": s.slot_index,
                "user": None,
                "confirmed": False,          # ← 추가: 빈 슬롯은 미확정
            })
        else:
            u = users_by_id.get(s.user_id)
            slot_out.append({
                "team": s.team.value,
                "slot_index": s.slot_index,
                "user": public_profile(u) if u else {"user_id": s.user_id},
                "confirmed": s.confirmed,    # ← 추가: 실제 확정 여부
            })

    is_member = any(s.user_id == user.id for s in slots)

    # 현재 로그인 유저의 본인 슬롯 confirmed 여부 (WAITING_CONFIRM 화면에서 버튼 상태 결정용)
    my_slot = next((s for s in slots if s.user_id == user.id), None)
    my_confirmed = my_slot.confirmed if my_slot else False

    filled_male = sum(1 for s in slots if s.team == Team.MALE and s.user_id is not None)
    filled_female = sum(1 for s in slots if s.team == Team.FEMALE and s.user_id is not None)

    # chat_room_id: CONFIRMED 상태일 때만 조인 가능 → 프론트에서 바로 활용
    chat_room = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id == meeting_id)
    ).scalar_one_or_none()

    return {
        "meeting_id": meeting.id,
        "meeting_type": meeting.meeting_type.value,
        "status": meeting.status.value,
        "host_user_id": meeting.host_user_id,
        "is_member": is_member,
        "my_confirmed": my_confirmed,        # ← 추가: 내 확정 여부
        "chat_room_id": chat_room.id if chat_room else None,  # ← 추가: 채팅방 ID
        "filled": {
            "male": filled_male,
            "female": filled_female,
            "total": filled_male + filled_female,
            "capacity": len(slots),
        },
        "slots": slot_out,
    }