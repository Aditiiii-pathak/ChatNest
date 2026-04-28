"""Conversation summary model for memory compression."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Text, Boolean, Integer, TIMESTAMP, ForeignKey

from app.core.database import Base
from app.models.guid import GUID


class ConversationSummary(Base):
    """A compressed summary of a batch of messages.

    Stores importance score and key entities as JSON in metadata_json.
    """

    __tablename__ = "conversation_summaries"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(
        GUID(),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version = Column(Integer, nullable=False)
    summary_text = Column(Text, nullable=False)
    start_sequence = Column(Integer, nullable=False)
    end_sequence = Column(Integer, nullable=False)
    token_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    metadata_json = Column(Text, nullable=True)  # {"importance_score": 8, "key_entities": [...]}
    created_at = Column(
        TIMESTAMP, 
        default=lambda: datetime.now(timezone.utc)
    )
