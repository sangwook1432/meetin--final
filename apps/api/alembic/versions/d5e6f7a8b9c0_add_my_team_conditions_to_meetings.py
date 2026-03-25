"""add my team conditions to meetings

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-03-16

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = 'd5e6f7a8b9c0'
down_revision = 'c4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('meetings', sa.Column('my_team_universities_raw', sa.Text(), nullable=True))
    op.add_column('meetings', sa.Column('my_team_universities_any', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('meetings', sa.Column('my_team_entry_year_min', sa.Integer(), nullable=True))
    op.add_column('meetings', sa.Column('my_team_entry_year_max', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('meetings', 'my_team_entry_year_max')
    op.drop_column('meetings', 'my_team_entry_year_min')
    op.drop_column('meetings', 'my_team_universities_any')
    op.drop_column('meetings', 'my_team_universities_raw')
