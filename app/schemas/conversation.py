"""Conversation request / response schemas."""

from typing import Optional
from uuid import UUID
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, field_validator


class ConversationCreate(BaseModel):
    """Optional body for POST /conversations/."""
    title: Optional[str] = "New Conversation"


class ConversationResponse(BaseModel):
    """Full conversation object returned on creation."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    title: Optional[str]
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at", mode="after")
    @classmethod
    def ensure_utc(cls, v: datetime) -> datetime:
        """Ensure the datetime is timezone-aware (UTC)."""
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class ConversationListItem(BaseModel):
    """Slim conversation in the list endpoint."""
    conversation_id: UUID
    title: Optional[str]
    last_message_preview: Optional[str]
    updated_at: datetime

    @field_validator("updated_at", mode="after")
    @classmethod
    def ensure_utc(cls, v: datetime) -> datetime:
        """Ensure the datetime is timezone-aware (UTC)."""
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class ConversationUpdate(BaseModel):
    """Body for PATCH /conversations/{id}."""
    title: Optional[str] = None
    is_archived: Optional[bool] = None
