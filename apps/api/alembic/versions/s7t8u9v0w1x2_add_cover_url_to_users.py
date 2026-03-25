"""add cover_url to users

Revision ID: s7t8u9v0w1x2
Revises: r6s7t8u9v0w1
Create Date: 2026-03-25

"""
from alembic import op
import sqlalchemy as sa

revision = "s7t8u9v0w1x2"
down_revision = "r6s7t8u9v0w1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("cover_url", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("users", "cover_url")
