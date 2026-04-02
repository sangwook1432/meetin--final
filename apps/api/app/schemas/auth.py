import re
from pydantic import BaseModel, Field, field_validator


class PhoneCertifyRequest(BaseModel):
    """포트원 본인인증 완료 후 imp_uid 전달 → phone_token 발급"""
    imp_uid: str


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
    email: str = Field(max_length=255)
    password: str = Field(min_length=8, max_length=72)
    phone_token: str  # POST /auth/phone/certify 후 발급된 토큰

    @field_validator("username")
    @classmethod
    def username_format(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_.\-]+$', v):
            raise ValueError("아이디는 영문, 숫자, _, -, . 만 사용 가능합니다.")
        return v.lower()

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', v):
            raise ValueError("올바른 이메일 주소를 입력해주세요.")
        return v

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
    token_type: str = "bearer"
