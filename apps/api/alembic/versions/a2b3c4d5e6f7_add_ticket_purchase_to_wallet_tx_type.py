"""add TICKET_PURCHASE to wallet_tx_type_enum

Revision ID: a2b3c4d5e6f7
Revises: 3083269580b0
Create Date: 2026-03-14

"""
from __future__ import annotations

from alembic import op

revision = 'a2b3c4d5e6f7'
down_revision = '3083269580b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE wallet_tx_type_enum ADD VALUE IF NOT EXISTS 'TICKET_PURCHASE'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values without recreating the type.
    pass
