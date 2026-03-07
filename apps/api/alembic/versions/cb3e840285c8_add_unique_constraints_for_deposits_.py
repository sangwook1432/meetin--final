"""add unique constraints for deposits confirmations chat_rooms

Revision ID: cb3e840285c8
Revises: 7a41ae562185
Create Date: 2026-03-02 21:17:00.674208

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cb3e840285c8'
down_revision = '7a41ae562185'
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint("uq_deposits_meeting_user", "deposits", ["meeting_id", "user_id"])
    op.create_unique_constraint("uq_confirmations_meeting_user", "confirmations", ["meeting_id", "user_id"])
    op.create_unique_constraint("uq_chat_rooms_meeting", "chat_rooms", ["meeting_id"])

def downgrade():
    op.drop_constraint("uq_chat_rooms_meeting", "chat_rooms", type_="unique")
    op.drop_constraint("uq_confirmations_meeting_user", "confirmations", type_="unique")
    op.drop_constraint("uq_deposits_meeting_user", "deposits", type_="unique")