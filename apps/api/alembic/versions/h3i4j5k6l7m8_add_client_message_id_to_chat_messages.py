"""add client_message_id to chat_messages

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-03-18

chat_messages 테이블에 client_message_id 컬럼 추가.
클라이언트가 UUID를 생성해 전송하면, 서버가 중복 여부를 확인해
동일 메시지가 두 번 저장되지 않도록 방지 (idempotency).
"""
from alembic import op
import sqlalchemy as sa

revision = "h3i4j5k6l7m8"
down_revision = "g2h3i4j5k6l7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column("client_message_id", sa.String(64), nullable=True),
    )
    op.create_index(
        "ix_chat_messages_sender_client_id",
        "chat_messages",
        ["sender_user_id", "client_message_id"],
        unique=True,
        postgresql_where=sa.text("client_message_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_sender_client_id", table_name="chat_messages")
    op.drop_column("chat_messages", "client_message_id")
