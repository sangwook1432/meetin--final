"""add expired ticket type

Revision ID: z4a5b6c7d8e9
Revises: y3z4a5b6c7d8
Create Date: 2026-05-19

회원 탈퇴 시 매칭권 소멸 트랜잭션 기록용으로 EXPIRED 추가.
"""
from alembic import op

revision = "z4a5b6c7d8e9"
down_revision = "y3z4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE ticket_tx_type_enum ADD VALUE IF NOT EXISTS 'EXPIRED'")


def downgrade() -> None:
    # PostgreSQL enum 값 제거는 불가 — 무시
    pass
