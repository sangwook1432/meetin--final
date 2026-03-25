"""
scheduler.py — 미팅 완료 감지 배치
CONFIRMED 미팅 중 일정(date+time)이 현재 시각보다 과거인 경우:
  1. meeting.status → COMPLETED
  2. chat_room.is_closed → True
  3. 멤버 전원에게 MEETING_COMPLETED 알림 생성
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))

logger = logging.getLogger("meetin.scheduler")

_task: asyncio.Task | None = None


def _check_completed_meetings() -> None:
    """동기 함수 — asyncio loop 에서 executor 없이 직접 호출 (I/O bound 이므로 짧은 배치)"""
    from app.db.session import SessionLocal
    from app.models.meeting import Meeting, MeetingStatus
    from app.models.meeting_schedule import MeetingSchedule
    from app.models.meeting_slot import MeetingSlot
    from app.models.chat_room import ChatRoom
    from app.models.notification import Notification, NotifType
    from sqlalchemy import select

    now = datetime.now(KST)

    with SessionLocal() as db:
        # CONFIRMED 미팅 중 confirmed 일정이 있는 것을 with_for_update로 잠금
        rows = db.execute(
            select(Meeting, MeetingSchedule)
            .join(MeetingSchedule, MeetingSchedule.meeting_id == Meeting.id)
            .where(
                Meeting.status == MeetingStatus.CONFIRMED,
                MeetingSchedule.confirmed == True,
                MeetingSchedule.date.isnot(None),
                MeetingSchedule.time.isnot(None),
            )
            .with_for_update(skip_locked=True)
        ).all()

        completed_ids: list[int] = []
        for meeting, schedule in rows:
            try:
                scheduled_dt = datetime.strptime(
                    f"{schedule.date} {schedule.time}", "%Y-%m-%d %H:%M"
                ).replace(tzinfo=KST)
            except ValueError:
                continue

            if scheduled_dt < now:
                completed_ids.append(meeting.id)
                meeting.status = MeetingStatus.COMPLETED

        if not completed_ids:
            db.commit()
            return

        # chat_room 닫기
        chat_rooms = db.execute(
            select(ChatRoom).where(ChatRoom.meeting_id.in_(completed_ids))
        ).scalars().all()
        for room in chat_rooms:
            room.is_closed = True

        # 멤버 조회 (user_id is not None)
        slots = db.execute(
            select(MeetingSlot).where(
                MeetingSlot.meeting_id.in_(completed_ids),
                MeetingSlot.user_id.isnot(None),
            )
        ).scalars().all()

        notifs: list[Notification] = []
        for slot in slots:
            notifs.append(Notification(
                user_id=slot.user_id,
                notif_type=NotifType.MEETING_COMPLETED,
                message="미팅은 잘 진행되었나요?",
                meeting_id=slot.meeting_id,
            ))

        db.add_all(notifs)
        db.commit()

        logger.info("[SCHEDULER] completed meetings: %s", completed_ids)


def _cleanup_old_meetings() -> None:
    """COMPLETED 상태에서 확정 일정으로부터 7일이 경과한 미팅을 자동 삭제"""
    from app.db.session import SessionLocal
    from app.models.meeting import Meeting, MeetingStatus
    from app.models.meeting_schedule import MeetingSchedule
    from sqlalchemy import select

    now = datetime.now(KST)
    cutoff = now - timedelta(days=7)

    with SessionLocal() as db:
        rows = db.execute(
            select(Meeting, MeetingSchedule)
            .join(MeetingSchedule, MeetingSchedule.meeting_id == Meeting.id)
            .where(
                Meeting.status == MeetingStatus.COMPLETED,
                MeetingSchedule.confirmed == True,
                MeetingSchedule.date.isnot(None),
                MeetingSchedule.time.isnot(None),
            )
            .with_for_update(skip_locked=True)
        ).all()

        deleted_ids: list[int] = []
        for meeting, schedule in rows:
            try:
                scheduled_dt = datetime.strptime(
                    f"{schedule.date} {schedule.time}", "%Y-%m-%d %H:%M"
                ).replace(tzinfo=KST)
            except ValueError:
                continue

            if scheduled_dt < cutoff:
                deleted_ids.append(meeting.id)
                db.delete(meeting)

        if deleted_ids:
            db.commit()
            logger.info("[SCHEDULER] auto-deleted old completed meetings: %s", deleted_ids)
        else:
            db.commit()


async def _run_loop() -> None:
    while True:
        from app.core.redis import get_redis
        redis = get_redis()

        if redis:
            # 다중 워커 환경: Redis 분산 락으로 1개 워커만 실행
            # timeout=120 → 락 보유 최대 2분, 그 안에 작업 완료 예상
            lock = redis.lock("scheduler:meeting_batch", timeout=120)
            acquired = await lock.acquire(blocking=False)
            if acquired:
                try:
                    await asyncio.get_event_loop().run_in_executor(None, _check_completed_meetings)
                    await asyncio.get_event_loop().run_in_executor(None, _cleanup_old_meetings)
                except Exception as exc:
                    logger.exception("[SCHEDULER] error: %s", exc)
                finally:
                    try:
                        await lock.release()
                    except Exception:
                        pass
            else:
                logger.debug("[SCHEDULER] lock not acquired — another worker is running the batch")
        else:
            # 단일 워커 환경 (Redis 없는 개발 환경): 그대로 실행
            try:
                await asyncio.get_event_loop().run_in_executor(None, _check_completed_meetings)
            except Exception as exc:
                logger.exception("[SCHEDULER] error in _check_completed_meetings: %s", exc)
            try:
                await asyncio.get_event_loop().run_in_executor(None, _cleanup_old_meetings)
            except Exception as exc:
                logger.exception("[SCHEDULER] error in _cleanup_old_meetings: %s", exc)

        await asyncio.sleep(600)  # 10분


def start_scheduler() -> None:
    global _task
    _task = asyncio.create_task(_run_loop())
    logger.info("[SCHEDULER] meeting completion job started (interval=10min)")


def stop_scheduler() -> None:
    global _task
    if _task:
        _task.cancel()
        _task = None


@asynccontextmanager
async def lifespan(app):
    """FastAPI lifespan context manager"""
    start_scheduler()
    yield
    stop_scheduler()
