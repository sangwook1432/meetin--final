"""add phone_encrypted to preregistrations

Revision ID: k7l8m9n0o1p2
Revises: j5k6l7m8n9o0
Create Date: 2026-03-23

"""
from alembic import op
import sqlalchemy as sa

revision = 'k7l8m9n0o1p2'
down_revision = 'j5k6l7m8n9o0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'preregistrations',
        sa.Column('phone_encrypted', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('preregistrations', 'phone_encrypted')
