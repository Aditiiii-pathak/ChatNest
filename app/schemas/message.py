"""Message request / response schemas.

Includes the public-facing Incognito Mode contract. When ``incognito=True``
the server MUST NOT persist anything, generate embeddings, or trigger
memory compression — see ``app/routers/messages.py`` for the conditional
pipeline.
"""

from typing import Optional, List, Literal
from uuid import UUID
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ── Behavior modes ────────────────────────────────────────────────────────────
# Keep this in sync with ``app.services.behavior_service._MODE_PROMPTS`` and
# the ``BehaviorMode`` type in ``frontend/src/types/index.ts``.
BehaviorMode = Literal[
    "default",
    "buddy",
    "emotional",
    "concise",
    "expert",
    "creative",
    "coding",
    "study",
]


# ── Requests ──────────────────────────────────────────────────────────────────
class MessageRequest(BaseModel):
    """POST /message/ body — send a user message.

    In **persistent mode** (``incognito=False``, the default) a
    ``conversation_id`` is required and the message is stored, embedded,
    and included in the long-term memory pipeline.

    In **incognito mode** (``incognito=True``):
      * ``conversation_id`` is ignored and MAY be omitted.
      * Nothing is written to the SQL database.
      * No embeddings are generated and Qdrant is never touched.
      * Memory compression is never triggered.
      * Past conversation context is **not** loaded.
      * Only the current input + active behavior prompt feed the LLM.
      * Optional: a volatile in-RAM session keyed by ``session_id`` can be
        used to keep short-lived turn history for the duration of the
        browser session. It is never persisted.
    """

    conversation_id: Optional[UUID] = None
    content: str = Field(..., min_length=1)

    # Privacy / behavior controls
    incognito: bool = False
    mode: BehaviorMode = "default"
    session_id: Optional[str] = Field(
        default=None,
        description=(
            "Optional client-generated id used only in incognito mode to keep "
            "a short-lived, RAM-only turn history. Never persisted."
        ),
        max_length=128,
    )

    @model_validator(mode="after")
    def _require_conversation_when_persistent(self) -> "MessageRequest":
        """A ``conversation_id`` is mandatory for persistent (non-incognito) chats."""
        if not self.incognito and self.conversation_id is None:
            raise ValueError(
                "conversation_id is required when incognito is false"
            )
        return self


class MessageEditRequest(BaseModel):
    """PUT /message/{id}/edit body."""
    content: str


# ── Responses ─────────────────────────────────────────────────────────────────
class MessageResponse(BaseModel):
    """Single persisted message returned from the API."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    role: str
    content: str
    token_count: Optional[int] = 0
    sequence_number: int
    created_at: datetime

    @field_validator("created_at", mode="after")
    @classmethod
    def ensure_utc(cls, v: datetime) -> datetime:
        """Ensure the datetime is timezone-aware (UTC)."""
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class AssistantReply(BaseModel):
    """Response from POST /message/ — both user and assistant messages."""
    user_message: MessageResponse
    assistant_message: MessageResponse


class IncognitoReply(BaseModel):
    """Ephemeral response for incognito chats.

    Contains no database IDs, timestamps are generated on the fly, and the
    payload is never written to storage.
    """
    incognito: Literal[True] = True
    mode: BehaviorMode
    emotion: str
    content: str
    session_id: Optional[str] = None
    token_count: int


class PaginatedMessages(BaseModel):
    """Paginated list of messages for GET /conversations/{id}."""
    messages: List[MessageResponse]
    total: int
    page: int
    page_size: int
    has_more: bool
