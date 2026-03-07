from logging.config import fileConfig
from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.db.base import Base

# 반드시 모델 import (autogenerate/metadata용)
from app.models.user import User  # noqa: F401
from app.models.verification_doc import VerificationDoc  # noqa: F401
from app.models.meeting import Meeting  # noqa: F401
from app.models.meeting_slot import MeetingSlot  # noqa: F401
from app.models.deposit import Deposit  # noqa: F401
from app.models.confirmation import Confirmation  # noqa: F401
from app.models.chat_room import ChatRoom  # noqa: F401
from app.models.replacement_request import ReplacementRequest  # noqa: F401
from app.models.chat_message import ChatMessage  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = settings.database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section) or {},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
