"""add_friends_wallet_schedule_invitation

Revision ID: g1h2i3j4k5l6
Revises: b2c3d4e5f6a7
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = 'g1h2i3j4k5l6'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    # 1. users.balance 추가
    op.add_column('users', sa.Column('balance', sa.Integer(), nullable=False, server_default='0'))

    # 2. friendships 테이블
    op.create_table(
        'friendships',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('requester_id', sa.Integer(), nullable=False),
        sa.Column('addressee_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'ACCEPTED', 'BLOCKED', name='friend_status_enum'), nullable=False, server_default='PENDING'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('requester_id', 'addressee_id', name='uq_friendship'),
    )
    op.create_index('ix_friendship_requester', 'friendships', ['requester_id'])
    op.create_index('ix_friendship_addressee', 'friendships', ['addressee_id'])

    # 3. wallet_transactions 테이블
    op.create_table(
        'wallet_transactions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('tx_type', sa.Enum('CHARGE', 'DEPOSIT_DEDUCT', 'DEPOSIT_REFUND', 'DEPOSIT_FORFEIT', 'ADMIN_ADJUST', name='tx_type_enum'), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('balance_after', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('ref_meeting_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_wallet_transactions_user_id', 'wallet_transactions', ['user_id'])

    # 4. meeting_schedules 테이블
    op.create_table(
        'meeting_schedules',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('meeting_id', sa.Integer(), nullable=False, unique=True),
        sa.Column('date', sa.String(20), nullable=True),
        sa.Column('time', sa.String(10), nullable=True),
        sa.Column('place', sa.String(200), nullable=True),
        sa.Column('confirmed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_meeting_schedules_meeting_id', 'meeting_schedules', ['meeting_id'])

    # 5. meeting_invitations 테이블
    op.create_table(
        'meeting_invitations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('inviter_id', sa.Integer(), nullable=False),
        sa.Column('invitee_id', sa.Integer(), nullable=False),
        sa.Column('invite_type', sa.Enum('FRIEND', 'REPLACE', name='invite_type_enum'), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', name='invite_status_enum'), nullable=False, server_default='PENDING'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('meeting_id', 'invitee_id', 'invite_type', name='uq_meeting_invite'),
    )
    op.create_index('ix_meeting_invitations_meeting_id', 'meeting_invitations', ['meeting_id'])
    op.create_index('ix_meeting_invitations_invitee_id', 'meeting_invitations', ['invitee_id'])


def downgrade():
    op.drop_table('meeting_invitations')
    op.drop_table('meeting_schedules')
    op.drop_table('wallet_transactions')
    op.drop_table('friendships')
    op.drop_column('users', 'balance')
    op.execute("DROP TYPE IF EXISTS friend_status_enum")
    op.execute("DROP TYPE IF EXISTS tx_type_enum")
    op.execute("DROP TYPE IF EXISTS invite_type_enum")
    op.execute("DROP TYPE IF EXISTS invite_status_enum")
