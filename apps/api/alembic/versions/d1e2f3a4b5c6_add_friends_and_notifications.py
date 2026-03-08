"""Add friends and notifications tables

Revision ID: d1e2f3a4b5c6
Revises: c1d2e3f4a5b6
Create Date: 2025-03-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── friends ────────────────────────────────────────────────
    op.create_table(
        'friends',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('requester_id', sa.Integer(), nullable=False),
        sa.Column('addressee_id', sa.Integer(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('PENDING', 'ACCEPTED', 'REJECTED', name='friend_status_enum'),
            nullable=False,
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['addressee_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('requester_id', 'addressee_id', name='uq_friends_pair'),
    )
    op.create_index('ix_friends_requester_id', 'friends', ['requester_id'])
    op.create_index('ix_friends_addressee_id', 'friends', ['addressee_id'])
    op.create_index('ix_friends_status', 'friends', ['status'])

    # ── notifications ──────────────────────────────────────────
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column(
            'noti_type',
            sa.Enum(
                'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'MEETING_INVITE',
                'MEETING_CONFIRMED', 'SLOT_VACANCY', 'DEPOSIT_REFUNDED', 'SYSTEM',
                name='noti_type_enum',
            ),
            nullable=False,
        ),
        sa.Column('title', sa.String(100), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('related_user_id', sa.Integer(), nullable=True),
        sa.Column('related_meeting_id', sa.Integer(), nullable=True),
        sa.Column('related_friend_id', sa.Integer(), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['related_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['related_meeting_id'], ['meetings.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['related_friend_id'], ['friends.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_noti_type', 'notifications', ['noti_type'])
    op.create_index('ix_notifications_is_read', 'notifications', ['is_read'])


def downgrade() -> None:
    op.drop_table('notifications')
    op.drop_index('ix_friends_status', 'friends')
    op.drop_index('ix_friends_addressee_id', 'friends')
    op.drop_index('ix_friends_requester_id', 'friends')
    op.drop_table('friends')
    op.execute("DROP TYPE IF EXISTS friend_status_enum")
    op.execute("DROP TYPE IF EXISTS noti_type_enum")
