"""rename toss columns to pg in wallet_transactions

Revision ID: w1x2y3z4a5b6
Revises: v0w1x2y3z4a5
Create Date: 2026-03-31

"""
from alembic import op

revision = "w1x2y3z4a5b6"
down_revision = "v0w1x2y3z4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("wallet_transactions", "toss_order_id",   new_column_name="pg_order_id")
    op.alter_column("wallet_transactions", "toss_payment_key", new_column_name="pg_payment_uid")


def downgrade() -> None:
    op.alter_column("wallet_transactions", "pg_order_id",    new_column_name="toss_order_id")
    op.alter_column("wallet_transactions", "pg_payment_uid", new_column_name="toss_payment_key")
