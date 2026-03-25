"""add title to meetings

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-03-17

변경사항:
  1. meetings.title 컬럼 추가 (nullable)
     - 미팅 생성 시 호스트가 설정하는 제목
     - NULL이면 기존 "미팅 #id" 형태로 표시
"""
from alembic import op
import sqlalchemy as sa

revision = "a8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("title", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("meetings", "title")
