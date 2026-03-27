"""add admin_grant ticket type

Revision ID: u9v0w1x2y3z4
Revises: t8u9v0w1x2y3
Create Date: 2026-03-26

"""
from alembic import op

revision = "u9v0w1x2y3z4"
down_revision = "t8u9v0w1x2y3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE ticket_tx_type_enum ADD VALUE IF NOT EXISTS 'ADMIN_GRANT'")


def downgrade() -> None:
    # PostgreSQL enum 값 제거는 불가 — 무시
    pass
