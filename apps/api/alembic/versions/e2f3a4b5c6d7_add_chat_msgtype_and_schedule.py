from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 원시 SQL 구문으로 ENUM 타입 안전하게 생성 (이미 있으면 무시함)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE chat_msg_type_enum AS ENUM ('NORMAL', 'SYSTEM', 'SCHEDULE_PROPOSE', 'CANCEL_REQUEST');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE schedule_status_enum AS ENUM ('PROPOSED', 'CONFIRMED', 'CANCELLED');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    # 2. chat_messages: msg_type 컬럼 추가 
    # (create_type=False 를 넣어서 SQLAlchemy가 또 만들려고 하는 걸 막음!)
    op.add_column(
        'chat_messages',
        sa.Column(
            'msg_type',
            postgresql.ENUM('NORMAL', 'SYSTEM', 'SCHEDULE_PROPOSE', 'CANCEL_REQUEST', name='chat_msg_type_enum', create_type=False),
            nullable=False,
            server_default='NORMAL',
        )
    )

    # 3. meeting_schedules: 미팅 일정 확정 테이블
    op.create_table(
        'meeting_schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('proposed_by', sa.Integer(), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('location', sa.String(200), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column(
            'status',
            postgresql.ENUM('PROPOSED', 'CONFIRMED', 'CANCELLED', name='schedule_status_enum', create_type=False),
            nullable=False,
            server_default='PROPOSED',
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['proposed_by'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_meeting_schedules_meeting_id', 'meeting_schedules', ['meeting_id'])


def downgrade() -> None:
    op.drop_index('ix_meeting_schedules_meeting_id', 'meeting_schedules')
    op.drop_table('meeting_schedules')
    op.drop_column('chat_messages', 'msg_type')
    op.execute("DROP TYPE IF EXISTS chat_msg_type_enum")
    op.execute("DROP TYPE IF EXISTS schedule_status_enum")