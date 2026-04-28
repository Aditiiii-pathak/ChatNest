"""User account model."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, TIMESTAMP
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.guid import GUID


class User(Base):
    """Registered user — owns conversations."""

    __tablename__ = "users"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    display_name = Column(String(100), nullable=True)
    created_at = Column(
        TIMESTAMP, 
        server_default=func.now(), 
        default=lambda: datetime.now(timezone.utc)
    )
