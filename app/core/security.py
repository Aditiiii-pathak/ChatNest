"""
JWT token management and password hashing utilities.

Uses bcrypt for passwords and HS256 JWTs via python-jose.
"""

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

import bcrypt
from jose import JWTError, jwt

from app.core.config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_MINUTES


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    # Salt is automatically generated and included in the hash string
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), 
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def create_access_token(
    user_id: UUID,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token for the given user."""
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=JWT_EXPIRE_MINUTES)
    )
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    """Decode a JWT and return the user-id subject, or None on failure."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None
