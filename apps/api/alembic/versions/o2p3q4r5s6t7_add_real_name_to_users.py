"""add real_name to users

Revision ID: o2p3q4r5s6t7
Revises: n1o2p3q4r5s6
Create Date: 2026-03-25

"""
from alembic import op
import sqlalchemy as sa

revision = 'o2p3q4r5s6t7'
down_revision = 'n1o2p3q4r5s6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('real_name', sa.String(50), nullable=True,
                                     comment='KG이니시스 본인인증으로 확인된 실명'))


def downgrade() -> None:
    op.drop_column('users', 'real_name')
