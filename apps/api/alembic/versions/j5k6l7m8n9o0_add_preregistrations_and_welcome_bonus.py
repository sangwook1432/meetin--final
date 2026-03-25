"""add preregistrations and welcome bonus ticket type

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-03-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'j5k6l7m8n9o0'
down_revision = 'i4j5k6l7m8n9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # gender_enum이 없을 때만 생성 (이미 있으면 스킵)
    connection = op.get_bind()
    has_gender_enum = connection.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender_enum')")
    ).scalar()
    if not has_gender_enum:
        op.execute("CREATE TYPE gender_enum AS ENUM ('MALE', 'FEMALE')")

    # preregistrations 테이블 생성
    op.create_table(
        'preregistrations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('phone_hash', sa.String(64), nullable=False, unique=True, index=True),
        sa.Column('gender', postgresql.ENUM('MALE', 'FEMALE', name='gender_enum', create_type=False), nullable=False),
        sa.Column('granted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
    )

    # ticket_tx_type_enum에 WELCOME_BONUS 추가
    op.execute("ALTER TYPE ticket_tx_type_enum ADD VALUE IF NOT EXISTS 'WELCOME_BONUS'")


def downgrade() -> None:
    op.drop_table('preregistrations')
    # PostgreSQL은 enum 값 제거를 지원하지 않으므로 downgrade 시 enum은 그대로 유지
