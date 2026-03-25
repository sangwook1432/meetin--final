"""add send_at to notifications

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-03-17

변경사항:
  1. notifications.send_at 컬럼 추가 (nullable)
     - NULL = 즉시 노출, 값 있음 = 해당 시각 이후 노출
     - 애프터 신청 알림을 다음날 자정(KST)에 노출하기 위해 사용
"""
from alembic import op
import sqlalchemy as sa

revision = "f7a8b9c0d1e2"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notifications",
        sa.Column("send_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("notifications", "send_at")
