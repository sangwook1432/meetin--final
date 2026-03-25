"""encrypt after_request sender_phone column

Revision ID: g2h3i4j5k6l7
Revises: f7a8b9c0d1e2
Create Date: 2026-03-18

after_requests.sender_phone: String(20) → Text
(Fernet 암호화된 전화번호 저장을 위해 컬럼 타입 변경)
"""
from alembic import op
import sqlalchemy as sa


revision = "g2h3i4j5k6l7"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "after_requests",
        "sender_phone",
        existing_type=sa.String(20),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "after_requests",
        "sender_phone",
        existing_type=sa.Text(),
        type_=sa.String(20),
        existing_nullable=False,
    )
