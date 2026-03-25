from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, func
from collections import defaultdict

from app.core.deps import get_db, require_verified
from app.models.meeting import Meeting, MeetingType, MeetingStatus, Team
from app.models.meeting_slot import MeetingSlot
from app.models.user import User, Gender
from app.models.chat_room import ChatRoom
from app.models.notification import Notification, NotifType

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


def _parse_preferred_universities(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return []
    return [u.strip() for u in raw.split(",") if u.strip()]


def _normalize_entry_year(year: int | None) -> int | None:
    """2자리 학번 통일: 2022 → 22, 22 → 22"""
    if year is None:
        return None
    return year % 100 if year >= 100 else year


# -------------------------
# Create Meeting
# -------------------------
@router.post("/meetings")
def create_meeting(
    meeting_type: MeetingType,
    title: str | None = None,
    preferred_universities_raw: str | None = None,
    preferred_universities_any: bool = True,
    entry_year_min: int | None = None,
    entry_year_max: int | None = None,
    my_team_universities_raw: str | None = None,
    my_team_universities_any: bool = True,
    my_team_entry_year_min: int | None = None,
    my_team_entry_year_max: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    ✅ 0-based slot_index 통일
    ✅ host는 자동으로 자신의 팀 슬롯 1칸 차지
    """
    my_team = _user_team_from_gender(user)
    cap = _capacity_from_type(meeting_type)

    # 유저당 활성 미팅 참여 수 제한 (최대 5개)
    ACTIVE_STATUSES = [
        MeetingStatus.RECRUITING,
        MeetingStatus.FULL,
        MeetingStatus.WAITING_CONFIRM,
        MeetingStatus.CONFIRMED,
    ]
    active_count = db.execute(
        select(func.count())
        .select_from(MeetingSlot)
        .join(Meeting, Meeting.id == MeetingSlot.meeting_id)
        .where(
            MeetingSlot.user_id == user.id,
            Meeting.status.in_(ACTIVE_STATUSES),
        )
    ).scalar_one()
    if active_count >= 5:
        raise HTTPException(
            status_code=409,
            detail="현재 참여 중인 미팅이 5개입니다. 기존 미팅을 완료하거나 나간 후 새 미팅을 만들 수 있습니다.",
        )

    # entry_year 범위 검증 (2자리 기준 0~99)
    def _validate_year_range(mn: int | None, mx: int | None, label: str) -> None:
        if mn is not None and not (0 <= mn <= 99):
            raise HTTPException(400, f"{label} 학번은 0~99 사이여야 합니다.")
        if mx is not None and not (0 <= mx <= 99):
            raise HTTPException(400, f"{label} 학번은 0~99 사이여야 합니다.")
        if mn is not None and mx is not None and mn > mx:
            raise HTTPException(400, f"{label} 최소 학번이 최대 학번보다 클 수 없습니다.")

    _validate_year_range(entry_year_min, entry_year_max, "상대팀")
    _validate_year_range(my_team_entry_year_min, my_team_entry_year_max, "우리팀")

    meeting = Meeting(
        host_user_id=user.id,
        meeting_type=meeting_type,
        title=title,
        status=MeetingStatus.RECRUITING,
        preferred_universities_raw=preferred_universities_raw,
        preferred_universities_any=preferred_universities_any,
        entry_year_min=entry_year_min,
        entry_year_max=entry_year_max,
        my_team_universities_raw=my_team_universities_raw,
        my_team_universities_any=my_team_universities_any,
        my_team_entry_year_min=my_team_entry_year_min,
        my_team_entry_year_max=my_team_entry_year_max,
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

        # 유저당 활성 미팅 참여 수 제한 (최대 5개)
        ACTIVE_STATUSES = [
            MeetingStatus.RECRUITING,
            MeetingStatus.FULL,
            MeetingStatus.WAITING_CONFIRM,
            MeetingStatus.CONFIRMED,
        ]
        active_count = db.execute(
            select(func.count())
            .select_from(MeetingSlot)
            .join(Meeting, Meeting.id == MeetingSlot.meeting_id)
            .where(
                MeetingSlot.user_id == user.id,
                Meeting.status.in_(ACTIVE_STATUSES),
            )
        ).scalar_one()
        if active_count >= 5:
            raise HTTPException(
                status_code=409,
                detail="현재 참여 중인 미팅이 5개입니다. 기존 미팅을 완료하거나 나간 후 참여해주세요.",
            )

        my_team = _user_team_from_gender(user)

        # 선호학교 / 학번 제한 검증 (상대팀만 적용)
        host_user = db.get(User, meeting.host_user_id)
        host_team = _user_team_from_gender(host_user) if host_user else None
        is_opposite_team = host_team is not None and my_team == _opposite_team(host_team)

        if is_opposite_team:
            # 선호학교 검증 (상대팀 조건)
            if not meeting.preferred_universities_any:
                allowed = _parse_preferred_universities(meeting.preferred_universities_raw)
                if allowed:
                    if not user.university or user.university.strip() not in allowed:
                        raise HTTPException(
                            status_code=403,
                            detail="이 미팅은 특정 학교 학생만 참가할 수 있습니다.",
                        )

            # 학번 범위 검증 (상대팀 조건)
            if meeting.entry_year_min is not None or meeting.entry_year_max is not None:
                user_year = _normalize_entry_year(user.entry_year)
                if user_year is None:
                    raise HTTPException(
                        status_code=403,
                        detail="학번이 등록되지 않아 이 미팅에 참가할 수 없습니다.",
                    )
                if meeting.entry_year_min is not None and user_year < meeting.entry_year_min:
                    raise HTTPException(
                        status_code=403,
                        detail=f"이 미팅은 {meeting.entry_year_min}학번 이상만 참가할 수 있습니다.",
                    )
                if meeting.entry_year_max is not None and user_year > meeting.entry_year_max:
                    raise HTTPException(
                        status_code=403,
                        detail=f"이 미팅은 {meeting.entry_year_max}학번 이하만 참가할 수 있습니다.",
                    )
        else:
            # 우리팀 조건 검증 (같은 팀 합류 시)
            if not meeting.my_team_universities_any:
                allowed = _parse_preferred_universities(meeting.my_team_universities_raw)
                if allowed:
                    if not user.university or user.university.strip() not in allowed:
                        raise HTTPException(
                            status_code=403,
                            detail="이 미팅은 특정 학교 팀원만 합류할 수 있습니다.",
                        )

            if meeting.my_team_entry_year_min is not None or meeting.my_team_entry_year_max is not None:
                user_year = _normalize_entry_year(user.entry_year)
                if user_year is None:
                    raise HTTPException(
                        status_code=403,
                        detail="학번이 등록되지 않아 이 미팅에 참가할 수 없습니다.",
                    )
                if meeting.my_team_entry_year_min is not None and user_year < meeting.my_team_entry_year_min:
                    raise HTTPException(
                        status_code=403,
                        detail=f"이 미팅은 {meeting.my_team_entry_year_min}학번 이상 팀원만 합류할 수 있습니다.",
                    )
                if meeting.my_team_entry_year_max is not None and user_year > meeting.my_team_entry_year_max:
                    raise HTTPException(
                        status_code=403,
                        detail=f"이 미팅은 {meeting.my_team_entry_year_max}학번 이하 팀원만 합류할 수 있습니다.",
                    )

        empty_slots = [s for s in slots if s.team == my_team and s.user_id is None]
        if not empty_slots:
            raise HTTPException(status_code=409, detail="No empty slot")

        prev_status = meeting.status
        empty_slots[0].user_id = user.id

        _recompute_status(meeting, slots)

        if prev_status != MeetingStatus.WAITING_CONFIRM and meeting.status == MeetingStatus.WAITING_CONFIRM:
            for slot in slots:
                if slot.user_id is not None:
                    db.add(Notification(
                        user_id=slot.user_id,
                        notif_type=NotifType.WAITING_CONFIRM,
                        message="미팅 인원이 충족되었습니다. 매칭권을 소모하여 채팅방을 만들 수 있습니다.",
                        meeting_id=meeting.id,
                    ))

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
        # 채팅방 개설 전이므로 매칭권 미소모 상태 → 환급 불필요
        # (티켓은 전원 확정 순간에만 소모되기 때문)

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
    meeting = db.execute(
        select(Meeting).where(Meeting.id == meeting_id).with_for_update()
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if meeting.status != MeetingStatus.WAITING_CONFIRM:
        raise HTTPException(status_code=400, detail="Not in confirm stage")

    # 내가 속한 슬롯 찾기
    slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == user.id,
        ).with_for_update()
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

    slots = db.execute(
        select(MeetingSlot).where(MeetingSlot.meeting_id == meeting_id)
    ).scalars().all()

    member_slots = [s for s in slots if s.user_id is not None]
    all_confirmed = member_slots and all(s.confirmed for s in member_slots)

    if all_confirmed:
        # 전원 확정 → 각 멤버 매칭권 1개씩 소모
        from app.api.routes.wallet import consume_ticket
        member_users = db.execute(
            select(User).where(User.id.in_([s.user_id for s in member_slots])).with_for_update()
        ).scalars().all()

        # 티켓 부족 유저 먼저 검사
        for mu in member_users:
            if mu.matching_tickets < 1:
                raise HTTPException(status_code=400, detail="매칭권이 없는 멤버가 있습니다. 전원 매칭권을 보유해야 합니다.")

        # 전원 소모
        for mu in member_users:
            consume_ticket(db, mu, meeting_id)

        meeting.status = MeetingStatus.CONFIRMED

        existing_room = db.execute(
            select(ChatRoom).where(ChatRoom.meeting_id == meeting_id)
        ).scalar_one_or_none()

        if not existing_room:
            db.add(ChatRoom(meeting_id=meeting_id))

        meeting_label = f"'{meeting.title}'" if meeting.title else f"미팅 #{meeting_id}"
        for mu in member_users:
            db.add(Notification(
                user_id=mu.id,
                notif_type=NotifType.CHAT_ROOM_ACTIVATED,
                message=f"{meeting_label} 채팅방이 활성화되었습니다",
                meeting_id=meeting_id,
            ))

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
# -------------------------
# My Meetings
# -------------------------
@router.get("/meetings/me")
def get_my_meetings(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    내가 참여한 미팅 목록:
      - MeetingSlot.user_id == current_user.id 인 rows 조인
      - 해당 Meeting 목록 반환
    """
    slots = db.execute(
        select(MeetingSlot).where(MeetingSlot.user_id == user.id)
    ).scalars().all()

    meeting_ids = list({s.meeting_id for s in slots})
    if not meeting_ids:
        return {"meetings": []}

    meetings = db.execute(
        select(Meeting).where(Meeting.id.in_(meeting_ids)).order_by(Meeting.id.desc())
    ).scalars().all()

    # chat rooms
    chat_rooms = db.execute(
        select(ChatRoom).where(ChatRoom.meeting_id.in_(meeting_ids))
    ).scalars().all()
    chat_room_by_mid = {cr.meeting_id: cr.id for cr in chat_rooms}

    results = []
    for m in meetings:
        results.append({
            "meeting_id": m.id,
            "meeting_type": m.meeting_type.value,
            "title": m.title,
            "status": m.status.value,
            "host_user_id": m.host_user_id,
            "is_host": m.host_user_id == user.id,
            "chat_room_id": chat_room_by_mid.get(m.id),
        })

    return {"meetings": results}


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
    opposite_gender = Gender.MALE if opposite_team == Team.MALE else Gender.FEMALE

    q = (
        select(Meeting)
        .join(User, User.id == Meeting.host_user_id)
        .where(
            Meeting.status == MeetingStatus.RECRUITING,
            User.gender == opposite_gender,
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

        # 선호학교 조건 미충족 미팅 제외 (discover는 항상 상대팀)
        if not m.preferred_universities_any:
            allowed = _parse_preferred_universities(m.preferred_universities_raw)
            if allowed:
                if not user.university or user.university.strip() not in allowed:
                    continue

        # 학번 범위 조건 미충족 미팅 제외
        if m.entry_year_min is not None or m.entry_year_max is not None:
            user_year = _normalize_entry_year(user.entry_year)
            if user_year is None:
                continue
            if m.entry_year_min is not None and user_year < m.entry_year_min:
                continue
            if m.entry_year_max is not None and user_year > m.entry_year_max:
                continue

        # ✅ is_member
        is_member = any(s.user_id == user.id for s in slots)

        filled_male = sum(1 for s in slots if s.team == Team.MALE and s.user_id is not None)
        filled_female = sum(1 for s in slots if s.team == Team.FEMALE and s.user_id is not None)

        results.append(
            {
                "meeting_id": m.id,
                "meeting_type": m.meeting_type.value,
                "title": m.title,
                "status": m.status.value,
                "remaining_my_team": remaining_my,
                "preferred_universities_raw": m.preferred_universities_raw,
                "preferred_universities_any": m.preferred_universities_any,
                "entry_year_min": m.entry_year_min,
                "entry_year_max": m.entry_year_max,
                "my_team_universities_raw": m.my_team_universities_raw,
                "my_team_universities_any": m.my_team_universities_any,
                "my_team_entry_year_min": m.my_team_entry_year_min,
                "my_team_entry_year_max": m.my_team_entry_year_max,
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
    my_gender = Gender.MALE if my_team == Team.MALE else Gender.FEMALE

    q = (
        select(Meeting)
        .join(User, User.id == Meeting.host_user_id)
        .where(
            Meeting.status == MeetingStatus.RECRUITING,
            User.gender == my_gender,
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

        # 우리팀 조건 필터링 (vacancies는 내가 같은 팀이므로 my_team 조건 적용)
        if not m.my_team_universities_any:
            allowed = _parse_preferred_universities(m.my_team_universities_raw)
            if allowed:
                if not user.university or user.university.strip() not in allowed:
                    continue

        if m.my_team_entry_year_min is not None or m.my_team_entry_year_max is not None:
            user_year = _normalize_entry_year(user.entry_year)
            if user_year is None:
                continue
            if m.my_team_entry_year_min is not None and user_year < m.my_team_entry_year_min:
                continue
            if m.my_team_entry_year_max is not None and user_year > m.my_team_entry_year_max:
                continue

        # ✅ is_member
        is_member = any(s.user_id == user.id for s in slots)

        filled_male = sum(1 for s in slots if s.team == Team.MALE and s.user_id is not None)
        filled_female = sum(1 for s in slots if s.team == Team.FEMALE and s.user_id is not None)

        results.append(
            {
                "meeting_id": m.id,
                "meeting_type": m.meeting_type.value,
                "title": m.title,
                "status": m.status.value,
                "remaining_my_team": remaining_my,
                "preferred_universities_raw": m.preferred_universities_raw,
                "preferred_universities_any": m.preferred_universities_any,
                "entry_year_min": m.entry_year_min,
                "entry_year_max": m.entry_year_max,
                "my_team_universities_raw": m.my_team_universities_raw,
                "my_team_universities_any": m.my_team_universities_any,
                "my_team_entry_year_min": m.my_team_entry_year_min,
                "my_team_entry_year_max": m.my_team_entry_year_max,
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

@router.patch("/meetings/{meeting_id}/preferred-universities")
def update_preferred_universities(
    meeting_id: int,
    preferred_universities_any: bool = True,
    preferred_universities_raw: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.host_user_id != user.id:
        raise HTTPException(status_code=403, detail="호스트만 선호학교를 수정할 수 있습니다.")

    meeting.preferred_universities_any = preferred_universities_any
    meeting.preferred_universities_raw = preferred_universities_raw if not preferred_universities_any else None
    db.commit()

    return {
        "meeting_id": meeting.id,
        "preferred_universities_any": meeting.preferred_universities_any,
        "preferred_universities_raw": meeting.preferred_universities_raw,
    }


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
        "title": meeting.title,
        "status": meeting.status.value,
        "host_user_id": meeting.host_user_id,
        "is_member": is_member,
        "my_confirmed": my_confirmed,
        "chat_room_id": chat_room.id if chat_room else None,
        "preferred_universities_raw": meeting.preferred_universities_raw,
        "preferred_universities_any": meeting.preferred_universities_any,
        "entry_year_min": meeting.entry_year_min,
        "entry_year_max": meeting.entry_year_max,
        "my_team_universities_raw": meeting.my_team_universities_raw,
        "my_team_universities_any": meeting.my_team_universities_any,
        "my_team_entry_year_min": meeting.my_team_entry_year_min,
        "my_team_entry_year_max": meeting.my_team_entry_year_max,
        "filled": {
            "male": filled_male,
            "female": filled_female,
            "total": filled_male + filled_female,
            "capacity": len(slots),
        },
        "slots": slot_out,
    }


@router.patch("/meetings/{meeting_id}/entry-year-range")
def update_entry_year_range(
    meeting_id: int,
    entry_year_min: int | None = None,
    entry_year_max: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.host_user_id != user.id:
        raise HTTPException(status_code=403, detail="호스트만 학번 범위를 수정할 수 있습니다.")

    if entry_year_min is not None and not (0 <= entry_year_min <= 99):
        raise HTTPException(400, "학번은 0~99 사이여야 합니다.")
    if entry_year_max is not None and not (0 <= entry_year_max <= 99):
        raise HTTPException(400, "학번은 0~99 사이여야 합니다.")
    if entry_year_min is not None and entry_year_max is not None and entry_year_min > entry_year_max:
        raise HTTPException(400, "최소 학번이 최대 학번보다 클 수 없습니다.")

    meeting.entry_year_min = entry_year_min
    meeting.entry_year_max = entry_year_max
    db.commit()

    return {
        "meeting_id": meeting.id,
        "entry_year_min": meeting.entry_year_min,
        "entry_year_max": meeting.entry_year_max,
    }


# -------------------------
# Transfer Host
# -------------------------
@router.post("/meetings/{meeting_id}/transfer-host")
def transfer_host(
    meeting_id: int,
    new_host_user_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    호스트 재배정.
    - WAITING_CONFIRM, CONFIRMED 상태에서만 가능
    - 현재 호스트만 호출 가능
    - 새 호스트는 해당 미팅 멤버여야 함
    - CONFIRMED(채팅방) 상태에서는 시스템 메시지 전송
    """
    meeting = db.execute(
        select(Meeting).where(Meeting.id == meeting_id).with_for_update()
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "미팅을 찾을 수 없습니다.")

    if meeting.host_user_id != user.id:
        raise HTTPException(403, "호스트만 호스트를 재배정할 수 있습니다.")

    if meeting.status not in (MeetingStatus.WAITING_CONFIRM, MeetingStatus.CONFIRMED):
        raise HTTPException(400, "WAITING_CONFIRM 또는 CONFIRMED 상태에서만 호스트를 재배정할 수 있습니다.")

    if new_host_user_id == user.id:
        raise HTTPException(400, "이미 호스트입니다.")

    # 새 호스트가 미팅 멤버인지 확인
    new_host_slot = db.execute(
        select(MeetingSlot).where(
            MeetingSlot.meeting_id == meeting_id,
            MeetingSlot.user_id == new_host_user_id,
        )
    ).scalar_one_or_none()
    if not new_host_slot:
        raise HTTPException(400, "새 호스트는 미팅 멤버여야 합니다.")

    new_host = db.get(User, new_host_user_id)
    if not new_host:
        raise HTTPException(404, "유저를 찾을 수 없습니다.")

    meeting.host_user_id = new_host_user_id

    # CONFIRMED 상태(채팅방 있음)에서만 시스템 메시지
    if meeting.status == MeetingStatus.CONFIRMED:
        chat_room = db.execute(
            select(ChatRoom).where(ChatRoom.meeting_id == meeting_id)
        ).scalar_one_or_none()
        if chat_room:
            from app.models.chat_message import ChatMessage
            from datetime import datetime, timezone
            prev_nick = user.nickname or f"유저#{user.id}"
            new_nick = new_host.nickname or f"유저#{new_host_user_id}"
            db.add(ChatMessage(
                room_id=chat_room.id,
                sender_user_id=0,
                content=f"[SYSTEM] {prev_nick}님이 {new_nick}님에게 호스트를 넘겼습니다.",
                created_at=datetime.now(timezone.utc),
            ))

    db.commit()
    return {
        "meeting_id": meeting_id,
        "host_user_id": new_host_user_id,
        "nickname": new_host.nickname,
    }