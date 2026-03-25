from pydantic import BaseModel
from app.models.verification_doc import DocType, DocStatus
from app.models.user import VerificationStatus


class DocUploadRequest(BaseModel):
    doc_type: DocType
    file_url: str  # MVP: 업로드는 나중, 지금은 URL만 받음


class VerificationDocOut(BaseModel):
    id: int
    user_id: int
    doc_type: DocType
    file_url: str
    status: DocStatus
    note: str | None = None

    class Config:
        from_attributes = True


class AdminVerificationAction(BaseModel):
    note: str | None = None


class AdminUserVerificationOut(BaseModel):
    user_id: int
    username: str | None = None
    nickname: str | None = None
    university: str | None = None
    major: str | None = None
    entry_year: int | None = None
    age: int | None = None
    verification_status: VerificationStatus
    doc_count: int
