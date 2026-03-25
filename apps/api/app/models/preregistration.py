from datetime import datetime, timezone

from sqlalchemy import Boolean, String, Enum, Integer, Text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import Gender


class Preregistration(Base):
    __tablename__ = "preregistrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    phone_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    gender: Mapped[Gender] = mapped_column(Enum(Gender, name="gender_enum"), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
