"""Chat message model — a single user or assistant message."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, Boolean, Integer, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.guid import GUID


class Message(Base):
    """One message in a conversation (user or assistant)."""

    __tablename__ = "messages"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(
        GUID(),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(20), nullable=False)        # "user" | "assistant"
    content = Column(Text, nullable=False)
    token_count = Column(Integer, default=0)
    sequence_number = Column(Integer, nullable=False)
    is_deleted = Column(Boolean, default=False)
    is_compressed = Column(Boolean, default=False)
    created_at = Column(
        TIMESTAMP, 
        server_default=func.now(), 
        default=lambda: datetime.now(timezone.utc)
    )
