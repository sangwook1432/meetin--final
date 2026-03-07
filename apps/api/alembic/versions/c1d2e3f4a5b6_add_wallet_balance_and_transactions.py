"""add wallet balance and transactions

Revision ID: c1d2e3f4a5b6
Revises: 00c20ebba75e
Create Date: 2026-03-07 00:00:00.000000

변경 사항:
  1. users.balance 컬럼 추가 (잔액, 기본값 0)
  2. wallet_transactions 테이블 신규 생성
     - 모든 잔액 변동(충전/차감/환불/출금) 기록
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c1d2e3f4a5b6'
down_revision = '00c20ebba75e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. users 테이블에 balance 컬럼 추가 ───────────────────────
    op.add_column(
        'users',
        sa.Column('balance', sa.Integer(), nullable=False, server_default='0'),
    )

    # ── 2. wallet_transactions 테이블 생성 ────────────────────────
    op.create_table(
        'wallet_transactions',
        sa.Column('id',              sa.Integer(),    primary_key=True),
        sa.Column('user_id',         sa.Integer(),    sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('amount',          sa.Integer(),    nullable=False),           # 양수=증가, 음수=감소
        sa.Column('balance_after',   sa.Integer(),    nullable=False),           # 변동 후 잔액 스냅샷
        sa.Column(
            'tx_type',
            sa.Enum(
                'CHARGE',
                'DEPOSIT_HOLD',
                'DEPOSIT_REFUND',
                'WITHDRAW',
                'WITHDRAW_DONE',
                'ADMIN_ADJUST',
                name='wallet_tx_type_enum',
            ),
            nullable=False,
            index=True,
        ),
        sa.Column('meeting_id',       sa.Integer(),    sa.ForeignKey('meetings.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('toss_order_id',    sa.String(64),   nullable=True, index=True),
        sa.Column('toss_payment_key', sa.String(200),  nullable=True),
        sa.Column('note',             sa.Text(),       nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table('wallet_transactions')
    # Enum 타입 삭제 (PostgreSQL 전용)
    op.execute("DROP TYPE IF EXISTS wallet_tx_type_enum")
    op.drop_column('users', 'balance')
