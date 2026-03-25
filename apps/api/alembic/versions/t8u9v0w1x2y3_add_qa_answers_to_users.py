"""add qa_answers to users

Revision ID: t8u9v0w1x2y3
Revises: s7t8u9v0w1x2
Create Date: 2026-03-25

"""
from alembic import op
import sqlalchemy as sa

revision = "t8u9v0w1x2y3"
down_revision = "s7t8u9v0w1x2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("qa_answers", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("users", "qa_answers")
