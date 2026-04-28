"""Conversation model — a thread of messages owned by a user."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Text, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.guid import GUID


class Conversation(Base):
    """A single chat conversation."""

    __tablename__ = "conversations"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(Text, default="New Conversation")
    is_archived = Column(Boolean, default=False)
    current_summary_id = Column(
        GUID(),
        ForeignKey(
            "conversation_summaries.id",
            use_alter=True,
            name="fk_conv_current_summary",
        ),
        nullable=True,
    )
    created_at = Column(
        TIMESTAMP, 
        server_default=func.now(), 
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        TIMESTAMP, 
        server_default=func.now(), 
        onupdate=lambda: datetime.now(timezone.utc),
        default=lambda: datetime.now(timezone.utc)
    )
