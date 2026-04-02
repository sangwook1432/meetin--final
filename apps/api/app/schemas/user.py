from pydantic import BaseModel, Field
from app.models.user import Gender, VerificationStatus, LookalikeType


class UserPublic(BaseModel):
    id: int
    username: str | None = None
    phone_last4: str
    phone_e164: str | None = None
    verification_status: VerificationStatus
    is_admin: bool

    phone: str | None = None          # 복호화된 전화번호 (표시용, e.g. 01012345678)
    email: str | None = None
    real_name: str | None = None
    nickname: str | None = None
    gender: Gender | None = None
    university: str | None = None
    major: str | None = None
    entry_year: int | None = None
    age: int | None = None
    preferred_area: str | None = None
    bio_short: str | None = None
    lookalike_type: LookalikeType | None = None
    lookalike_value: str | None = None
    photo_url_1: str | None = None
    photo_url_2: str | None = None
    cover_url: str | None = None
    qa_answers: str | None = None  # JSON string
    balance: int = 0
    matching_tickets: int = 0

    class Config:
        from_attributes = True


class ProfileUpdateRequest(BaseModel):
    email: str | None = Field(default=None, max_length=255)
    nickname: str | None = Field(default=None, max_length=50)
    gender: Gender | None = None
    university: str | None = Field(default=None, max_length=100)
    major: str | None = Field(default=None, max_length=100)
    entry_year: int | None = Field(default=None, ge=0, le=99)
    age: int | None = Field(default=None, ge=18, le=40)

    preferred_area: str | None = Field(default=None, max_length=100)
    bio_short: str | None = Field(default=None, max_length=40)

    lookalike_type: LookalikeType | None = None
    lookalike_value: str | None = Field(default=None, max_length=60)

    # photo_url_1/2 는 /me/photos/upload 전용 — 직접 수정 불가
