"""drop bank account columns from users

Revision ID: y3z4a5b6c7d8
Revises: x2y3z4a5b6c7
Create Date: 2026-04-20

포트원 v1 cancel API로 원결제 수단에 자동 환불하므로
별도 계좌 등록 불필요 → bank_name, account_number, account_holder 제거.
"""
from alembic import op
import sqlalchemy as sa

revision = "y3z4a5b6c7d8"
down_revision = "x2y3z4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("users", "bank_name")
    op.drop_column("users", "account_number")
    op.drop_column("users", "account_holder")


def downgrade() -> None:
    op.add_column("users", sa.Column("bank_name", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("account_number", sa.String(30), nullable=True))
    op.add_column("users", sa.Column("account_holder", sa.String(30), nullable=True))
