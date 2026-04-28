"""Schemas for public conversation share links."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ShareResponse(BaseModel):
    """Returned to the owner after creating / fetching a share."""

    model_config = ConfigDict(from_attributes=True)

    conversation_id: UUID
    token: str
    created_at: datetime
    url: str  # ``/shared/<token>`` — rendered by the frontend


class ShareStatusResponse(BaseModel):
    """Returned from GET /conversations/{id}/share when no share exists."""

    conversation_id: UUID
    is_shared: bool
    token: Optional[str] = None
    url: Optional[str] = None
    created_at: Optional[datetime] = None


class PublicSharedMessage(BaseModel):
    """One message in a public shared conversation view."""

    role: str
    content: str
    sequence_number: int
    created_at: datetime


class PublicSharedConversation(BaseModel):
    """Read-only snapshot returned from GET /shared/{token} (no auth)."""

    title: Optional[str]
    created_at: datetime
    updated_at: datetime
    messages: List[PublicSharedMessage]
