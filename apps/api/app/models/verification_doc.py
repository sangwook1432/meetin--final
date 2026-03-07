import enum
from sqlalchemy import Integer, String, Enum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DocType(str, enum.Enum):
    ENROLLMENT_CERT = "ENROLLMENT_CERT"
    STUDENT_ID = "STUDENT_ID"


class DocStatus(str, enum.Enum):
    SUBMITTED = "SUBMITTED"
    REVIEWED = "REVIEWED"


class VerificationDoc(Base):
    __tablename__ = "verification_docs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    doc_type: Mapped[DocType] = mapped_column(Enum(DocType, name="doc_type_enum"))
    file_url: Mapped[str] = mapped_column(Text)

    status: Mapped[DocStatus] = mapped_column(
        Enum(DocStatus, name="doc_status_enum"),
        default=DocStatus.SUBMITTED,
    )

    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
