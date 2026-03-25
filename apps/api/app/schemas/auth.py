import re
from pydantic import BaseModel, Field, field_validator


class PhoneSendRequest(BaseModel):
    phone: str


class PhoneVerifyRequest(BaseModel):
    phone: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    # KG이니시스 계약 전 mock용 — 인증 성공 시 토큰에 함께 저장
    mock_name: str | None = None
    mock_birth_date: str | None = None   # YYYYMMDD
    mock_gender: str | None = None       # "M" | "F"


class PhoneTokenInfoResponse(BaseModel):
    phone: str | None = None
    name: str | None = None
    birth_date: str | None = None
    gender: str | None = None
    age: int | None = None


class PhoneVerifyResponse(BaseModel):
    phone_token: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=72)
    phone_token: str  # POST /auth/phone/verify 후 발급된 토큰

    @field_validator("username")
    @classmethod
    def username_format(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_.\-]+$', v):
            raise ValueError("아이디는 영문, 숫자, _, -, . 만 사용 가능합니다.")
        return v.lower()

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]", v):
            raise ValueError("비밀번호에 특수문자를 1자 이상 포함해야 합니다.")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
