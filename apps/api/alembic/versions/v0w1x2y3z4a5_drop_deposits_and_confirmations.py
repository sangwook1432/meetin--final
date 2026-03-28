"""drop deposits and confirmations tables

Revision ID: v0w1x2y3z4a5
Revises: u9v0w1x2y3z4
Create Date: 2026-03-28

"""
from alembic import op

revision = "v0w1x2y3z4a5"
down_revision = "u9v0w1x2y3z4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("deposits")
    op.drop_table("confirmations")


def downgrade() -> None:
    # 복구 불필요 — 보증금 제도 영구 제거
    pass
