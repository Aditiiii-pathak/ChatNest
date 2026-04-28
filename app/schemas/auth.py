"""Authentication request / response schemas."""

from typing import Optional
from uuid import UUID
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class UserRegister(BaseModel):
    """POST /auth/register body."""
    email: EmailStr
    password: str
    display_name: Optional[str] = None


class UserLogin(BaseModel):
    """POST /auth/login body."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """User profile returned in token and /auth/me responses."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: Optional[str]
    created_at: datetime

    @field_validator("created_at", mode="after")
    @classmethod
    def ensure_utc(cls, v: datetime) -> datetime:
        """Ensure the datetime is timezone-aware (UTC)."""
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class TokenResponse(BaseModel):
    """JWT token response from register / login."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
