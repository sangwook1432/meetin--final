"""create core tables

Revision ID: 0000000000ab
Revises:
Create Date: 2026-03-16

새 서버에 배포할 때의 진입점.
이전에 삭제된 구 마이그레이션들(9b571b11 등)이 만들던 핵심 테이블을 재정의.
이 마이그레이션 이후에 3083269580b0(init_all_fresh)이 이어진다.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = '0000000000ab'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('phone_hash', sa.String(64), nullable=False),
        sa.Column('phone_last4', sa.String(4), nullable=False),
        sa.Column('phone_e164', sa.String(20), nullable=True),
        sa.Column('phone_verified', sa.Boolean(), nullable=False),
        sa.Column('is_admin', sa.Boolean(), nullable=False),
        sa.Column('verification_status', sa.Enum('PENDING', 'VERIFIED', 'REJECTED', name='verification_status_enum'), nullable=False),
        sa.Column('nickname', sa.String(50), nullable=True),
        sa.Column('gender', sa.Enum('MALE', 'FEMALE', name='gender_enum'), nullable=True),
        sa.Column('university', sa.String(100), nullable=True),
        sa.Column('major', sa.String(100), nullable=True),
        sa.Column('entry_year', sa.Integer(), nullable=True),
        sa.Column('age', sa.Integer(), nullable=True),
        sa.Column('preferred_area', sa.String(100), nullable=True),
        sa.Column('bio_short', sa.String(40), nullable=True),
        sa.Column('lookalike_type', sa.Enum('CELEB', 'ANIMAL', name='lookalike_type_enum'), nullable=True),
        sa.Column('lookalike_value', sa.String(60), nullable=True),
        sa.Column('photo_url_1', sa.Text(), nullable=True),
        sa.Column('photo_url_2', sa.Text(), nullable=True),
        sa.Column('balance', sa.Integer(), nullable=False),
        sa.Column('matching_tickets', sa.Integer(), nullable=False),
        sa.Column('bank_name', sa.String(50), nullable=True),
        sa.Column('account_number', sa.String(30), nullable=True),
        sa.Column('account_holder', sa.String(30), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('phone_hash'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_phone_hash'), 'users', ['phone_hash'], unique=True)
    op.create_index(op.f('ix_users_verification_status'), 'users', ['verification_status'])

    # ── meetings (entry_year_min/max, my_team_* 는 후속 마이그레이션에서 추가) ──
    op.create_table(
        'meetings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('host_user_id', sa.Integer(), nullable=False),
        sa.Column('meeting_type', sa.Enum('TWO_BY_TWO', 'THREE_BY_THREE', name='meeting_type_enum'), nullable=False),
        sa.Column('status', sa.Enum('RECRUITING', 'FULL', 'WAITING_CONFIRM', 'CONFIRMED', 'CANCELLED', name='meeting_status_enum'), nullable=False),
        sa.Column('preferred_universities_raw', sa.Text(), nullable=True),
        sa.Column('preferred_universities_any', sa.Boolean(), nullable=False, server_default='true'),
        sa.ForeignKeyConstraint(['host_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_meetings_status'), 'meetings', ['status'])

    # ── meeting_slots ─────────────────────────────────────────────
    op.create_table(
        'meeting_slots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('team', sa.Enum('MALE', 'FEMALE', name='meeting_team_enum'), nullable=False),
        sa.Column('slot_index', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('confirmed', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id', 'team', 'slot_index', name='uq_slot_position'),
    )
    op.create_index(op.f('ix_meeting_slots_meeting_id'), 'meeting_slots', ['meeting_id'])
    op.create_index(op.f('ix_meeting_slots_user_id'), 'meeting_slots', ['user_id'])

    # ── chat_rooms (is_closed 는 c4d5e6f7a8b9 에서 추가) ──────────
    op.create_table(
        'chat_rooms',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id', name='uq_chat_room_meeting'),
    )
    op.create_index(op.f('ix_chat_rooms_meeting_id'), 'chat_rooms', ['meeting_id'])

    # ── chat_messages ─────────────────────────────────────────────
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('room_id', sa.Integer(), nullable=False),
        sa.Column('sender_user_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['room_id'], ['chat_rooms.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_chat_messages_room_id_id', 'chat_messages', ['room_id', 'id'])

    # ── chat_read_receipts ────────────────────────────────────────
    op.create_table(
        'chat_read_receipts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('room_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('last_read_message_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['room_id'], ['chat_rooms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('room_id', 'user_id', name='uq_read_receipt'),
    )
    op.create_index(op.f('ix_chat_read_receipts_room_id'), 'chat_read_receipts', ['room_id'])
    op.create_index(op.f('ix_chat_read_receipts_user_id'), 'chat_read_receipts', ['user_id'])

    # ── confirmations ─────────────────────────────────────────────
    op.create_table(
        'confirmations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id', 'user_id', name='uq_confirmation_meeting_user'),
    )
    op.create_index(op.f('ix_confirmations_meeting_id'), 'confirmations', ['meeting_id'])
    op.create_index(op.f('ix_confirmations_user_id'), 'confirmations', ['user_id'])

    # ── deposits ──────────────────────────────────────────────────
    op.create_table(
        'deposits',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=True),
        sa.Column('status', sa.Enum(
            'REQUIRED', 'PENDING', 'HELD', 'REFUND_PENDING',
            'REFUNDED', 'FORFEITED', 'CANCELED', 'FAILED_REFUND',
            name='deposit_status_enum',
        ), nullable=True),
        sa.Column('toss_order_id', sa.String(64), nullable=False),
        sa.Column('toss_payment_key', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('toss_order_id'),
    )
    op.create_index(op.f('ix_deposits_meeting_id'), 'deposits', ['meeting_id'])
    op.create_index(op.f('ix_deposits_user_id'), 'deposits', ['user_id'])
    op.create_index(op.f('ix_deposits_status'), 'deposits', ['status'])
    op.create_index(op.f('ix_deposits_toss_order_id'), 'deposits', ['toss_order_id'], unique=True)

    # ── cancel_votes ──────────────────────────────────────────────
    op.create_table(
        'cancel_votes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('voted_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id', 'user_id', name='uq_cancel_vote'),
    )
    op.create_index(op.f('ix_cancel_votes_meeting_id'), 'cancel_votes', ['meeting_id'])

    # ── schedule_votes ────────────────────────────────────────────
    op.create_table(
        'schedule_votes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('voted_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id', 'user_id', name='uq_schedule_vote'),
    )
    op.create_index(op.f('ix_schedule_votes_meeting_id'), 'schedule_votes', ['meeting_id'])

    # ── verification_docs ─────────────────────────────────────────
    op.create_table(
        'verification_docs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('doc_type', sa.Enum('ENROLLMENT_CERT', 'STUDENT_ID', name='doc_type_enum'), nullable=True),
        sa.Column('file_url', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('SUBMITTED', 'REVIEWED', name='doc_status_enum'), nullable=True),
        sa.Column('note', sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_verification_docs_user_id'), 'verification_docs', ['user_id'])


def downgrade() -> None:
    op.drop_table('verification_docs')
    op.drop_table('schedule_votes')
    op.drop_table('cancel_votes')
    op.drop_table('deposits')
    op.drop_table('confirmations')
    op.drop_table('chat_read_receipts')
    op.drop_table('chat_messages')
    op.drop_table('chat_rooms')
    op.drop_table('meeting_slots')
    op.drop_table('meetings')
    op.drop_table('users')
