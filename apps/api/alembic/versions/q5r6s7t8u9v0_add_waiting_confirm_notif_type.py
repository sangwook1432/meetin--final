"""add WAITING_CONFIRM to notif_type_enum

Revision ID: q5r6s7t8u9v0
Revises: p4q5r6s7t8u9
Create Date: 2026-03-25

"""
from alembic import op

revision = "q5r6s7t8u9v0"
down_revision = "p4q5r6s7t8u9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE notif_type_enum ADD VALUE IF NOT EXISTS 'WAITING_CONFIRM'")


def downgrade() -> None:
    # PostgreSQL은 enum 값 삭제를 지원하지 않으므로 downgrade 시 값 유지
    pass
