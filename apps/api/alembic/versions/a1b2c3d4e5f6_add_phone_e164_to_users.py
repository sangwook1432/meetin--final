"""add phone_e164 to users

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-03-06 01:00:00.000000

변경 내용:
  - users 테이블에 phone_e164 컬럼 추가 (VARCHAR(20), nullable)
  - 카카오 알림톡/SMS 발송을 위해 E.164 형식 원문 번호 저장

보안 참고:
  - 운영 환경에서는 컬럼 수준 암호화(pgcrypto) 또는
    애플리케이션 레이어 AES 암호화 적용 권장.
  - MVP 단계에서는 평문 저장 후 추후 마이그레이션.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = 'a1b2c3d4e5f6'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "phone_e164",
            sa.String(20),
            nullable=True,
            comment="E.164 형식 전화번호 (알림 발송용)",
        ),
    )


def downgrade():
    op.drop_column("users", "phone_e164")
