import enum
from sqlalchemy import String, Integer, Boolean, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Gender(str, enum.Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"


class VerificationStatus(str, enum.Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


class LookalikeType(str, enum.Enum):
    CELEB = "CELEB"
    ANIMAL = "ANIMAL"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))

    # 전화번호: HMAC 해시(검색용) + 마지막 4자리(표시용) + E.164 원문(알림 발송용)
    phone_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    phone_last4: Mapped[str] = mapped_column(String(4))
    phone_e164: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        comment="E.164 형식 원문 전화번호 (카카오/SMS 알림 발송용). 암호화 권장."
    )
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status_enum"),
        default=VerificationStatus.PENDING,
        index=True,
    )

    nickname: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender, name="gender_enum"), nullable=True)
    university: Mapped[str | None] = mapped_column(String(100), nullable=True)
    major: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entry_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)

    preferred_area: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bio_short: Mapped[str | None] = mapped_column(String(40), nullable=True)

    lookalike_type: Mapped[LookalikeType | None] = mapped_column(
        Enum(LookalikeType, name="lookalike_type_enum"),
        nullable=True,
    )
    lookalike_value: Mapped[str | None] = mapped_column(String(60), nullable=True)

    photo_url_1: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url_2: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 잔액 (단위: 원) — Toss 충전으로만 증가, 보증금 차감/환급으로 변동
    balance: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
