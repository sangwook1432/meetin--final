"""add meeting completed flow

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-03-15

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = 'c4d5e6f7a8b9'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enum 값 추가
    op.execute("ALTER TYPE meeting_status_enum ADD VALUE IF NOT EXISTS 'COMPLETED'")
    op.execute("ALTER TYPE notif_type_enum ADD VALUE IF NOT EXISTS 'MEETING_COMPLETED'")
    op.execute("ALTER TYPE notif_type_enum ADD VALUE IF NOT EXISTS 'AFTER_REQUEST_RECEIVED'")

    # chat_rooms에 is_closed 컬럼 추가
    op.add_column('chat_rooms', sa.Column('is_closed', sa.Boolean(), nullable=False, server_default='false'))

    # meeting_feedbacks 테이블 생성
    op.create_table(
        'meeting_feedbacks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('is_satisfied', sa.Boolean(), nullable=False),
        sa.Column('complaint', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id', 'user_id', name='uq_feedback_meeting_user'),
    )
    op.create_index(op.f('ix_meeting_feedbacks_meeting_id'), 'meeting_feedbacks', ['meeting_id'])

    # after_requests 테이블 생성
    op.create_table(
        'after_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=False),
        sa.Column('receiver_id', sa.Integer(), nullable=False),
        sa.Column('message', sa.String(50), nullable=False),
        sa.Column('sender_phone', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id', 'sender_id', 'receiver_id', name='uq_after_request'),
    )
    op.create_index(op.f('ix_after_requests_meeting_id'), 'after_requests', ['meeting_id'])
    op.create_index(op.f('ix_after_requests_receiver_id'), 'after_requests', ['receiver_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_after_requests_receiver_id'), table_name='after_requests')
    op.drop_index(op.f('ix_after_requests_meeting_id'), table_name='after_requests')
    op.drop_table('after_requests')
    op.drop_index(op.f('ix_meeting_feedbacks_meeting_id'), table_name='meeting_feedbacks')
    op.drop_table('meeting_feedbacks')
    op.drop_column('chat_rooms', 'is_closed')
    # PostgreSQL은 enum 값 제거 미지원
