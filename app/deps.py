"""
Shared FastAPI dependencies.

- ``get_db``           — yields a SQLAlchemy session (auto-closed)
- ``get_current_user`` — decodes JWT bearer token → User object
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import decode_access_token
from app.models.user import User

_bearer_scheme = HTTPBearer()


def get_db():
    """Yield a SQLAlchemy database session, auto-closing on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Decode the JWT bearer token and return the authenticated ``User``.

    Raises:
        HTTPException 401: If the token is missing, invalid, or expired.
    """
    token = credentials.credentials
    user_id = decode_access_token(token)

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user
