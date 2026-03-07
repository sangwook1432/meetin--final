"""merge multiple heads

Revision ID: 00c20ebba75e
Revises: a1b2c3d4e5f6, b2c3d4e5f6a7, e30f40bf0561
Create Date: 2026-03-06 20:32:14.585099

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '00c20ebba75e'
down_revision = ('a1b2c3d4e5f6', 'b2c3d4e5f6a7', 'e30f40bf0561')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass