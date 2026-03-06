"""add REFUND_PENDING to deposit_status_enum

Revision ID: f1a2b3c4d5e6
Revises: cb3e840285c8
Create Date: 2026-03-06 00:00:00.000000

변경 내용:
  - deposit_status_enum 에 'REFUND_PENDING' 값 추가
    (HELD → leave 시 환불 처리 중 상태)
  - PostgreSQL ENUM 타입은 ALTER TYPE ... ADD VALUE IF NOT EXISTS 로 추가

주의:
  - PostgreSQL 에서 ENUM 값 추가는 트랜잭션 내에서 실행 불가 (일부 버전)
  - 아래 코드는 op.execute() 로 DDL 직접 실행
"""
from __future__ import annotations

from alembic import op


revision = 'f1a2b3c4d5e6'
down_revision = 'cb3e840285c8'
branch_labels = None
depends_on = None


def upgrade():
    # IF NOT EXISTS: PostgreSQL 9.6+ 지원
    # SQLite 는 ENUM 타입이 없으므로 예외 무시
    try:
        op.execute("ALTER TYPE deposit_status_enum ADD VALUE IF NOT EXISTS 'REFUND_PENDING'")
    except Exception:
        pass


def downgrade():
    # PostgreSQL ENUM 값 제거는 공식 지원 없음 → noop
    # 필요 시 수동으로 새 타입을 만들고 컬럼을 교체하는 방식으로 처리
    pass
