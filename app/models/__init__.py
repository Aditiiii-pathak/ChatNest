"""
Models package — re-exports every model and the Base for convenience.

Usage::

    from app.models import Base, User, Conversation, Message, ConversationSummary
"""

from app.core.database import Base  # noqa: F401
from app.models.guid import GUID  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.conversation import Conversation  # noqa: F401
from app.models.message import Message  # noqa: F401
from app.models.summary import ConversationSummary  # noqa: F401
from app.models.share import ConversationShare  # noqa: F401

__all__ = [
    "Base",
    "GUID",
    "User",
    "Conversation",
    "Message",
    "ConversationSummary",
    "ConversationShare",
]
