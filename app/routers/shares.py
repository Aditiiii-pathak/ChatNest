"""
Public conversation share-link endpoints.

Owner-scoped (auth required):
    POST   /conversations/{id}/share   — create or return the existing share
    GET    /conversations/{id}/share   — get the share status
    DELETE /conversations/{id}/share   — revoke the share

Public (no auth):
    GET    /shared/{token}             — read-only snapshot of the shared chat

Security notes:
    * Tokens are 192-bit URL-safe random strings — not guessable.
    * Revoking a share is permanent; re-sharing issues a new token.
    * Deleting the parent conversation cascades via the SQL FK and is also
      handled explicitly by ``conversations.delete_conversation``.
    * Incognito messages are never persisted so they can never leak through
      this endpoint. The public view only reads rows from the ``messages``
      table that belong to the shared conversation.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.share import ConversationShare
from app.schemas.share import (
    PublicSharedConversation,
    PublicSharedMessage,
    ShareResponse,
    ShareStatusResponse,
)

logger = logging.getLogger(__name__)

# ── Authed owner router ───────────────────────────────────────────────────────
owner_router = APIRouter(prefix="/conversations", tags=["Sharing"])


def _share_url(token: str) -> str:
    """Relative URL the frontend converts to an absolute link."""
    return f"/shared/{token}"


def _assert_ownership(
    db: Session, conversation_id: str, user: User
) -> Conversation:
    convo = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
        .first()
    )
    if not convo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    return convo


@owner_router.post(
    "/{conversation_id}/share",
    response_model=ShareResponse,
    status_code=status.HTTP_200_OK,
)
def create_share(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ShareResponse:
    """Create a share link (idempotent — returns the existing one if any)."""
    _assert_ownership(db, conversation_id, current_user)

    existing = (
        db.query(ConversationShare)
        .filter(ConversationShare.conversation_id == conversation_id)
        .first()
    )
    if existing:
        return ShareResponse(
            conversation_id=existing.conversation_id,
            token=existing.token,
            created_at=existing.created_at,
            url=_share_url(existing.token),
        )

    share = ConversationShare(
        conversation_id=conversation_id,
        created_by=current_user.id,
    )
    db.add(share)
    db.commit()
    db.refresh(share)

    return ShareResponse(
        conversation_id=share.conversation_id,
        token=share.token,
        created_at=share.created_at,
        url=_share_url(share.token),
    )


@owner_router.get(
    "/{conversation_id}/share",
    response_model=ShareStatusResponse,
)
def get_share_status(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ShareStatusResponse:
    """Return whether the conversation is currently shared."""
    _assert_ownership(db, conversation_id, current_user)

    share = (
        db.query(ConversationShare)
        .filter(ConversationShare.conversation_id == conversation_id)
        .first()
    )
    if not share:
        return ShareStatusResponse(
            conversation_id=conversation_id,  # type: ignore[arg-type]
            is_shared=False,
        )
    return ShareStatusResponse(
        conversation_id=share.conversation_id,
        is_shared=True,
        token=share.token,
        url=_share_url(share.token),
        created_at=share.created_at,
    )


@owner_router.delete("/{conversation_id}/share")
def revoke_share(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke the share link (re-sharing later issues a fresh token)."""
    _assert_ownership(db, conversation_id, current_user)

    deleted = (
        db.query(ConversationShare)
        .filter(ConversationShare.conversation_id == conversation_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"revoked": bool(deleted), "conversation_id": conversation_id}


# ── Public router (no auth) ───────────────────────────────────────────────────
public_router = APIRouter(prefix="/shared", tags=["Sharing · Public"])


@public_router.get(
    "/{token}",
    response_model=PublicSharedConversation,
)
def view_shared_conversation(
    token: str,
    db: Session = Depends(get_db),
) -> PublicSharedConversation:
    """Read-only snapshot — **no authentication required**.

    Returns 404 when the token is unknown or revoked. Never leaks any
    user info, the conversation UUID, or sibling conversation titles.
    """
    share = (
        db.query(ConversationShare)
        .filter(ConversationShare.token == token)
        .first()
    )
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This shared chat no longer exists.",
        )

    convo = (
        db.query(Conversation)
        .filter(Conversation.id == share.conversation_id)
        .first()
    )
    if not convo:
        # Parent conversation was deleted but share row survived somehow.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This shared chat no longer exists.",
        )

    messages = (
        db.query(Message)
        .filter(
            Message.conversation_id == convo.id,
            Message.is_deleted == False,  # noqa: E712
        )
        .order_by(Message.sequence_number.asc())
        .all()
    )

    return PublicSharedConversation(
        title=convo.title,
        created_at=convo.created_at,
        updated_at=convo.updated_at,
        messages=[
            PublicSharedMessage(
                role=m.role,
                content=m.content,
                sequence_number=m.sequence_number,
                created_at=m.created_at,
            )
            for m in messages
        ],
    )
