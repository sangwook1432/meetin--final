"""add username to users, make email nullable

Revision ID: n1o2p3q4r5s6
Revises: m9n0o1p2q3r4
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa

revision = 'n1o2p3q4r5s6'
down_revision = 'm9n0o1p2q3r4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('username', sa.String(50), nullable=True))
    op.create_unique_constraint('uq_users_username', 'users', ['username'])
    op.create_index('ix_users_username', 'users', ['username'], unique=True)
    op.alter_column('users', 'email', nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'email', nullable=False)
    op.drop_index('ix_users_username', table_name='users')
    op.drop_constraint('uq_users_username', 'users', type_='unique')
    op.drop_column('users', 'username')
