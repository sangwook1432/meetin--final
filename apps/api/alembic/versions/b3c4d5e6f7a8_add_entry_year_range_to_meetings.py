"""add entry_year_range to meetings

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-03-15

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = 'b3c4d5e6f7a8'
down_revision = 'a2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('meetings', sa.Column('entry_year_min', sa.Integer(), nullable=True))
    op.add_column('meetings', sa.Column('entry_year_max', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('meetings', 'entry_year_max')
    op.drop_column('meetings', 'entry_year_min')
