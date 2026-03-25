"""security: add FORFEIT tx type and expand phone_e164 for encryption

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-03-16

변경사항:
  1. wallet_tx_type_enum 에 FORFEIT 추가
     - 기존 ADMIN_ADJUST 로 기록되던 보증금 몰수를 명확한 타입으로 분리
  2. users.phone_e164 컬럼을 String(20) → Text 로 확장
     - Fernet 암호화 토큰(~100 bytes)을 저장하기 위해 길이 제한 제거
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'e6f7a8b9c0d1'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. FORFEIT enum 값 추가 (PostgreSQL은 트랜잭션 밖에서 ADD VALUE 필요)
    op.execute("ALTER TYPE wallet_tx_type_enum ADD VALUE IF NOT EXISTS 'FORFEIT'")

    # 2. phone_e164 컬럼 타입 확장 (암호화 토큰 저장)
    op.alter_column(
        'users',
        'phone_e164',
        existing_type=sa.String(20),
        type_=sa.Text(),
        existing_nullable=True,
        comment="E.164 전화번호 Fernet 암호화 저장 (카카오/SMS 알림 발송용)",
    )


def downgrade() -> None:
    # phone_e164 컬럼 타입 복원
    op.alter_column(
        'users',
        'phone_e164',
        existing_type=sa.Text(),
        type_=sa.String(20),
        existing_nullable=True,
        comment="E.164 형식 원문 전화번호 (카카오/SMS 알림 발송용). 암호화 권장.",
    )
    # PostgreSQL은 enum 값 삭제를 지원하지 않으므로 downgrade 시 FORFEIT은 유지됨
