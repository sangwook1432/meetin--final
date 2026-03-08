"""Add msg_type to chat_messages and meeting_schedule table

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2025-03-08 01:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # chat_messages: msg_type 컬럼 추가 (시스템 메시지 구분)
    op.add_column(
        'chat_messages',
        sa.Column(
            'msg_type',
            sa.Enum('NORMAL', 'SYSTEM', 'SCHEDULE_PROPOSE', 'CANCEL_REQUEST', name='chat_msg_type_enum'),
            nullable=False,
            server_default='NORMAL',
        )
    )

    # meeting_schedules: 미팅 일정 확정 테이블
    op.create_table(
        'meeting_schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('proposed_by', sa.Integer(), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('location', sa.String(200), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column(
            'status',
            sa.Enum('PROPOSED', 'CONFIRMED', 'CANCELLED', name='schedule_status_enum'),
            nullable=False,
            server_default='PROPOSED',
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['proposed_by'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_meeting_schedules_meeting_id', 'meeting_schedules', ['meeting_id'])


def downgrade() -> None:
    op.drop_index('ix_meeting_schedules_meeting_id', 'meeting_schedules')
    op.drop_table('meeting_schedules')
    op.drop_column('chat_messages', 'msg_type')
    op.execute("DROP TYPE IF EXISTS chat_msg_type_enum")
    op.execute("DROP TYPE IF EXISTS schedule_status_enum")
