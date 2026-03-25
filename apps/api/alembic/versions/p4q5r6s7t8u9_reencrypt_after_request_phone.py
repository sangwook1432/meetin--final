"""re-encrypt after_requests.sender_phone with current key

Revision ID: p4q5r6s7t8u9
Revises: o2p3q4r5s6t7
Create Date: 2026-03-25

기존 after_requests.sender_phone 레코드를 정리합니다.
- 복호화 성공 (현재 키로 암호화된 값) -> 현재 키로 재암호화 (키 일관성 보장)
- 복호화 실패 + E.164 평문 (+82...) -> 현재 키로 암호화
- 복호화 실패 + 한국 번호 평문 (010...) -> E.164 변환 후 암호화
- 그 외 (구 키로 암호화되어 복호 불가) -> NULL 처리 (노출 방지)
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "p4q5r6s7t8u9"
down_revision = "o2p3q4r5s6t7"
branch_labels = None
depends_on = None


def _normalize_to_e164(phone: str) -> str | None:
    """전화번호를 E.164 형식(+821012345678)으로 정규화. 실패 시 None."""
    p = phone.strip().replace("-", "").replace(" ", "")
    if p.startswith("+82"):
        return p
    if p.startswith("010") or p.startswith("011") or p.startswith("016") or p.startswith("017") or p.startswith("019"):
        return "+82" + p[1:]
    return None


def upgrade() -> None:
    from app.core.crypto import decrypt_phone, encrypt_phone

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, sender_phone FROM after_requests")).fetchall()

    fixed = skipped = nulled = 0

    for row in rows:
        record_id = row[0]
        sender_phone = row[1]

        if not sender_phone:
            continue

        # 1) 현재 키로 복호화 시도
        decrypted = decrypt_phone(sender_phone)

        if decrypted:
            # 복호화 성공 -> 현재 키로 재암호화
            new_phone = encrypt_phone(decrypted)
            conn.execute(
                sa.text("UPDATE after_requests SET sender_phone = :p WHERE id = :id"),
                {"p": new_phone, "id": record_id},
            )
            fixed += 1
            continue

        # 2) 복호화 실패 -> 평문 전화번호인지 확인
        e164 = _normalize_to_e164(sender_phone)
        if e164:
            new_phone = encrypt_phone(e164)
            conn.execute(
                sa.text("UPDATE after_requests SET sender_phone = :p WHERE id = :id"),
                {"p": new_phone, "id": record_id},
            )
            fixed += 1
            continue

        # 3) 판별 불가 (구 키로 암호화된 값 등) -> NULL로 마스킹
        conn.execute(
            sa.text("UPDATE after_requests SET sender_phone = :p WHERE id = :id"),
            {"p": None, "id": record_id},
        )
        nulled += 1

    print(f"[migration] after_requests phone re-encrypt: fixed={fixed}, nulled={nulled}")


def downgrade() -> None:
    # 암호화된 값을 원복할 방법이 없으므로 downgrade 미지원
    pass
