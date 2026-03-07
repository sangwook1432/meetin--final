"""add preferred universities to meetings

Revision ID: cf195490b285
Revises: 8a04a2947eee
Create Date: 2026-03-05 13:21:29.524181

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cf195490b285'
down_revision = '8a04a2947eee'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meetings", sa.Column("preferred_universities_raw", sa.Text(), nullable=True))
    op.add_column("meetings", sa.Column("preferred_universities_any", sa.Boolean(), nullable=False, server_default=sa.true()))
    # server_default 제거(옵션): 기존 rows 채우고 기본값 남기기 싫으면 아래 실행 후 제거
    op.alter_column("meetings", "preferred_universities_any", server_default=None)


def downgrade() -> None:
    op.drop_column("meetings", "preferred_universities_any")
    op.drop_column("meetings", "preferred_universities_raw")