"""add chat_reports table

Revision ID: l8m9n0o1p2q3
Revises: k7l8m9n0o1p2
Create Date: 2026-03-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'l8m9n0o1p2q3'
down_revision = 'k7l8m9n0o1p2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE report_reason_enum AS ENUM "
        "('SEXUAL_CONTENT', 'HARASSMENT', 'SPAM', 'OTHER')"
    )
    op.execute(
        "CREATE TYPE report_status_enum AS ENUM "
        "('PENDING', 'CONFIRMED', 'REJECTED')"
    )

    op.create_table(
        'chat_reports',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('room_id',    sa.Integer(), nullable=True),
        sa.Column('meeting_id', sa.Integer(), nullable=True),
        sa.Column('reporter_user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reported_user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('evidence_message_id', sa.Integer(), nullable=True),
        sa.Column('evidence_content', sa.Text(), nullable=True),
        sa.Column('reason',
                  postgresql.ENUM('SEXUAL_CONTENT', 'HARASSMENT', 'SPAM', 'OTHER',
                                  name='report_reason_enum', create_type=False),
                  nullable=False),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('status',
                  postgresql.ENUM('PENDING', 'CONFIRMED', 'REJECTED',
                                  name='report_status_enum', create_type=False),
                  nullable=False, server_default='PENDING'),
        sa.Column('admin_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True),
                  nullable=False, server_default=sa.text('now()')),
        sa.Column('resolved_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )

    op.create_index('ix_chat_reports_status',           'chat_reports', ['status'])
    op.create_index('ix_chat_reports_reporter_user_id', 'chat_reports', ['reporter_user_id'])
    op.create_index('ix_chat_reports_reported_user_id', 'chat_reports', ['reported_user_id'])


def downgrade() -> None:
    op.drop_index('ix_chat_reports_reported_user_id', table_name='chat_reports')
    op.drop_index('ix_chat_reports_reporter_user_id', table_name='chat_reports')
    op.drop_index('ix_chat_reports_status',           table_name='chat_reports')
    op.drop_table('chat_reports')
    op.execute("DROP TYPE IF EXISTS report_reason_enum")
    op.execute("DROP TYPE IF EXISTS report_status_enum")
