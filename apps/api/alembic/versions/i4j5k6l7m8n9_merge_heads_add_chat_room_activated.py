"""merge heads and add CHAT_ROOM_ACTIVATED to notif_type_enum

Revision ID: i4j5k6l7m8n9
Revises: a8b9c0d1e2f3, h3i4j5k6l7m8
Create Date: 2026-03-19

변경 내용:
  1. 분기된 두 head (a8b9c0d1e2f3, h3i4j5k6l7m8) 병합
     - a8b9c0d1e2f3: add title to meetings
     - h3i4j5k6l7m8: add client_message_id to chat_messages
  2. notif_type_enum 에 CHAT_ROOM_ACTIVATED 값 추가
     - meetings.py confirm_meeting 에서 전원 확정 시 이 타입으로 알림을 생성하는데
       DB enum 에 값이 없어 INSERT 에러 발생하던 문제 수정
"""
from alembic import op

revision = "i4j5k6l7m8n9"
down_revision = ("a8b9c0d1e2f3", "h3i4j5k6l7m8")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE notif_type_enum ADD VALUE IF NOT EXISTS 'CHAT_ROOM_ACTIVATED'")


def downgrade() -> None:
    # PostgreSQL 은 enum 값 삭제를 지원하지 않음
    pass
