"""add FAILED_REFUND to deposit_status_enum

Revision ID: b2c3d4e5f6a7
Revises: f1a2b3c4d5e6
Create Date: 2026-03-06 00:00:00.000000

변경 내용:
  - deposit_status_enum 에 'FAILED_REFUND' 값 추가
    (환불 배치에서 MAX_RETRY 초과 시 → 관리자 수동 처리 대상)

주의:
  - PostgreSQL ENUM 값 추가는 트랜잭션 내에서 실행 불가 (일부 버전)
  - op.execute() 로 DDL 직접 실행
"""
from __future__ import annotations

from alembic import op


revision = 'b2c3d4e5f6a7'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    # IF NOT EXISTS: PostgreSQL 9.6+ 지원
    try:
        op.execute("ALTER TYPE deposit_status_enum ADD VALUE IF NOT EXISTS 'FAILED_REFUND'")
    except Exception:
        pass


def downgrade():
    # PostgreSQL ENUM 값 제거는 공식 지원 없음 → noop
    pass
