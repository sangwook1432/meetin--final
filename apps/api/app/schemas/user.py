from pydantic import BaseModel, Field
from app.models.user import Gender, VerificationStatus, LookalikeType


class UserPublic(BaseModel):
    id: int
    email: str
    phone_last4: str
    verification_status: VerificationStatus
    is_admin: bool

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

    class Config:
        from_attributes = True


class ProfileUpdateRequest(BaseModel):
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

    photo_url_1: str | None = None
    photo_url_2: str | None = None
