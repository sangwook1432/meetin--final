"""add user penalties (warning_count, suspended_until, is_banned) + ACCOUNT_PENALTY notif type

Revision ID: m9n0o1p2q3r4
Revises: l8m9n0o1p2q3
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'm9n0o1p2q3r4'
down_revision = 'l8m9n0o1p2q3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users: 제재 필드 추가
    op.add_column('users', sa.Column('warning_count',   sa.Integer(),                    nullable=False, server_default='0'))
    op.add_column('users', sa.Column('suspended_until', sa.TIMESTAMP(timezone=True),     nullable=True))
    op.add_column('users', sa.Column('is_banned',       sa.Boolean(),                    nullable=False, server_default='false'))

    # notif_type_enum 에 ACCOUNT_PENALTY 추가
    op.execute("ALTER TYPE notif_type_enum ADD VALUE IF NOT EXISTS 'ACCOUNT_PENALTY'")


def downgrade() -> None:
    op.drop_column('users', 'is_banned')
    op.drop_column('users', 'suspended_until')
    op.drop_column('users', 'warning_count')
    # PostgreSQL enum 값은 삭제 불가 — downgrade 시 enum은 그대로 유지
