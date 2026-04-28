"""Public, read-only conversation share links.

One row == one shared conversation. Revoking a share deletes the row.
Deleting the parent conversation cascades via the FK.
"""

import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, String, TIMESTAMP

from app.core.database import Base
from app.models.guid import GUID


def _generate_share_token() -> str:
    """URL-safe 32-char random token (192 bits of entropy)."""
    return secrets.token_urlsafe(24)


class ConversationShare(Base):
    """A public, read-only snapshot handle for a conversation.

    The share uses an opaque, unguessable ``token`` — we never expose the
    underlying ``conversation_id`` to unauthenticated viewers.
    """

    __tablename__ = "conversation_shares"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(
        GUID(),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    created_by = Column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token = Column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
        default=_generate_share_token,
    )
    created_at = Column(
        TIMESTAMP,
        default=lambda: datetime.now(timezone.utc),
    )
